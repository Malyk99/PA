import { useState } from "react";
import { useStore } from "../store";
import { api } from "../api";
import { Modal } from "../components/TaskModal";
import { Avatar, Section, copyText, sumPoints } from "../components/ui";
import { ACCESS_LABEL, type Access, type User } from "../../../shared/types";
import { telLink, waLink } from "../lib/format";

export function Equipo() {
  const s = useStore();
  const [editing, setEditing] = useState<Partial<User> | null>(null);
  const isHead = s.can("head");
  const active = s.users.filter((u) => u.active);
  const inactive = s.users.filter((u) => !u.active);

  return (
    <div className="page">
      <div className="board-head">
        <h1>Equipo</h1>
        {isHead && <button className="btn primary" onClick={() => setEditing({ name: "", role_title: "", department: "Producción", phone: "", access: "team", active: 1 })}>+ Persona</button>}
      </div>
      {isHead && (
        <p className="muted">
          Cada persona entra con su enlace personal, sin contraseña. Envíaselo por WhatsApp una vez; queda guardado en su móvil. Si alguien pierde el móvil, genera un enlace nuevo y el anterior deja de funcionar.
        </p>
      )}
      <Section title={<>Activos <span className="count">{active.length}</span></>}>
        <div className="people">
          {active.map((u) => <PersonRow key={u.id} u={u} onEdit={() => setEditing(u)} />)}
        </div>
      </Section>
      {inactive.length > 0 && (
        <Section title="Desactivados">
          <div className="people">{inactive.map((u) => <PersonRow key={u.id} u={u} onEdit={() => setEditing(u)} />)}</div>
        </Section>
      )}
      {editing && <PersonModal u={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function PersonRow({ u, onEdit }: { u: User; onEdit: () => void }) {
  const s = useStore();
  const link = u.token ? `${location.origin}/l/${u.token}` : "";
  const open = s.tasks.filter((t) => t.assignee_id === u.id && t.status !== "done");
  return (
    <div className="card person">
      <Avatar name={u.name} size={36} />
      <div className="person-main">
        <div className="person-name">{u.name} <span className={`chip acc-${u.access}`}>{ACCESS_LABEL[u.access]}</span></div>
        <div className="muted small">{[u.role_title, u.department, u.phone].filter(Boolean).join(" · ")}</div>
        <div className="muted small">{open.length} tareas abiertas · {sumPoints(open)} pts</div>
      </div>
      <div className="person-actions">
        {u.phone && <a className="btn sm ghost" href={telLink(u.phone)}>Llamar</a>}
        {link && (
          <>
            <button className="btn sm ghost" onClick={async () => s.toast((await copyText(link)) ? "Enlace copiado" : "No se pudo copiar")}>Copiar enlace</button>
            <a className="btn sm" href={waLink(`Hola ${u.name}, este es tu acceso a la app de producción (guárdalo, es personal):\n${link}`, u.phone)} target="_blank" rel="noreferrer">Enviar acceso</a>
          </>
        )}
        {s.can("head") && <button className="btn sm ghost" onClick={onEdit}>Editar</button>}
      </div>
    </div>
  );
}

function PersonModal({ u, onClose }: { u: Partial<User>; onClose: () => void }) {
  const s = useStore();
  const [f, setF] = useState(u);
  const [err, setErr] = useState("");
  const set = (p: Partial<User>) => setF((x) => ({ ...x, ...p }));
  async function save() {
    try {
      if (u.id) await api.put(`/users/${u.id}`, f);
      else await api.post(`/users`, f);
      await s.reloadMeta();
      onClose();
    } catch (e) {
      setErr((e as Error).message);
    }
  }
  return (
    <Modal title={u.id ? `Editar ${u.name}` : "Nueva persona"} onClose={onClose}>
      <div className="grid2">
        <label className="field"><span>Nombre (como sale en los mensajes)</span><input autoFocus value={f.name ?? ""} onChange={(e) => set({ name: e.target.value })} placeholder="ANGELA" /></label>
        <label className="field"><span>Teléfono</span><input value={f.phone ?? ""} onChange={(e) => set({ phone: e.target.value })} placeholder="+34 600 000 000" /></label>
        <label className="field"><span>Cargo</span><input value={f.role_title ?? ""} onChange={(e) => set({ role_title: e.target.value })} placeholder="Ayte. Producción" /></label>
        <label className="field"><span>Departamento</span><input value={f.department ?? ""} onChange={(e) => set({ department: e.target.value })} /></label>
      </div>
      <div className="field">
        <span>Acceso</span>
        <div className="seg-row">
          {(Object.keys(ACCESS_LABEL) as Access[]).map((a) => (
            <button key={a} className={`seg ${f.access === a ? "on" : ""}`} onClick={() => set({ access: a })}>{ACCESS_LABEL[a]}</button>
          ))}
        </div>
        <small className="hint">
          Jefatura: todo, incluido equipo y ajustes. PA / Ayte.: crea jornadas, mensajes y asigna tareas a cualquiera. Equipo: ve su día, mueve sus tareas y comenta.
        </small>
      </div>
      {u.id && (
        <label className="check"><input type="checkbox" checked={!!f.active} onChange={(e) => set({ active: e.target.checked ? 1 : 0 })} /> Activo (desactivar corta su acceso)</label>
      )}
      {err && <div className="error">{err}</div>}
      <div className="modal-actions">
        {u.id && (
          <button className="btn ghost" onClick={async () => { if (confirm("¿Generar un enlace nuevo? El anterior dejará de funcionar.")) { await api.post(`/users/${u.id}/regen`); await s.reloadMeta(); s.toast("Enlace nuevo generado"); onClose(); } }}>
            Nuevo enlace
          </button>
        )}
        <span className="spacer" />
        <button className="btn ghost" onClick={onClose}>Cancelar</button>
        <button className="btn primary" disabled={!f.name?.trim()} onClick={save}>Guardar</button>
      </div>
    </Modal>
  );
}
