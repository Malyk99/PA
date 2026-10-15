import { useMemo, useState } from "react";
import { useStore } from "../store";
import { api } from "../api";
import { TaskCard } from "../components/TaskCard";
import { TaskModal } from "../components/TaskModal";
import { sumPoints } from "../components/ui";
import { STATUS_LABEL, URGENCY_LABEL, type TaskStatus, type Urgency } from "../../../shared/types";
import { shortDate, todayISO } from "../lib/format";

const COLS: TaskStatus[] = ["backlog", "today", "doing", "blocked", "done"];

export function Tablero() {
  const s = useStore();
  const [who, setWho] = useState<string>("all"); // all | me | none | <id>
  const [jor, setJor] = useState<string>("all");
  const [urg, setUrg] = useState<string>("all");
  const [q, setQ] = useState("");
  const [creating, setCreating] = useState<TaskStatus | null>(null);
  const [over, setOver] = useState<TaskStatus | null>(null);
  const [showOldDone, setShowOldDone] = useState(false);

  const filtered = useMemo(() => {
    const t0 = todayISO();
    return s.tasks.filter((t) => {
      if (who === "me" && t.assignee_id !== s.me.id) return false;
      if (who === "none" && t.assignee_id) return false;
      if (!["all", "me", "none"].includes(who) && t.assignee_id !== Number(who)) return false;
      if (jor === "none" && t.jornada_id) return false;
      if (!["all", "none"].includes(jor) && t.jornada_id !== Number(jor)) return false;
      if (urg !== "all" && t.urgency !== urg) return false;
      if (q && !`${t.title} ${t.description}`.toLowerCase().includes(q.toLowerCase())) return false;
      // keep "Hecho" short: only things finished in the last 2 days unless asked
      if (t.status === "done" && !showOldDone && t.done_at && t.done_at.slice(0, 10) < addDaysISO(t0, -1)) return false;
      return true;
    });
  }, [s.tasks, who, jor, urg, q, s.me.id, showOldDone]);

  async function moveTo(id: number, status: TaskStatus) {
    const t = s.tasks.find((x) => x.id === id);
    if (!t || t.status === status) return;
    s.setTasks((ts) => ts.map((x) => (x.id === id ? { ...x, status } : x)));
    try {
      await api.put(`/tasks/${id}`, { status, ...(s.me.access === "team" && !t.assignee_id ? { assignee_id: s.me.id } : {}) });
    } catch (e) {
      s.toast((e as Error).message);
    }
    s.reloadTasks();
  }

  const futureJ = s.jornadas.filter((j) => j.date >= addDaysISO(todayISO(), -1));

  return (
    <div className="page board-page">
      <div className="board-head">
        <h1>Tablero</h1>
        <button className="btn primary" onClick={() => setCreating("backlog")}>
          + Nueva tarea
        </button>
      </div>

      <div className="filters">
        <div className="seg-row">
          {[
            ["all", "Todas"],
            ["me", "Mías"],
            ["none", "Sin asignar"],
          ].map(([k, l]) => (
            <button key={k} className={`seg ${who === k ? "on" : ""}`} onClick={() => setWho(k)}>
              {l}
            </button>
          ))}
        </div>
        <select value={["all", "me", "none"].includes(who) ? "" : who} onChange={(e) => setWho(e.target.value || "all")} aria-label="Persona">
          <option value="">Persona…</option>
          {s.users.filter((u) => u.active).map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </select>
        <select value={jor} onChange={(e) => setJor(e.target.value)} aria-label="Jornada">
          <option value="all">Todas las jornadas</option>
          <option value="none">Sin jornada</option>
          {futureJ.map((j) => (
            <option key={j.id} value={j.id}>
              {shortDate(j.date)}
              {j.day_number ? ` · Día ${j.day_number}` : ""}
            </option>
          ))}
        </select>
        <select value={urg} onChange={(e) => setUrg(e.target.value)} aria-label="Urgencia">
          <option value="all">Cualquier urgencia</option>
          {(Object.keys(URGENCY_LABEL) as Urgency[]).map((u) => (
            <option key={u} value={u}>
              {URGENCY_LABEL[u]}
            </option>
          ))}
        </select>
        <input className="search" type="search" placeholder="Buscar…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      <div className="board">
        {COLS.map((col) => {
          const items = filtered.filter((t) => t.status === col);
          return (
            <div
              key={col}
              className={`col col-${col} ${over === col ? "over" : ""}`}
              onDragOver={(e) => {
                e.preventDefault();
                setOver(col);
              }}
              onDragLeave={() => setOver((o) => (o === col ? null : o))}
              onDrop={(e) => {
                e.preventDefault();
                setOver(null);
                const id = Number(e.dataTransfer.getData("text/task"));
                if (id) moveTo(id, col);
              }}
            >
              <div className="col-head">
                <span className="col-title">{STATUS_LABEL[col]}</span>
                <span className="col-count">{items.length}</span>
                <span className="col-pts">{sumPoints(items)} pts</span>
                {col !== "done" && (
                  <button className="col-add" aria-label={`Añadir a ${STATUS_LABEL[col]}`} onClick={() => setCreating(col)}>
                    +
                  </button>
                )}
              </div>
              <div className="col-body">
                {items.map((t) => (
                  <TaskCard key={t.id} t={t} draggable />
                ))}
                {items.length === 0 && <div className="col-empty">Arrastra aquí</div>}
                {col === "done" && (
                  <button className="linkbtn" onClick={() => setShowOldDone((v) => !v)}>
                    {showOldDone ? "Ocultar antiguas" : "Ver todas las hechas"}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {creating && (
        <TaskModal
          draft={{
            status: creating,
            urgency: creating === "today" ? "today" : creating === "blocked" ? "blocker" : "week",
            jornada_id: creating === "today" ? s.jornadas.find((j) => j.date === todayISO())?.id ?? null : null,
          }}
          onClose={() => setCreating(null)}
        />
      )}
    </div>
  );
}

function addDaysISO(iso: string, n: number) {
  const d = new Date(iso + "T12:00:00");
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}
