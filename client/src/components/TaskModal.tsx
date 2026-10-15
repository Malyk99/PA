import { useEffect, useMemo, useState } from "react";
import type { Comment, Task, TaskKind, TaskStatus, Urgency } from "../../../shared/types";
import { FIB, KIND_LABEL, STATUS_LABEL, URGENCY_LABEL } from "../../../shared/types";
import { api } from "../api";
import { useStore } from "../store";
import { Avatar } from "./ui";
import { mapsLink, shortDate, todayISO } from "../lib/format";

type Draft = Partial<Task>;

export function TaskModal({ taskId, draft, onClose }: { taskId?: number; draft?: Draft; onClose: () => void }) {
  const s = useStore();
  const existing = taskId ? s.tasks.find((t) => t.id === taskId) : undefined;
  const isNew = !taskId;
  const [form, setForm] = useState<Draft>(() =>
    existing ?? {
      title: "",
      description: "",
      status: "backlog",
      urgency: "week",
      kind: "general",
      points: null,
      assignee_id: s.me.access === "team" ? s.me.id : null,
      deadline: null,
      jornada_id: null,
      place_id: null,
      vehicle_id: null,
      heads_only: 0,
      ...draft,
    }
  );
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (existing) setForm(existing);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existing?.updated_at]);

  useEffect(() => {
    if (!taskId) return;
    api.get<Comment[]>(`/tasks/${taskId}/comments`).then(setComments).catch(() => {});
  }, [taskId, existing?.updated_at]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    document.body.classList.add("noscroll");
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.classList.remove("noscroll");
    };
  }, [onClose]);

  const isTeam = s.me.access === "team";
  const mine = existing?.assignee_id === s.me.id || existing?.assignee_id == null;
  const canEditAll = !isTeam || isNew || existing?.created_by === s.me.id;
  const canMove = !isTeam || mine;

  const set = <K extends keyof Task>(k: K, v: Task[K] | null) => setForm((f) => ({ ...f, [k]: v }));

  const futureJornadas = useMemo(() => {
    const t = todayISO();
    return s.jornadas.filter((j) => j.date >= t || j.id === form.jornada_id);
  }, [s.jornadas, form.jornada_id]);

  if (taskId && !existing) {
    return (
      <Modal onClose={onClose} title="Tarea">
        <p className="muted">Esta tarea ya no existe o no tienes acceso.</p>
      </Modal>
    );
  }

  async function save(patch?: Draft) {
    setErr("");
    setBusy(true);
    try {
      const body = patch ?? form;
      if (isNew) {
        await api.post("/tasks", body);
        s.toast("Tarea creada");
        await s.reloadTasks();
        onClose();
      } else {
        await api.put(`/tasks/${taskId}`, patch ?? diff(existing!, form));
        await s.reloadTasks();
        if (!patch) {
          s.toast("Guardado");
          onClose();
        }
      }
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function addComment() {
    if (!newComment.trim() || !taskId) return;
    try {
      setComments(await api.post<Comment[]>(`/tasks/${taskId}/comments`, { body: newComment }));
      setNewComment("");
      s.reloadTasks();
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  async function remove() {
    if (!taskId || !confirmDelete()) return;
    try {
      await api.del(`/tasks/${taskId}`);
      await s.reloadTasks();
      s.toast("Tarea borrada");
      onClose();
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  const place = s.places.find((p) => p.id === form.place_id);
  const deadlineDate = form.deadline?.split("T")[0] ?? "";
  const deadlineTime = form.deadline?.split("T")[1] ?? "";
  const setDeadline = (d: string, t: string) => set("deadline", d ? (t ? `${d}T${t}` : `${d}T23:59`) : null);

  return (
    <Modal onClose={onClose} title={isNew ? "Nueva tarea" : `Tarea #${taskId}`}>
      {!isNew && canMove && (
        <div className="status-row" role="group" aria-label="Estado">
          {(Object.keys(STATUS_LABEL) as TaskStatus[]).map((st) => (
            <button
              key={st}
              className={`seg ${form.status === st ? "on" : ""} st-${st}`}
              disabled={busy}
              onClick={() => {
                set("status", st);
                save({ status: st, ...(isTeam && existing?.assignee_id == null ? { assignee_id: s.me.id } : {}) });
              }}
            >
              {STATUS_LABEL[st]}
            </button>
          ))}
        </div>
      )}

      <label className="field">
        <span>Qué hay que hacer</span>
        <input autoFocus={isNew} value={form.title ?? ""} disabled={!canEditAll} onChange={(e) => set("title", e.target.value)} placeholder="Ej: Recoger vía circular en Movicam" />
      </label>

      <div className="grid2">
        <label className="field">
          <span>Responsable</span>
          <select
            value={form.assignee_id ?? ""}
            disabled={isTeam && !isNew && !mine}
            onChange={(e) => set("assignee_id", e.target.value ? Number(e.target.value) : null)}
          >
            <option value="">Sin asignar</option>
            {s.users
              .filter((u) => u.active && (!isTeam || u.id === s.me.id))
              .map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                  {u.role_title ? ` · ${u.role_title}` : ""}
                </option>
              ))}
          </select>
        </label>
        <label className="field">
          <span>Tipo</span>
          <select value={form.kind} disabled={!canEditAll} onChange={(e) => set("kind", e.target.value as TaskKind)}>
            {(Object.keys(KIND_LABEL) as TaskKind[]).map((k) => (
              <option key={k} value={k}>
                {KIND_LABEL[k]}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="field">
        <span>Urgencia</span>
        <div className="seg-row">
          {(Object.keys(URGENCY_LABEL) as Urgency[]).map((u) => (
            <button key={u} type="button" disabled={!canEditAll} className={`seg urg-${u} ${form.urgency === u ? "on" : ""}`} onClick={() => set("urgency", u)}>
              {URGENCY_LABEL[u]}
            </button>
          ))}
        </div>
      </div>

      <div className="field">
        <span>Tamaño (puntos)</span>
        <div className="seg-row fib">
          {FIB.map((p) => (
            <button key={p} type="button" disabled={!canEditAll} className={`seg ${form.points === p ? "on" : ""}`} onClick={() => set("points", form.points === p ? null : p)}>
              {p}
            </button>
          ))}
        </div>
        <small className="hint">1 = minutos · 3 = una hora · 8 = media jornada · 13+ = partirla en tareas más pequeñas</small>
      </div>

      <div className="grid2">
        <label className="field">
          <span>Jornada</span>
          <select value={form.jornada_id ?? ""} disabled={!canEditAll} onChange={(e) => set("jornada_id", e.target.value ? Number(e.target.value) : null)}>
            <option value="">Backlog (sin día)</option>
            {futureJornadas.map((j) => (
              <option key={j.id} value={j.id}>
                {shortDate(j.date)}
                {j.day_number ? ` · Día ${j.day_number}` : ""}
                {j.status === "draft" ? " (borrador)" : ""}
              </option>
            ))}
          </select>
        </label>
        <div className="field">
          <span>Límite</span>
          <div className="inline">
            <input type="date" value={deadlineDate} disabled={!canEditAll} onChange={(e) => setDeadline(e.target.value, deadlineTime === "23:59" ? "" : deadlineTime)} />
            <input type="time" value={deadlineTime === "23:59" ? "" : deadlineTime} disabled={!canEditAll || !deadlineDate} onChange={(e) => setDeadline(deadlineDate, e.target.value)} />
          </div>
        </div>
      </div>

      <div className="grid2">
        <label className="field">
          <span>Lugar / proveedor</span>
          <select value={form.place_id ?? ""} disabled={!canEditAll} onChange={(e) => set("place_id", e.target.value ? Number(e.target.value) : null)}>
            <option value="">—</option>
            {s.places.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
                {p.kind === "vendor" ? " (proveedor)" : ""}
              </option>
            ))}
          </select>
          {place?.address && (
            <a className="maplink" href={mapsLink(place.address, place.maps_url)} target="_blank" rel="noreferrer">
              {place.address}
            </a>
          )}
        </label>
        <label className="field">
          <span>Vehículo</span>
          <select value={form.vehicle_id ?? ""} disabled={!canEditAll} onChange={(e) => set("vehicle_id", e.target.value ? Number(e.target.value) : null)}>
            <option value="">—</option>
            {s.vehicles.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="field">
        <span>Notas</span>
        <textarea rows={3} value={form.description ?? ""} disabled={!canEditAll} onChange={(e) => set("description", e.target.value)} placeholder="Contexto, contacto del proveedor, qué recoger exactamente…" />
      </label>

      {!isTeam && (
        <label className="check">
          <input type="checkbox" checked={!!form.heads_only} onChange={(e) => set("heads_only", e.target.checked ? 1 : 0)} />
          Solo visible para jefatura y PAs
        </label>
      )}

      {err && <div className="error">{err}</div>}

      <div className="modal-actions">
        {!isNew && (isTeam ? existing?.created_by === s.me.id : true) && (
          <button className="btn ghost danger" onClick={remove}>
            Borrar
          </button>
        )}
        <span className="spacer" />
        <button className="btn ghost" onClick={onClose}>
          Cerrar
        </button>
        {(canEditAll || (canMove && isNew)) && (
          <button className="btn primary" disabled={busy || !form.title?.trim()} onClick={() => save()}>
            {isNew ? "Crear tarea" : "Guardar"}
          </button>
        )}
      </div>

      {!isNew && (
        <div className="thread">
          <h3>Conversación</h3>
          {comments.map((c) => (
            <div key={c.id} className={`comment ${c.system ? "sys" : ""}`}>
              {!c.system && <Avatar name={s.userName(c.user_id)} size={24} />}
              <div>
                {!c.system && <div className="comment-who">{s.userName(c.user_id) || "—"}</div>}
                <div className="comment-body">{c.body}</div>
                <div className="comment-when">{c.created_at.slice(5, 16).replace("-", "/")}</div>
              </div>
            </div>
          ))}
          <div className="comment-new">
            <textarea
              rows={2}
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              placeholder="Escribe una actualización: “Hecho, albarán en la oficina”"
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) addComment();
              }}
            />
            <button className="btn" disabled={!newComment.trim()} onClick={addComment}>
              Enviar
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}

function confirmDelete() {
  return window.confirm("¿Borrar esta tarea? No se puede deshacer.");
}

function diff(a: Task, b: Draft): Draft {
  const out: Draft = {};
  for (const k of Object.keys(b) as (keyof Task)[]) {
    if (b[k] !== a[k] && k !== "comment_count") (out as any)[k] = b[k];
  }
  return out;
}

export function Modal({ title, children, onClose, wide }: { title: string; children: React.ReactNode; onClose: () => void; wide?: boolean }) {
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${wide ? "wide" : ""}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="x" aria-label="Cerrar" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}
