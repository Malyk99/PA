import { useMemo, useState } from "react";
import { useStore } from "../store";
import { api } from "../api";
import { Modal } from "../components/TaskModal";
import { Empty, Section } from "../components/ui";
import { telLink } from "../lib/format";
import type { Contact } from "../../../shared/types";

const GROUPS = ["Reparto", "Figuración", "Equipo", "Conductores", "Otro"];

export function Directorio() {
  const s = useStore();
  const [q, setQ] = useState("");
  const [grp, setGrp] = useState("all");
  const [editing, setEditing] = useState<Partial<Contact> | null>(null);
  const [importing, setImporting] = useState(false);

  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    return s.contacts.filter((c) => (grp === "all" || c.grp === grp) && (!t || `${c.code} ${c.name} ${c.address} ${c.phone}`.toLowerCase().includes(t)));
  }, [s.contacts, q, grp]);

  if (!s.can("pa")) return <div className="page"><Empty>Solo jefatura y PAs.</Empty></div>;

  const groups = Array.from(new Set([...GROUPS, ...s.contacts.map((c) => c.grp)]));

  return (
    <div className="page">
      <div className="board-head">
        <h1>Directorio</h1>
        <div className="row gap">
          <button className="btn ghost" onClick={() => setImporting(true)}>Importar Excel</button>
          <button className="btn primary" onClick={() => setEditing({ code: "", name: "", phone: "", address: "", grp: "Reparto", notes: "" })}>+ Contacto</button>
        </div>
      </div>
      <p className="muted">Reparto, figuración y conductores con su código. En la orden de transporte escribes el código y se rellenan nombre, teléfono y dirección. Solo lo ven jefatura y PAs.</p>
      <div className="filters">
        <input className="search" type="search" placeholder="Buscar código, nombre, dirección…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select value={grp} onChange={(e) => setGrp(e.target.value)} aria-label="Grupo">
          <option value="all">Todos ({s.contacts.length})</option>
          {groups.map((g) => <option key={g} value={g}>{g} ({s.contacts.filter((c) => c.grp === g).length})</option>)}
        </select>
      </div>
      <Section title={<>Contactos <span className="count">{list.length}</span></>}>
        {list.length === 0 ? (
          <Empty>{s.contacts.length ? "Nada coincide." : "Vacío. Importa la pestaña ACTORES de tu orden de transporte en Excel, o añade contactos a mano."}</Empty>
        ) : (
          <div className="dir-table">
            {list.map((c) => (
              <div key={c.id} className="dir-row" onClick={() => setEditing(c)} role="button" tabIndex={0} onKeyDown={(e) => e.key === "Enter" && setEditing(c)}>
                <span className="dir-code">{c.code || "—"}</span>
                <span className="dir-name">{c.name}<small>{c.grp}</small></span>
                <span className="dir-addr">{c.address}</span>
                <span className="dir-phone">{c.phone && <a href={telLink(c.phone)} onClick={(e) => e.stopPropagation()}>{c.phone}</a>}</span>
              </div>
            ))}
          </div>
        )}
      </Section>
      {editing && <ContactModal c={editing} groups={groups} onClose={() => setEditing(null)} />}
      {importing && <ImportModal onClose={() => setImporting(false)} />}
    </div>
  );
}

function ContactModal({ c, groups, onClose }: { c: Partial<Contact>; groups: string[]; onClose: () => void }) {
  const s = useStore();
  const [f, setF] = useState(c);
  const [err, setErr] = useState("");
  const set = (p: Partial<Contact>) => setF((x) => ({ ...x, ...p }));
  const dupe = f.code && s.contacts.some((x) => x.code === f.code && x.id !== c.id);
  return (
    <Modal title={c.id ? `${c.code ? c.code + " · " : ""}${c.name}` : "Nuevo contacto"} onClose={onClose}>
      <div className="grid2">
        <label className="field"><span>Código</span><input autoFocus value={f.code ?? ""} onChange={(e) => set({ code: e.target.value })} placeholder="24, PE, 1053…" />{dupe && <small className="hint" style={{ color: "var(--red)" }}>Ya hay otro contacto con este código</small>}</label>
        <label className="field"><span>Grupo</span><select value={f.grp} onChange={(e) => set({ grp: e.target.value })}>{groups.map((g) => <option key={g}>{g}</option>)}</select></label>
      </div>
      <label className="field"><span>Nombre (como sale en la orden)</span><input value={f.name ?? ""} onChange={(e) => set({ name: e.target.value })} placeholder="4. YON - LUIS FERNÁNDEZ" /></label>
      <label className="field"><span>Teléfono</span><input value={f.phone ?? ""} onChange={(e) => set({ phone: e.target.value })} /></label>
      <label className="field"><span>Dirección de recogida</span><input value={f.address ?? ""} onChange={(e) => set({ address: e.target.value })} /></label>
      <label className="field"><span>Notas</span><input value={f.notes ?? ""} onChange={(e) => set({ notes: e.target.value })} placeholder="Avisar al representante, portal B…" /></label>
      {err && <div className="error">{err}</div>}
      <div className="modal-actions">
        {c.id && <button className="btn ghost danger" onClick={async () => { if (confirm("¿Borrar contacto?")) { await api.del(`/contacts/${c.id}`); await s.reloadContacts(); onClose(); } }}>Borrar</button>}
        <span className="spacer" />
        <button className="btn ghost" onClick={onClose}>Cancelar</button>
        <button className="btn primary" onClick={async () => {
          try {
            if (c.id) await api.put(`/contacts/${c.id}`, f); else await api.post("/contacts", f);
            await s.reloadContacts();
            onClose();
          } catch (e) { setErr((e as Error).message); }
        }}>Guardar</button>
      </div>
    </Modal>
  );
}

function ImportModal({ onClose }: { onClose: () => void }) {
  const s = useStore();
  const [file, setFile] = useState<File | null>(null);
  const [replace, setReplace] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  async function run() {
    if (!file) return;
    setBusy(true); setErr(""); setMsg("");
    const fd = new FormData();
    fd.append("file", file);
    fd.append("mode", replace ? "replace" : "merge");
    try {
      const r = await api.post<{ sheet: string; added: number; updated: number; total: number }>("/contacts/import", fd);
      setMsg(`Pestaña "${r.sheet}": ${r.added} nuevos, ${r.updated} actualizados.`);
      await s.reloadContacts();
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }
  return (
    <Modal title="Importar desde Excel" onClose={onClose}>
      <p className="muted small">Sube tu orden de transporte en Excel (o cualquier hoja con columnas de código y nombre). Se lee la pestaña ACTORES: ACRÓNIMO, NOMBRE y DIRECCIÓN. Si hay teléfono dentro del nombre, se separa solo.</p>
      <label className="field"><span>Archivo .xlsx</span><input type="file" accept=".xlsx" onChange={(e) => setFile(e.target.files?.[0] ?? null)} /></label>
      <label className="check"><input type="checkbox" checked={replace} onChange={(e) => setReplace(e.target.checked)} /> Reemplazar todo el directorio (si no, añade y actualiza por código)</label>
      {msg && <div className="note-banner soft" style={{ marginTop: 10 }}>{msg}</div>}
      {err && <div className="error" style={{ marginTop: 10 }}>{err}</div>}
      <div className="modal-actions">
        <span className="spacer" />
        <button className="btn ghost" onClick={onClose}>{msg ? "Hecho" : "Cancelar"}</button>
        <button className="btn primary" disabled={!file || busy} onClick={run}>{busy ? "Importando…" : "Importar"}</button>
      </div>
    </Modal>
  );
}
