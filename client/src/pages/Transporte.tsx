import { useStore } from "../store";
import { useJornada } from "../hooks";
import { longDate, mapsLink } from "../lib/format";
import { groupByVehicle, runLabels } from "../../../shared/transport";

export function Transporte({ id }: { id: number }) {
  const s = useStore();
  const { j, error } = useJornada(id);
  if (error) return <div className="page">{error}</div>;
  if (!j) return <div className="page">Cargando…</div>;

  const groups = groupByVehicle(j.runs);
  const labels = runLabels(j.runs);
  const contacts = s.settings.production_contacts
    .split("\n")
    .map((x) => x.trim())
    .filter(Boolean)
    .map((line) => {
      const u = s.users.find((x) => x.name.toUpperCase() === line.toUpperCase());
      return u?.phone ? `${u.name.toUpperCase()} ${u.phone}` : line;
    });
  const order = s.jornadas.filter((x) => x.date <= j.date).length;

  return (
    <div className="print-page">
      <div className="print-actions no-print">
        <a className="btn ghost" href={`#/jornada/${j.id}`}>‹ Volver</a>
        <span className="row gap">
          <a className="btn ghost" href={`/files/transporte/${j.id}.xlsx`}>Descargar Excel</a>
          <button className="btn primary" onClick={() => window.print()}>Imprimir / Guardar PDF</button>
        </span>
      </div>
      <div className="sheet-doc">
        <div className="doc-head">
          <div className="doc-prod">{s.settings.production_name}</div>
          <div className="doc-title">ORDEN DE TRANSPORTE EQUIPO ARTÍSTICO</div>
          <table className="doc-meta">
            <tbody>
              <tr><th>Nº</th><td>{j.transport_number || j.day_number || order}</td></tr>
              <tr><th>Fecha</th><td>{longDate(j.date)} {j.date.slice(0, 4)}</td></tr>
              <tr><th>Horario rodaje</th><td>{j.hours_start} – {j.hours_end}</td></tr>
              {j.chapter && <tr><th>Capítulo</th><td>{j.chapter}</td></tr>}
            </tbody>
          </table>
        </div>
        <table className="doc-info">
          <tbody>
            <tr><th>PRODUCCIÓN</th><td>{contacts.join(" / ")}</td></tr>
            <tr>
              <th>SET</th>
              <td>
                {j.location_text}{j.address ? ` · ${j.address}` : ""}{" "}
                {(j.address || j.maps_url) && <a href={mapsLink(j.address, j.maps_url)}>{j.maps_url || "Maps"}</a>}
              </td>
            </tr>
          </tbody>
        </table>

        {groups.map(({ veh, items }) => (
          <div className="veh" key={veh}>
            <div className="veh-title">{veh}</div>
            <table className="runs-table">
              <colgroup><col style={{ width: "7%" }} /><col style={{ width: "7%" }} /><col style={{ width: "6%" }} /><col style={{ width: "27%" }} /><col style={{ width: "22%" }} /><col style={{ width: "8%" }} /><col style={{ width: "23%" }} /></colgroup>
              <thead>
                <tr><th></th><th>H. REC</th><th>DEPTO.</th><th>PERSONA</th><th>DIRECCIÓN</th><th>LLEGADA</th><th>DESTINO</th></tr>
              </thead>
              <tbody>
                {items.map(({ r, i }) =>
                  r.kind === "NOTA" ? (
                    <tr key={r.id} className="note-row"><td className="rk">{labels[i]}</td><td className="mono">{r.time}</td><td colSpan={5}></td></tr>
                  ) : (
                    <tr key={r.id} className={r.joins_prev ? "joined" : ""}>
                      <td className="rk">{labels[i]}</td>
                      <td className="mono">{r.time}</td>
                      <td className="mono">{r.code}</td>
                      <td><b>{r.passenger}</b>{r.passenger_phone ? <span className="ph"> ({r.passenger_phone})</span> : null}</td>
                      <td>{r.origin}</td>
                      <td className="mono">{r.arrival}</td>
                      <td>{r.destination}</td>
                    </tr>
                  )
                )}
              </tbody>
            </table>
          </div>
        ))}
        {j.runs.length === 0 && <p>Sin movimientos para esta jornada.</p>}
        <div className="doc-foot">Generado {new Date().toLocaleString("es-ES")} · Si hay cambios, esta orden se actualiza en la app.</div>
      </div>
    </div>
  );
}
