import { useState } from "react";
import { useStore } from "../store";
import { api } from "../api";
import { go } from "../router";
import { Empty, Section } from "../components/ui";
import { Modal } from "../components/TaskModal";
import { addDays, longDate, shortDate, todayISO } from "../lib/format";
import type { JornadaFull } from "../../../shared/types";

export function Jornadas() {
  const s = useStore();
  const t0 = todayISO();
  const [showPast, setShowPast] = useState(false);
  const [creating, setCreating] = useState(false);
  const upcoming = s.jornadas.filter((j) => j.date >= t0);
  const past = s.jornadas.filter((j) => j.date < t0).reverse();

  return (
    <div className="page">
      <div className="board-head">
        <h1>Jornadas</h1>
        {s.can("pa") && (
          <button className="btn primary" onClick={() => setCreating(true)}>
            + Nueva jornada
          </button>
        )}
      </div>

      <Section title="Próximas">
        {upcoming.length === 0 ? <Empty>No hay jornadas próximas.</Empty> : <List items={upcoming} />}
      </Section>

      {past.length > 0 && (
        <Section title="Anteriores" right={<button className="linkbtn" onClick={() => setShowPast((v) => !v)}>{showPast ? "Ocultar" : `Ver ${past.length}`}</button>}>
          {showPast && <List items={past} />}
        </Section>
      )}

      {creating && <NewJornada onClose={() => setCreating(false)} />}
    </div>
  );
}

function List({ items }: { items: ReturnType<typeof useStore>["jornadas"] }) {
  const t0 = todayISO();
  return (
    <div className="jlist">
      {items.map((j) => (
        <a key={j.id} href={`#/jornada/${j.id}`} className={`card jrow ${j.date === t0 ? "is-today" : ""}`}>
          <div className="jdate">
            <span className="jdow">{shortDate(j.date).split(" ")[0]}</span>
            <span className="jdom">{Number(j.date.slice(8))}</span>
          </div>
          <div className="jmain">
            <div className="jtitle">
              {j.day_number ? `Día ${j.day_number}` : "Jornada"}
              {j.date === t0 && <span className="chip today-chip">Hoy</span>}
              {j.status === "draft" ? <span className="chip draft">Borrador</span> : <span className="chip pub">Publicada</span>}
            </div>
            <div className="jloc">{j.location_text || j.address || "Sin localización"}</div>
          </div>
          <div className="jside">
            <div className="jhours">
              {j.hours_start}
              {j.hours_end ? `–${j.hours_end}` : ""}
            </div>
            {j.task_count > 0 && (
              <div className="muted small">
                {j.task_done}/{j.task_count} cositas
              </div>
            )}
          </div>
        </a>
      ))}
    </div>
  );
}

function NewJornada({ onClose }: { onClose: () => void }) {
  const s = useStore();
  const last = s.jornadas[s.jornadas.length - 1];
  const [date, setDate] = useState(last ? addDays(last.date, 1) : todayISO());
  const [from, setFrom] = useState<string>(last ? String(last.id) : "");
  const [err, setErr] = useState("");

  async function create() {
    setErr("");
    try {
      const j = from
        ? await api.post<JornadaFull>(`/jornadas/${from}/duplicate`, { date })
        : await api.post<JornadaFull>("/jornadas", { date, day_number: last?.day_number ? last.day_number + 1 : null });
      await s.reloadJornadas();
      onClose();
      go(`/jornada/${j.id}`);
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  return (
    <Modal title="Nueva jornada" onClose={onClose}>
      <label className="field">
        <span>Fecha</span>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        <small className="hint">{date && longDate(date)}</small>
      </label>
      <label className="field">
        <span>Partir de</span>
        <select value={from} onChange={(e) => setFrom(e.target.value)}>
          <option value="">Jornada en blanco</option>
          {[...s.jornadas].reverse().map((j) => (
            <option key={j.id} value={j.id}>
              Duplicar {shortDate(j.date)}
              {j.day_number ? ` · Día ${j.day_number}` : ""}
            </option>
          ))}
        </select>
        <small className="hint">Duplicar copia localización, horarios, citaciones del equipo y de camiones. El transporte de actores no se copia.</small>
      </label>
      {err && <div className="error">{err}</div>}
      <div className="modal-actions">
        <span className="spacer" />
        <button className="btn ghost" onClick={onClose}>Cancelar</button>
        <button className="btn primary" onClick={create} disabled={!date}>Crear</button>
      </div>
    </Modal>
  );
}
