import { useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "../store";
import { useJornada } from "../hooks";
import { api } from "../api";
import { go } from "../router";
import { TaskCard } from "../components/TaskCard";
import { TransportEditor } from "../components/TransportEditor";
import { TaskModal, Modal } from "../components/TaskModal";
import { Empty, Section, copyText, sumPoints } from "../components/ui";
import { addDays, longDate, mapsLink, normTime, shortDate, telLink, waLink } from "../lib/format";
import { personalMessage, teamMessage, truckMessage } from "../lib/messages";
import type { Call, DeptCall, JornadaFull, Run } from "../../../shared/types";

type Tab = "datos" | "citaciones" | "cositas" | "transporte" | "mensajes" | "docs";

export function JornadaPage({ id }: { id: number }) {
  const s = useStore();
  const { j: remote, error } = useJornada(id);
  const [j, setJ] = useState<JornadaFull | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<Tab>("datos");
  const editable = s.can("pa");

  // take server copy unless we have unsaved local edits
  useEffect(() => {
    if (remote && !dirty) setJ(remote);
  }, [remote, dirty]);

  if (error) return <div className="page"><Empty>{error}</Empty></div>;
  if (!j) return <div className="page"><Empty>Cargando…</Empty></div>;

  const upd = (patch: Partial<JornadaFull>) => {
    setJ((x) => (x ? { ...x, ...patch } : x));
    setDirty(true);
  };

  async function save() {
    if (!j) return;
    setSaving(true);
    try {
      const saved = await api.put<JornadaFull>(`/jornadas/${j.id}`, {
        ...j,
        calls: j.calls.map((c) => ({ ...c, start: normTime(c.start), end: normTime(c.end) })),
        dept_calls: j.dept_calls.map((d) => ({ ...d, time: normTime(d.time) })),
        runs: j.runs.map((r) => ({ ...r, time: normTime(r.time), arrival: normTime(r.arrival) })),
      });
      setJ(saved);
      setDirty(false);
      s.toast("Jornada guardada");
      s.reloadJornadas();
    } catch (e) {
      s.toast((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function publish(p: boolean) {
    if (dirty) await save();
    await api.post(`/jornadas/${j!.id}/publish`, { publish: p });
    s.toast(p ? "Publicada: el equipo ya la ve" : "Vuelve a borrador");
    s.reloadJornadas();
  }

  const tabs: [Tab, string][] = [
    ["datos", "Datos"],
    ["citaciones", "Citaciones"],
    ["cositas", "Cositas"],
    ["transporte", "Transporte"],
    ...(editable ? ([["mensajes", "Mensajes"]] as [Tab, string][]) : []),
    ["docs", "Documentos"],
  ];

  return (
    <div className="page jornada">
      <div className="jhead">
        <a href="#/jornadas" className="back">‹ Jornadas</a>
        <div className="jhead-main">
          <div>
            <div className="kicker">
              {j.day_number ? `Día ${j.day_number}${s.settings.total_days ? "/" + s.settings.total_days : ""} · ` : ""}
              {j.status === "draft" ? "Borrador" : `Publicada ${j.published_at?.slice(11, 16) ?? ""}`}
            </div>
            <h1>{longDate(j.date)}</h1>
          </div>
          {editable && (
            <div className="row gap wrap">
              {j.status === "draft" ? (
                <button className="btn primary" onClick={() => publish(true)}>Publicar</button>
              ) : (
                <button className="btn ghost" onClick={() => publish(false)}>Pasar a borrador</button>
              )}
            </div>
          )}
        </div>
        <div className="tabs" role="tablist">
          {tabs.map(([k, l]) => (
            <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}>
              {l}
              {k === "cositas" && <span className="tab-count">{s.tasks.filter((t) => t.jornada_id === j.id).length}</span>}
            </button>
          ))}
        </div>
      </div>

      {tab === "datos" && <Datos j={j} upd={upd} editable={editable} />}
      {tab === "citaciones" && <Citaciones j={j} upd={upd} editable={editable} />}
      {tab === "cositas" && <Cositas j={j} />}
      {tab === "transporte" && <TransportEditor j={j} upd={upd} editable={editable} dirty={dirty} />}
      {tab === "mensajes" && <Mensajes j={j} dirty={dirty} />}
      {tab === "docs" && <Docs j={j} editable={editable} />}

      {editable && dirty && (
        <div className="savebar">
          <span>Cambios sin guardar</span>
          <button className="btn ghost light" onClick={() => { setDirty(false); setJ(remote); }}>Descartar</button>
          <button className="btn primary" disabled={saving} onClick={save}>{saving ? "Guardando…" : "Guardar"}</button>
        </div>
      )}

      {editable && !dirty && <JornadaTools j={j} />}
    </div>
  );
}

// ---------------------------------------------------------------------------

function Datos({ j, upd, editable }: { j: JornadaFull; upd: (p: Partial<JornadaFull>) => void; editable: boolean }) {
  const s = useStore();
  const locations = s.places.filter((p) => p.kind === "location");
  const dis = !editable;
  return (
    <div className="form-grid">
      <Section title="Localización">
        <label className="field">
          <span>Localización guardada</span>
          <select
            disabled={dis}
            value={j.location_id ?? ""}
            onChange={(e) => {
              const p = s.places.find((x) => x.id === Number(e.target.value));
              upd({ location_id: p?.id ?? null, ...(p ? { location_text: p.name, address: p.address, maps_url: p.maps_url } : {}) });
            }}
          >
            <option value="">— Escribir a mano —</option>
            {locations.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </label>
        <div className="grid2">
          <label className="field">
            <span>Nombre</span>
            <input disabled={dis} value={j.location_text} onChange={(e) => upd({ location_text: e.target.value })} placeholder="Plató 7ª Media" />
          </label>
          <label className="field">
            <span>Dirección (sale en los mensajes)</span>
            <input disabled={dis} value={j.address} onChange={(e) => upd({ address: e.target.value })} placeholder="Calle José Isbert 4, Pozuelo" />
          </label>
        </div>
        <label className="field">
          <span>Enlace de Google Maps (opcional)</span>
          <input disabled={dis} value={j.maps_url} onChange={(e) => upd({ maps_url: e.target.value })} placeholder="https://maps.app.goo.gl/…" />
        </label>
        {(j.address || j.maps_url) && (
          <a className="maplink" href={mapsLink(j.address, j.maps_url)} target="_blank" rel="noreferrer">Abrir en Maps</a>
        )}
      </Section>

      <Section title="Horarios">
        <div className="grid4">
          <label className="field"><span>Día nº</span><input disabled={dis} type="number" value={j.day_number ?? ""} onChange={(e) => upd({ day_number: e.target.value ? Number(e.target.value) : null })} /></label>
          <label className="field"><span>Fecha</span><input disabled={dis} type="date" value={j.date} onChange={(e) => upd({ date: e.target.value })} /></label>
          <label className="field"><span>Rodaje desde</span><input disabled={dis} value={j.hours_start} onChange={(e) => upd({ hours_start: e.target.value })} placeholder="09:00" /></label>
          <label className="field"><span>hasta</span><input disabled={dis} value={j.hours_end} onChange={(e) => upd({ hours_end: e.target.value })} placeholder="19:00" /></label>
        </div>
        <div className="grid2">
          <label className="field"><span>Comidas</span><input disabled={dis} value={j.meals} onChange={(e) => upd({ meals: e.target.value })} placeholder="Desayuno 08:00 · Comida 14:30" /></label>
          <label className="field"><span>Meteo</span><input disabled={dis} value={j.weather} onChange={(e) => upd({ weather: e.target.value })} placeholder="Nublado, 15–27º" /></label>
        </div>
        <label className="field">
          <span>Aviso para el equipo (sale arriba en Mi día)</span>
          <textarea disabled={dis} rows={2} value={j.notes} onChange={(e) => upd({ notes: e.target.value })} placeholder="Ej: Hoy no hay catering, dietas." />
        </label>
      </Section>
    </div>
  );
}

// ---------------------------------------------------------------------------

function Citaciones({ j, upd, editable }: { j: JornadaFull; upd: (p: Partial<JornadaFull>) => void; editable: boolean }) {
  const s = useStore();
  const dis = !editable;
  const setCall = (i: number, p: Partial<Call>) => upd({ calls: j.calls.map((c, k) => (k === i ? { ...c, ...p } : c)) });
  const setDept = (i: number, p: Partial<DeptCall>) => upd({ dept_calls: j.dept_calls.map((c, k) => (k === i ? { ...c, ...p } : c)) });
  const missing = s.users.filter((u) => u.active && !j.calls.some((c) => c.user_id === u.id));

  return (
    <div className="form-grid">
      <Section
        title="Equipo de producción"
        right={editable && missing.length > 0 && (
          <button className="btn sm ghost" onClick={() => upd({ calls: [...j.calls, ...missing.map((u, i) => ({ id: -Date.now() - i, jornada_id: j.id, user_id: u.id, name: u.name, start: "", end: "", note: "", sort: 0 }))] })}>
            + Añadir a todos ({missing.length})
          </button>
        )}
      >
        <div className="rows">
          <div className="row-head calls-grid"><span>Persona</span><span>Entrada</span><span>Salida</span><span>Nota / OT</span><span /></div>
          {j.calls.map((c, i) => (
            <div className="calls-grid rowline" key={c.id ?? i}>
              <select
                disabled={dis}
                value={c.user_id ?? ""}
                onChange={(e) => {
                  const u = s.users.find((x) => x.id === Number(e.target.value));
                  setCall(i, { user_id: u?.id ?? null, name: u?.name ?? c.name });
                }}
              >
                <option value="">{c.name || "—"}</option>
                {s.users.filter((u) => u.active).map((u) => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
              </select>
              <input disabled={dis} inputMode="numeric" value={c.start} placeholder="--:--" onChange={(e) => setCall(i, { start: e.target.value })} />
              <input disabled={dis} inputMode="numeric" value={c.end} placeholder="--:--" onChange={(e) => setCall(i, { end: e.target.value })} />
              <input disabled={dis} value={c.note} placeholder="nota" onChange={(e) => setCall(i, { note: e.target.value })} />
              {editable && <button className="rm" aria-label="Quitar" onClick={() => upd({ calls: j.calls.filter((_, k) => k !== i) })}>×</button>}
            </div>
          ))}
          {editable && (
            <div className="row gap wrap">
              <button className="btn sm ghost" onClick={() => upd({ calls: [...j.calls, { id: -Date.now(), jornada_id: j.id, user_id: null, name: "", start: "", end: "", note: "", sort: 0 }] })}>+ Persona</button>
              <QuickShift onApply={(start, end) => upd({ calls: j.calls.map((c) => (c.start || c.note ? c : { ...c, start, end })) })} />
            </div>
          )}
        </div>
      </Section>

      <Section title="Camiones y departamentos">
        <div className="rows">
          <div className="grid2">
            <label className="field"><span>Jornada camiones desde</span><input disabled={dis} value={j.truck_start} placeholder={j.hours_start || "09:00"} onChange={(e) => upd({ truck_start: e.target.value })} /></label>
            <label className="field"><span>hasta</span><input disabled={dis} value={j.truck_end} placeholder={j.hours_end || "18:00"} onChange={(e) => upd({ truck_end: e.target.value })} /></label>
          </div>
          <div className="row-head dept-grid"><span>Hora</span><span>Departamento</span><span /></div>
          {j.dept_calls.map((d, i) => (
            <div className="dept-grid rowline" key={d.id ?? i}>
              <input disabled={dis} value={d.time} placeholder="07:45" onChange={(e) => setDept(i, { time: e.target.value })} />
              <input disabled={dis} value={d.label} placeholder="LUCES LISTO" list="dept-presets" onChange={(e) => setDept(i, { label: e.target.value })} />
              {editable && <button className="rm" aria-label="Quitar" onClick={() => upd({ dept_calls: j.dept_calls.filter((_, k) => k !== i) })}>×</button>}
            </div>
          ))}
          <datalist id="dept-presets">
            {["PRODUCCIÓN", "CÁMARA LISTO", "LUCES LISTO", "VESTUARIO LISTO", "MAQUINISTAS LISTO", "ARTE LISTO", "SONIDO LISTO", "CATERING"].map((x) => <option key={x} value={x} />)}
          </datalist>
          {editable && <button className="btn sm ghost" onClick={() => upd({ dept_calls: [...j.dept_calls, { id: -Date.now(), jornada_id: j.id, label: "", time: "", sort: 0 }] })}>+ Departamento</button>}
          <label className="field">
            <span>Abrirá</span>
            <select disabled={dis} value={j.opener_id ?? ""} onChange={(e) => upd({ opener_id: e.target.value ? Number(e.target.value) : null })}>
              <option value="">—</option>
              {s.users.filter((u) => u.active).map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </label>
          <label className="field">
            <span>Notas para camiones</span>
            <textarea disabled={dis} rows={2} value={j.truck_notes} onChange={(e) => upd({ truck_notes: e.target.value })} placeholder="Aparcar en la parte trasera del edificio…" />
          </label>
        </div>
      </Section>
    </div>
  );
}

function QuickShift({ onApply }: { onApply: (s: string, e: string) => void }) {
  const [a, setA] = useState("07:30");
  const [b, setB] = useState("17:30");
  return (
    <span className="quickshift">
      <span className="muted small">Rellenar vacíos con</span>
      <input value={a} onChange={(e) => setA(e.target.value)} aria-label="Entrada" />
      <input value={b} onChange={(e) => setB(e.target.value)} aria-label="Salida" />
      <button className="btn sm ghost" onClick={() => onApply(normTime(a), normTime(b))}>Aplicar</button>
    </span>
  );
}

// ---------------------------------------------------------------------------

function Cositas({ j }: { j: JornadaFull }) {
  const s = useStore();
  const [creating, setCreating] = useState(false);
  const [picking, setPicking] = useState(false);
  const list = s.tasks.filter((t) => t.jornada_id === j.id);
  const open = list.filter((t) => t.status !== "done");
  return (
    <div>
      <Section
        title={<>Cositas del día <span className="count">{open.length}</span> <span className="muted small">{sumPoints(open)} pts</span></>}
        right={
          <div className="row gap">
            {s.can("pa") && <button className="btn sm ghost" onClick={() => setPicking(true)}>Traer del backlog</button>}
            <button className="btn sm" onClick={() => setCreating(true)}>+ Cosita</button>
          </div>
        }
      >
        {list.length === 0 ? (
          <Empty>Sin cositas. Añade montajes, recogidas y devoluciones; salen solas en el mensaje del equipo.</Empty>
        ) : (
          <div className="stack">
            {list.map((t) => <TaskCard key={t.id} t={t} />)}
          </div>
        )}
      </Section>
      {creating && <TaskModal draft={{ jornada_id: j.id, status: "today", urgency: "today", kind: "recogida" }} onClose={() => setCreating(false)} />}
      {picking && <BacklogPicker j={j} onClose={() => setPicking(false)} />}
    </div>
  );
}

function BacklogPicker({ j, onClose }: { j: JornadaFull; onClose: () => void }) {
  const s = useStore();
  const items = s.tasks.filter((t) => !t.jornada_id && t.status !== "done");
  const [sel, setSel] = useState<Set<number>>(new Set());
  async function apply() {
    for (const id of sel) await api.put(`/tasks/${id}`, { jornada_id: j.id });
    await s.reloadTasks();
    s.toast(`${sel.size} tarea(s) programadas para el ${shortDate(j.date)}`);
    onClose();
  }
  return (
    <Modal title={`Programar para ${shortDate(j.date)}`} onClose={onClose}>
      {items.length === 0 ? (
        <Empty>El backlog está vacío.</Empty>
      ) : (
        <div className="pick-list">
          {items.map((t) => (
            <label key={t.id} className={`pick ${t.carried_over ? "carried" : ""}`}>
              <input type="checkbox" checked={sel.has(t.id)} onChange={(e) => { const n = new Set(sel); e.target.checked ? n.add(t.id) : n.delete(t.id); setSel(n); }} />
              <span className="pick-title">{t.title}</span>
              <span className="muted small">{[s.userName(t.assignee_id), t.points ? `${t.points} pts` : "", t.carried_over ? "arrastrada" : ""].filter(Boolean).join(" · ")}</span>
            </label>
          ))}
        </div>
      )}
      <div className="modal-actions">
        <span className="spacer" />
        <button className="btn ghost" onClick={onClose}>Cancelar</button>
        <button className="btn primary" disabled={!sel.size} onClick={apply}>Programar {sel.size || ""}</button>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------

function Mensajes({ j, dirty }: { j: JornadaFull; dirty: boolean }) {
  const s = useStore();
  const [withTasks, setWithTasks] = useState(true);
  const [withLink, setWithLink] = useState(true);
  const ctx = { users: s.users, places: s.places, vehicles: s.vehicles, settings: s.settings };
  const footer = withLink ? `Tu día y tus tareas: ${location.origin}` : undefined;
  const genTeam = useMemo(() => teamMessage(j, s.tasks, ctx, { includeTasks: withTasks, footer }), [j, s.tasks, withTasks, footer, s.users, s.places, s.vehicles, s.settings]); // eslint-disable-line react-hooks/exhaustive-deps
  const genTruck = useMemo(() => truckMessage(j, ctx), [j, s.users, s.settings]); // eslint-disable-line react-hooks/exhaustive-deps
  const people = j.calls.filter((c) => c.user_id).map((c) => s.users.find((u) => u.id === c.user_id)!).filter(Boolean);

  return (
    <div>
      {dirty && <div className="note-banner">Tienes cambios sin guardar. Los mensajes ya los incluyen, pero guarda para que el equipo los vea en la app.</div>}
      {j.status === "draft" && <div className="note-banner soft">La jornada está en borrador: el equipo no la ve en la app hasta que la publiques.</div>}
      <div className="msg-grid">
        <MessageBox
          title="Equipo de producción"
          text={genTeam}
          options={
            <>
              <label className="check"><input type="checkbox" checked={withTasks} onChange={(e) => setWithTasks(e.target.checked)} /> Incluir cositas</label>
              <label className="check"><input type="checkbox" checked={withLink} onChange={(e) => setWithLink(e.target.checked)} /> Enlace a la app</label>
            </>
          }
        />
        <MessageBox title="Camiones" text={genTruck} />
      </div>
      {people.length > 0 && (
        <Section title="Mensajes individuales" right={<span className="muted small">Abre WhatsApp con su citación y sus cositas</span>}>
          <div className="people-msgs">
            {people.map((u) => (
              <a key={u.id} className={`chip-btn ${u.phone ? "" : "nophone"}`} href={waLink(personalMessage(j, u, s.tasks, ctx) + (withLink && u.token ? `\n\nTu enlace: ${location.origin}/l/${u.token}` : ""), u.phone)} target="_blank" rel="noreferrer" title={u.phone ? u.phone : "Sin teléfono: elegirás el contacto en WhatsApp"}>
                {u.name}
              </a>
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}

function MessageBox({ title, text, options }: { title: string; text: string; options?: React.ReactNode }) {
  const s = useStore();
  const [val, setVal] = useState(text);
  const [edited, setEdited] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (!edited) setVal(text);
  }, [text, edited]);
  return (
    <div className="card msgbox">
      <div className="msgbox-head">
        <h3>{title}</h3>
        {edited && <button className="linkbtn" onClick={() => { setEdited(false); setVal(text); }}>Regenerar</button>}
      </div>
      {options && <div className="row gap wrap opts">{options}</div>}
      <textarea ref={ref} className="msg" value={val} rows={Math.min(28, val.split("\n").length + 1)} onChange={(e) => { setVal(e.target.value); setEdited(true); }} />
      <div className="row gap">
        <button className="btn" onClick={async () => s.toast((await copyText(val)) ? "Copiado. Pégalo en el grupo." : "No se pudo copiar")}>Copiar</button>
        <a className="btn primary" href={waLink(val)} target="_blank" rel="noreferrer">Abrir en WhatsApp</a>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function Docs({ j, editable }: { j: JornadaFull; editable: boolean }) {
  const s = useStore();
  const [label, setLabel] = useState("Orden de rodaje");
  const [busy, setBusy] = useState(false);
  async function upload(f: File) {
    setBusy(true);
    const fd = new FormData();
    fd.append("file", f);
    fd.append("label", label);
    try {
      await api.post(`/jornadas/${j.id}/attachments`, fd);
      s.toast("Documento subido");
      s.reloadJornadas();
    } catch (e) {
      s.toast((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Section title="Documentos">
      {j.attachments.length === 0 ? (
        <Empty>Sin documentos. Sube aquí la orden de rodaje u otros PDFs del día; el equipo los puede abrir y descargar.</Empty>
      ) : (
        <div className="docs">
          {j.attachments.map((a) => (
            <div key={a.id} className="doc">
              <span className="doc-ext">{a.filename.split(".").pop()?.toUpperCase()}</span>
              <a className="doc-name" href={`/files/${a.id}`} target="_blank" rel="noreferrer">{a.label || a.filename}<small>{a.filename}</small></a>
              <a className="btn sm ghost" href={`/files/${a.id}?download=1`}>Descargar</a>
              {editable && <button className="rm" aria-label="Borrar" onClick={async () => { if (confirm("¿Borrar documento?")) { await api.del(`/attachments/${a.id}`); s.reloadJornadas(); } }}>×</button>}
            </div>
          ))}
        </div>
      )}
      {j.runs.length > 0 && (
        <a className="doc generated" href={`#/jornada/${j.id}/transporte`}>
          <span className="doc-ext">PDF</span>
          <span className="doc-name">Orden de transporte (generada)<small>Se actualiza sola con los cambios</small></span>
        </a>
      )}
      {editable && (
        <div className="upload">
          <select value={label} onChange={(e) => setLabel(e.target.value)}>
            {["Orden de rodaje", "Orden de transporte", "Plan de rodaje", "Plano de localización", "Otro"].map((x) => <option key={x}>{x}</option>)}
          </select>
          <label className={`btn ${busy ? "disabled" : ""}`}>
            {busy ? "Subiendo…" : "Subir archivo"}
            <input type="file" hidden accept=".pdf,image/*,.xlsx,.xls,.docx" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
          </label>
        </div>
      )}
    </Section>
  );
}

// ---------------------------------------------------------------------------

function JornadaTools({ j }: { j: JornadaFull }) {
  const s = useStore();
  const [dup, setDup] = useState(false);
  const [date, setDate] = useState(addDays(j.date, 1));
  const [err, setErr] = useState("");
  return (
    <div className="tools">
      <button className="linkbtn" onClick={() => setDup(true)}>Duplicar a otra fecha</button>
      {s.can("head") && (
        <button
          className="linkbtn danger"
          onClick={async () => {
            if (!confirm("¿Borrar esta jornada? Las cositas vuelven al backlog.")) return;
            await api.del(`/jornadas/${j.id}`);
            await s.reloadJornadas();
            go("/jornadas");
          }}
        >
          Borrar jornada
        </button>
      )}
      {dup && (
        <Modal title="Duplicar jornada" onClose={() => setDup(false)}>
          <label className="field"><span>Nueva fecha</span><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
          {err && <div className="error">{err}</div>}
          <div className="modal-actions">
            <span className="spacer" />
            <button className="btn ghost" onClick={() => setDup(false)}>Cancelar</button>
            <button className="btn primary" onClick={async () => {
              try {
                const nj = await api.post<JornadaFull>(`/jornadas/${j.id}/duplicate`, { date });
                await s.reloadJornadas();
                setDup(false);
                go(`/jornada/${nj.id}`);
              } catch (e) { setErr((e as Error).message); }
            }}>Duplicar</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
