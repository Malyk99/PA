import { useState } from "react";
import { useStore } from "../store";
import { api } from "../api";
import { Section } from "../components/ui";
import type { Settings } from "../../../shared/types";

export function Ajustes() {
  const s = useStore();
  const [f, setF] = useState<Settings>(s.settings);
  const set = (p: Partial<Settings>) => setF((x) => ({ ...x, ...p }));
  if (!s.can("head")) return <div className="page">Solo jefatura.</div>;
  return (
    <div className="page narrow">
      <h1>Ajustes de producción</h1>
      <Section title="Producción">
        <div className="grid2">
          <label className="field"><span>Título</span><input value={f.production_name} onChange={(e) => set({ production_name: e.target.value })} /></label>
          <label className="field"><span>Productora</span><input value={f.production_company} onChange={(e) => set({ production_company: e.target.value })} /></label>
          <label className="field"><span>Días de rodaje totales</span><input value={f.total_days} onChange={(e) => set({ total_days: e.target.value })} inputMode="numeric" /></label>
          <label className="field"><span>Oficina de producción</span><input value={f.office_address} onChange={(e) => set({ office_address: e.target.value })} /></label>
        </div>
        <label className="field">
          <span>Contactos de producción en la orden de transporte (un nombre por línea)</span>
          <textarea rows={3} value={f.production_contacts} onChange={(e) => set({ production_contacts: e.target.value })} />
          <small className="hint">Si el nombre coincide con alguien del equipo, se añade su teléfono automáticamente.</small>
        </label>
      </Section>
      <Section title="Cierre de los mensajes">
        <div className="grid2">
          <label className="field"><span>Mensaje del equipo</span><textarea rows={4} value={f.signoff_team} onChange={(e) => set({ signoff_team: e.target.value })} /></label>
          <label className="field"><span>Mensaje de camiones</span><textarea rows={4} value={f.signoff_trucks} onChange={(e) => set({ signoff_trucks: e.target.value })} /></label>
        </div>
      </Section>
      <button className="btn primary" onClick={async () => { await api.put("/settings", f); await s.reloadMeta(); s.toast("Ajustes guardados"); }}>Guardar</button>
      <Section title="Copia de seguridad">
        <p className="muted small">Descarga una copia completa de la base de datos (jornadas, tareas, equipo, directorio). Hazlo al final de cada semana de rodaje y guárdala en Drive.</p>
        <a className="btn ghost" href="/api/backup">Descargar copia (.db)</a>
      </Section>
    </div>
  );
}
