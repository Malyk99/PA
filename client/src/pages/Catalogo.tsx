import { useState } from "react";
import { useStore } from "../store";
import { api } from "../api";
import { Modal } from "../components/TaskModal";
import { Empty, Section } from "../components/ui";
import { mapsLink, telLink } from "../lib/format";
import type { Place, PlaceKind, Vehicle } from "../../../shared/types";

export function Catalogo() {
  const s = useStore();
  const [place, setPlace] = useState<Partial<Place> | null>(null);
  const [veh, setVeh] = useState<Partial<Vehicle> | null>(null);
  const edit = s.can("pa");
  const locs = s.places.filter((p) => p.kind === "location");
  const vendors = s.places.filter((p) => p.kind === "vendor");

  const PlaceList = ({ items, kind }: { items: Place[]; kind: PlaceKind }) => (
    <Section
      title={<>{kind === "location" ? "Localizaciones" : "Proveedores"} <span className="count">{items.length}</span></>}
      right={edit && <button className="btn sm" onClick={() => setPlace({ kind, name: "", address: "", maps_url: "", notes: "" })}>+ Añadir</button>}
    >
      {items.length === 0 ? <Empty>Nada todavía.</Empty> : (
        <div className="catalog">
          {items.map((p) => (
            <div key={p.id} className="card cat-item" onClick={() => edit && setPlace(p)}>
              <div className="cat-name">{p.name}</div>
              {p.address && <div className="muted small">{p.address}</div>}
              {p.notes && <div className="small">{p.notes}</div>}
              {(p.address || p.maps_url) && (
                <a className="maplink" href={mapsLink(p.address, p.maps_url)} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>Abrir en Maps</a>
              )}
            </div>
          ))}
        </div>
      )}
    </Section>
  );

  return (
    <div className="page">
      <h1>Lugares y vehículos</h1>
      <p className="muted">Se guardan una vez y se reutilizan en jornadas y tareas, así las direcciones salen siempre igual en los mensajes.</p>
      <PlaceList items={locs} kind="location" />
      <PlaceList items={vendors} kind="vendor" />
      <Section
        title={<>Vehículos <span className="count">{s.vehicles.length}</span></>}
        right={edit && <button className="btn sm" onClick={() => setVeh({ name: "", driver: "", phone: "", notes: "" })}>+ Añadir</button>}
      >
        <div className="catalog">
          {s.vehicles.map((v) => (
            <div key={v.id} className="card cat-item" onClick={() => edit && setVeh(v)}>
              <div className="cat-name">{v.name}</div>
              <div className="muted small">{[v.driver, v.notes].filter(Boolean).join(" · ") || "Sin conductor fijo"}</div>
              {v.phone && <a className="maplink" href={telLink(v.phone)} onClick={(e) => e.stopPropagation()}>{v.phone}</a>}
            </div>
          ))}
        </div>
      </Section>

      {place && (
        <EditModal
          title={place.id ? place.name! : place.kind === "vendor" ? "Nuevo proveedor" : "Nueva localización"}
          fields={[["name", "Nombre"], ["address", "Dirección"], ["maps_url", "Enlace Maps (opcional)"], ["notes", "Notas (acceso, contacto, horarios)"]]}
          value={place}
          onClose={() => setPlace(null)}
          onSave={(v) => (place.id ? api.put(`/places/${place.id}`, v) : api.post(`/places`, v))}
          onDelete={place.id ? () => api.del(`/places/${place.id}`) : undefined}
        />
      )}
      {veh && (
        <EditModal
          title={veh.id ? veh.name! : "Nuevo vehículo"}
          fields={[["name", "Nombre (Van, Camión cámara, Coche 1…)"], ["driver", "Conductor"], ["phone", "Teléfono"], ["notes", "Notas (matrícula, carnet…)"]]}
          value={veh}
          onClose={() => setVeh(null)}
          onSave={(v) => (veh.id ? api.put(`/vehicles/${veh.id}`, v) : api.post(`/vehicles`, v))}
          onDelete={veh.id ? () => api.del(`/vehicles/${veh.id}`) : undefined}
        />
      )}
    </div>
  );
}

function EditModal<T extends object>({ title, fields, value, onClose, onSave, onDelete }: {
  title: string; fields: [keyof T & string, string][]; value: Partial<T>; onClose: () => void; onSave: (v: Partial<T>) => Promise<unknown>; onDelete?: () => Promise<unknown>;
}) {
  const s = useStore();
  const [f, setF] = useState<Partial<T>>(value);
  const [err, setErr] = useState("");
  return (
    <Modal title={title} onClose={onClose}>
      {fields.map(([k, label], i) => (
        <label className="field" key={k}>
          <span>{label}</span>
          <input autoFocus={i === 0} value={String((f as any)[k] ?? "")} onChange={(e) => setF({ ...f, [k]: e.target.value })} />
        </label>
      ))}
      {err && <div className="error">{err}</div>}
      <div className="modal-actions">
        {onDelete && <button className="btn ghost danger" onClick={async () => { if (confirm("¿Borrar?")) { await onDelete(); await s.reloadMeta(); onClose(); } }}>Borrar</button>}
        <span className="spacer" />
        <button className="btn ghost" onClick={onClose}>Cancelar</button>
        <button className="btn primary" onClick={async () => { try { await onSave(f); await s.reloadMeta(); onClose(); } catch (e) { setErr((e as Error).message); } }}>Guardar</button>
      </div>
    </Modal>
  );
}
