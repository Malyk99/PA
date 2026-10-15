import { useMemo } from "react";
import type { JornadaFull, Run } from "../../../shared/types";
import { groupByVehicle, runLabels } from "../../../shared/transport";
import { useStore } from "../store";
import { Empty, Section } from "./ui";
import { telLink } from "../lib/format";

type Upd = (p: Partial<JornadaFull>) => void;

export function TransportEditor({ j, upd, editable, dirty }: { j: JornadaFull; upd: Upd; editable: boolean; dirty: boolean }) {
  const s = useStore();
  const setLoc = j.address || j.location_text;
  const labels = useMemo(() => runLabels(j.runs), [j.runs]);
  const groups = useMemo(() => groupByVehicle(j.runs), [j.runs]);
  const contactByCode = useMemo(() => {
    const m = new Map<string, (typeof s.contacts)[number]>();
    for (const c of s.contacts) if (c.code) m.set(c.code.trim().toUpperCase(), c);
    return m;
  }, [s.contacts]);

  const setRuns = (runs: Run[]) => upd({ runs });
  const blank = (veh: string, vehicle_id: number | null, kind: Run["kind"], extra: Partial<Run> = {}): Run => ({
    id: -Date.now() - Math.floor(Math.random() * 1000),
    jornada_id: j.id,
    vehicle_id,
    vehicle_label: veh,
    kind,
    time: "",
    code: "",
    joins_prev: 0,
    passenger: "",
    passenger_phone: "",
    origin: kind === "DEV" ? setLoc : "",
    arrival: "",
    destination: kind === "REC" ? setLoc : "",
    notes: kind === "NOTA" ? "COME" : "",
    sort: 0,
    ...extra,
  });

  const setRun = (i: number, p: Partial<Run>) => setRuns(j.runs.map((r, k) => (k === i ? { ...r, ...p } : r)));

  function applyCode(i: number, code: string) {
    const r = j.runs[i];
    const c = contactByCode.get(code.trim().toUpperCase());
    if (!c) {
      // typing past a code that had auto-filled someone: clear what was auto-filled
      const prev = contactByCode.get(r.code.trim().toUpperCase());
      if (prev && r.passenger === prev.name) {
        const home = prev.address || "DOMICILIO";
        return setRun(i, {
          code,
          passenger: "",
          passenger_phone: r.passenger_phone === prev.phone ? "" : r.passenger_phone,
          ...(r.kind === "DEV" ? { destination: r.destination === home ? "" : r.destination } : { origin: r.origin === home ? "" : r.origin }),
        });
      }
      return setRun(i, { code });
    }
    const home = c.address || "DOMICILIO";
    setRun(i, {
      code,
      passenger: c.name,
      passenger_phone: c.phone,
      ...(r.kind === "DEV" ? { destination: home, origin: r.origin || setLoc } : { origin: home, destination: r.destination || setLoc }),
    });
  }

  function insertAfterGroup(veh: string, run: Run) {
    const last = j.runs.map((r) => r.vehicle_label || "SIN VEHÍCULO").lastIndexOf(veh);
    const next = [...j.runs];
    next.splice(last + 1, 0, run);
    setRuns(next);
  }

  function addStop(veh: string, vehicle_id: number | null) {
    const prev = [...j.runs].reverse().find((r) => (r.vehicle_label || "SIN VEHÍCULO") === veh && r.kind !== "NOTA");
    const kind = prev?.kind === "DEV" ? "DEV" : "REC";
    insertAfterGroup(veh, blank(veh, vehicle_id, kind, { joins_prev: 1, arrival: "", ...(kind === "REC" ? { destination: prev?.destination ?? setLoc } : { origin: prev?.origin ?? setLoc }) }));
  }

  function move(i: number, dir: -1 | 1) {
    const k = i + dir;
    if (k < 0 || k >= j.runs.length || j.runs[k].vehicle_label !== j.runs[i].vehicle_label) return;
    const next = [...j.runs];
    [next[i], next[k]] = [next[k], next[i]];
    setRuns(next);
  }

  function renameVehicle(oldLabel: string, label: string, vehicle_id?: number | null) {
    setRuns(j.runs.map((r) => ((r.vehicle_label || "SIN VEHÍCULO") === oldLabel ? { ...r, vehicle_label: label, ...(vehicle_id !== undefined ? { vehicle_id } : {}) } : r)));
  }

  function addVehicle() {
    const n = groups.length + 1;
    setRuns([...j.runs, blank(`COCHE ${n}`, null, "REC")]);
  }

  const dis = !editable;

  return (
    <div className="transport">
      <Section
        title={<>Orden de transporte <span className="count">{j.runs.filter((r) => r.kind !== "NOTA").length}</span></>}
        right={
          <div className="row gap wrap">
            <a className={`btn sm ghost ${dirty ? "disabled" : ""}`} href={dirty ? undefined : `#/jornada/${j.id}/transporte`} title={dirty ? "Guarda primero" : ""}>PDF</a>
            <a className={`btn sm ${dirty ? "disabled" : ""}`} href={dirty ? undefined : `/files/transporte/${j.id}.xlsx`} title={dirty ? "Guarda primero" : ""}>Descargar Excel</a>
          </div>
        }
      >
        <div className="grid4 tr-head">
          <label className="field"><span>Nº orden</span><input disabled={dis} value={j.transport_number} placeholder={String(j.day_number ?? "")} onChange={(e) => upd({ transport_number: e.target.value })} /></label>
          <label className="field"><span>Capítulo</span><input disabled={dis} value={j.chapter} placeholder="—" onChange={(e) => upd({ chapter: e.target.value })} /></label>
          <div className="field span2">
            <span>Set / destino por defecto</span>
            <div className="ro">{setLoc || "Rellena la localización en Datos"}</div>
          </div>
        </div>
        {editable && s.contacts.length === 0 && (
          <div className="note-banner soft">
            Importa el reparto en <a href="#/directorio">Directorio</a> (la pestaña ACTORES de tu Excel) y al escribir el código se rellenan nombre, teléfono y dirección.
          </div>
        )}
        {j.runs.length === 0 && <Empty>Sin movimientos. Añade un vehículo para empezar.</Empty>}
      </Section>

      <datalist id="contact-codes">
        {s.contacts.filter((c) => c.code).map((c) => (
          <option key={c.id} value={c.code}>{c.name}</option>
        ))}
      </datalist>

      {groups.map((g) => {
        const first = g.items[0].r;
        return (
          <div className="veh-block" key={g.veh}>
            <div className="veh-head">
              <select
                disabled={dis}
                aria-label="Vehículo guardado"
                value={first.vehicle_id ?? ""}
                onChange={(e) => {
                  const v = s.vehicles.find((x) => x.id === Number(e.target.value));
                  if (v) renameVehicle(g.veh, `${v.name.toUpperCase()}${v.driver ? " - " + v.driver.toUpperCase() : ""}`, v.id);
                }}
              >
                <option value="">Vehículo…</option>
                {s.vehicles.map((v) => <option key={v.id} value={v.id}>{v.name}{v.driver ? ` · ${v.driver}` : ""}</option>)}
              </select>
              <input disabled={dis} className="veh-name" value={g.veh === "SIN VEHÍCULO" ? "" : g.veh} placeholder="COCHE 1 - DAVID 8h" onChange={(e) => renameVehicle(g.veh, e.target.value || "SIN VEHÍCULO")} />
              {editable && (
                <button className="rm" title="Quitar vehículo" aria-label="Quitar vehículo" onClick={() => confirm(`¿Quitar ${g.veh} y sus ${g.items.length} movimientos?`) && setRuns(j.runs.filter((r) => (r.vehicle_label || "SIN VEHÍCULO") !== g.veh))}>×</button>
              )}
            </div>

            <div className="tr-table">
              <div className="tr-row tr-th">
                <span /><span>H. REC</span><span>Cód.</span><span>Persona</span><span>Teléfono</span><span>Dirección</span><span>Llegada</span><span>Destino</span><span />
              </div>
              {g.items.map(({ r, i }) =>
                r.kind === "NOTA" ? (
                  <div className="tr-row tr-note" key={r.id}>
                    <span className="tr-label">nota</span>
                    <input disabled={dis} className="mono" value={r.time} placeholder="--:--" onChange={(e) => setRun(i, { time: e.target.value })} />
                    <input disabled={dis} className="tr-notetext" value={r.notes} placeholder="COME" onChange={(e) => setRun(i, { notes: e.target.value })} />
                    <RowTools i={i} editable={editable} onMove={move} onDelete={() => setRuns(j.runs.filter((_, k) => k !== i))} />
                  </div>
                ) : (
                  <div className={`tr-row ${r.joins_prev ? "joined" : ""} kind-${r.kind}`} key={r.id}>
                    <span className="tr-label">
                      {editable ? (
                        <select value={r.joins_prev ? "+" : r.kind} onChange={(e) => {
                          const v = e.target.value;
                          if (v === "+") setRun(i, { joins_prev: 1 });
                          else setRun(i, { kind: v as Run["kind"], joins_prev: 0, ...(v !== r.kind ? { origin: r.destination, destination: r.origin } : {}) });
                        }} aria-label="Tipo">
                          <option value="REC">{r.kind === "REC" && !r.joins_prev ? labels[i] : "REC"}</option>
                          <option value="DEV">{r.kind === "DEV" && !r.joins_prev ? labels[i] : "DEV"}</option>
                          <option value="+">+ parada</option>
                        </select>
                      ) : (
                        <b>{labels[i] || "+"}</b>
                      )}
                    </span>
                    <input disabled={dis} className="mono t-time" data-l="H. rec" value={r.time} placeholder="--:--" onChange={(e) => setRun(i, { time: e.target.value })} />
                    <input disabled={dis} className="mono code" data-l="Cód." list="contact-codes" value={r.code} placeholder="—" onChange={(e) => applyCode(i, e.target.value)} />
                    <input disabled={dis} className="person" data-l="Persona" value={r.passenger} placeholder="Nombre" onChange={(e) => setRun(i, { passenger: e.target.value })} />
                    {dis && r.passenger_phone ? (
                      <a className="maplink t-phone" href={telLink(r.passenger_phone)}>{r.passenger_phone}</a>
                    ) : (
                      <input disabled={dis} className="t-phone" data-l="Tel." value={r.passenger_phone} placeholder="Teléfono" onChange={(e) => setRun(i, { passenger_phone: e.target.value })} />
                    )}
                    <input disabled={dis} className="t-origin" data-l="Dirección" value={r.origin} placeholder={r.kind === "REC" ? "DOMICILIO" : setLoc} onChange={(e) => setRun(i, { origin: e.target.value })} />
                    <input disabled={dis} className="mono t-arr" data-l="Llegada" value={r.arrival} placeholder="--:--" onChange={(e) => setRun(i, { arrival: e.target.value })} />
                    <input disabled={dis} className="t-dest" data-l="Destino" value={r.destination} placeholder={r.kind === "DEV" ? "DOMICILIO" : setLoc} onChange={(e) => setRun(i, { destination: e.target.value })} />
                    <RowTools i={i} editable={editable} onMove={move} onDelete={() => setRuns(j.runs.filter((_, k) => k !== i))} />
                  </div>
                )
              )}
            </div>

            {editable && (
              <div className="row gap wrap veh-actions">
                <button className="btn sm ghost" onClick={() => insertAfterGroup(g.veh, blank(g.veh, first.vehicle_id, "REC"))}>+ Recogida</button>
                <button className="btn sm ghost" onClick={() => insertAfterGroup(g.veh, blank(g.veh, first.vehicle_id, "DEV"))}>+ Devolución</button>
                <button className="btn sm ghost" onClick={() => addStop(g.veh, first.vehicle_id)}>+ Parada en la misma ruta</button>
                <button className="btn sm ghost" onClick={() => insertAfterGroup(g.veh, blank(g.veh, first.vehicle_id, "NOTA"))}>+ COME / nota</button>
              </div>
            )}
          </div>
        );
      })}

      {editable && (
        <button className="btn ghost add-veh" onClick={addVehicle}>+ Vehículo</button>
      )}
    </div>
  );
}

function RowTools({ i, editable, onMove, onDelete }: { i: number; editable: boolean; onMove: (i: number, d: -1 | 1) => void; onDelete: () => void }) {
  if (!editable) return <span />;
  return (
    <span className="tr-tools">
      <button className="mv" aria-label="Subir" onClick={() => onMove(i, -1)}>↑</button>
      <button className="mv" aria-label="Bajar" onClick={() => onMove(i, 1)}>↓</button>
      <button className="rm" aria-label="Quitar" onClick={onDelete}>×</button>
    </span>
  );
}
