// Demo data based on a real day order, so the app isn't empty on first run.
// Run with: npm run seed   (only fills an empty database)
import { db, today } from "./db.js";
import crypto from "node:crypto";

const token = () => crypto.randomBytes(12).toString("base64url");

const hasJornadas = (db.prepare("SELECT COUNT(*) AS n FROM jornadas").get() as any).n > 0;
if (hasJornadas) {
  console.log("La base de datos ya tiene jornadas. No se carga la demo.");
  process.exit(0);
}

function addDays(iso: string, n: number) {
  const d = new Date(iso + "T12:00:00");
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

const t0 = today();

db.transaction(() => {
  const set = db.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value");
  set.run("production_name", "SI TE CONTARA");
  set.run("production_company", "RODSEP A.I.E");
  set.run("total_days", "29");
  set.run("office_address", "C/ José Isbert, 4 · 28223 Pozuelo de Alarcón (Ciudad de la Imagen)");
  set.run("production_contacts", "MALYK\nANGELA");

  // users: keep existing admin, add the team
  const admin = db.prepare("SELECT id FROM users WHERE access = 'head' ORDER BY id LIMIT 1").get() as any;
  if (admin) db.prepare("UPDATE users SET name = 'MALYK', role_title = 'UPM' WHERE id = ? AND name = 'Admin'").run(admin.id);
  else db.prepare("INSERT INTO users (name, role_title, department, access, token) VALUES ('MALYK', 'UPM', 'Producción', 'head', ?)").run(token());
  const addUser = db.prepare("INSERT INTO users (name, role_title, department, access, token) VALUES (?, ?, 'Producción', ?, ?)");
  const team: [string, string, string][] = [
    ["ANGELA", "Ayte. Producción", "pa"],
    ["JACOBO", "Jefe de Producción", "head"],
    ["ALEX", "Auxiliar", "team"],
    ["PEDRO", "Auxiliar", "team"],
    ["MARIO", "Auxiliar", "team"],
    ["JORGE", "Auxiliar", "team"],
    ["LUCIA", "Auxiliar", "team"],
    ["OSCAR", "Auxiliar", "team"],
    ["DAVID", "Auxiliar", "team"],
  ];
  for (const [n, r, a] of team) addUser.run(n, r, a, token());
  const uid = (name: string) => (db.prepare("SELECT id FROM users WHERE name = ?").get(name) as any)?.id ?? null;

  const addPlace = db.prepare("INSERT INTO places (kind, name, address, maps_url, notes) VALUES (?, ?, ?, ?, ?)");
  const plato = Number(addPlace.run("location", "Plató 7ª Media", "Calle José Isbert 4, 28223 Pozuelo de Alarcón", "", "Aparcar camiones en la parte trasera del edificio").lastInsertRowid);
  addPlace.run("location", "C.C. Sambil", "C/ de Mondragón s/n, Leganés", "", "Entrada principal. Aparcamiento público gratuito.");
  const pincalo = Number(addPlace.run("vendor", "Pincalo", "", "", "Generadores").lastInsertRowid);
  const toboggan = Number(addPlace.run("vendor", "Toboggan", "Calle Virgilio 25b, Pozuelo", "", "").lastInsertRowid);
  const adisar = Number(addPlace.run("vendor", "Adisar", "C. Mecánicos, 1, 28670 Villaviciosa de Odón, Madrid", "", "").lastInsertRowid);
  const movicam = Number(addPlace.run("vendor", "Movicam", "C/ Isabel Colbrand, 10. Nave 10. 28050 Fuencarral, Madrid", "", "").lastInsertRowid);

  const addVeh = db.prepare("INSERT INTO vehicles (name, driver, phone) VALUES (?, ?, ?)");
  const van = Number(addVeh.run("Van", "", "").lastInsertRowid);
  const camCamara = Number(addVeh.run("Camión cámara", "", "").lastInsertRowid);
  const camGrip = Number(addVeh.run("Camión grip", "", "").lastInsertRowid);
  const camion = Number(addVeh.run("Camión producción", "", "").lastInsertRowid);
  addVeh.run("Coche 1", "DAVID", "");
  addVeh.run("Coche 2", "OSCAR", "");

  const addJ = db.prepare(`INSERT INTO jornadas (date, day_number, location_id, location_text, address, hours_start, hours_end, truck_start, truck_end, meals, weather, notes, opener_id, truck_notes, status, published_at)
    VALUES (@date, @day_number, @location_id, @location_text, @address, @hours_start, @hours_end, @truck_start, @truck_end, @meals, @weather, @notes, @opener_id, @truck_notes, @status, @published_at)`);
  const base = {
    location_id: plato, location_text: "Plató 7ª Media", address: "Calle Jose Isbert 4. 28223, Pozuelo Alarcon",
    hours_start: "09:00", hours_end: "19:00", truck_start: "09:00", truck_end: "18:00",
    meals: "Desayuno 08:00 · Comida 14:30 · Bocata 17:00", weather: "", notes: "",
    opener_id: uid("MALYK"), truck_notes: "Seguramente mañana vayáis todos aparcados en la parte trasera del edificio.",
  };
  const j1 = Number(addJ.run({ ...base, date: t0, day_number: 13, weather: "Nublado. Máx 27º Mín 15º", status: "published", published_at: t0 + " 20:00:00" }).lastInsertRowid);
  const j2 = Number(addJ.run({ ...base, date: addDays(t0, 1), day_number: 14, status: "draft", published_at: null }).lastInsertRowid);

  const addCall = db.prepare("INSERT INTO calls (jornada_id, user_id, name, start, end, note, sort) VALUES (?, ?, ?, ?, ?, ?, ?)");
  const calls: [string, string, string, string][] = [
    ["MALYK", "07:30", "17:30", ""],
    ["ANGELA", "10:30", "20:30", ""],
    ["ALEX", "10:30", "20:30", "con disco"],
    ["PEDRO", "07:30", "17:30", ""],
    ["MARIO", "10:30", "20:30", ""],
    ["JORGE", "10:30", "20:30", ""],
    ["LUCIA", "07:30", "17:30", ""],
    ["OSCAR", "", "", "OT"],
    ["DAVID", "", "", "OT"],
  ];
  for (const j of [j1, j2]) calls.forEach(([n, s, e, note], i) => addCall.run(j, uid(n), n, s, e, note, i));

  const addDept = db.prepare("INSERT INTO dept_calls (jornada_id, label, time, sort) VALUES (?, ?, ?, ?)");
  const depts: [string, string][] = [["PRODUCCIÓN", "07:30"], ["LUCES LISTO", "07:45"], ["VESTUARIO LISTO", "08:15"], ["CÁMARA LISTO", "08:45"]];
  for (const j of [j1, j2]) depts.forEach(([l, t], i) => addDept.run(j, l, t, i));

  const addRun = db.prepare("INSERT INTO runs (jornada_id, vehicle_label, kind, time, passenger, origin, arrival, destination, sort) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)");
  addRun.run(j1, "COCHE 1 - DAVID", "REC", "07:45", "4. YON - Actor", "DOMICILIO", "09:00", "Plató 7ª Media", 0);
  addRun.run(j1, "COCHE 1 - DAVID", "DEV", "19:00", "6. CARMELA - Actriz", "Plató 7ª Media", "", "DOMICILIO", 1);
  addRun.run(j1, "COCHE 2 - OSCAR", "REC", "07:30", "1. SUSI - Actriz", "DOMICILIO", "07:50", "Plató 7ª Media", 2);
  addRun.run(j1, "TAXI 1", "REC", "08:25", "Director", "DOMICILIO", "09:00", "Plató 7ª Media", 3);

  const addTask = db.prepare(`INSERT INTO tasks (title, description, status, assignee_id, created_by, points, urgency, deadline, jornada_id, kind, place_id, vehicle_id, heads_only, sort)
    VALUES (@title, @description, @status, @assignee_id, @created_by, @points, @urgency, @deadline, @jornada_id, @kind, @place_id, @vehicle_id, @heads_only, @sort)`);
  const me = uid("MALYK");
  const T = (o: any) => addTask.run({ description: "", status: "today", assignee_id: null, created_by: me, points: null, urgency: "today", deadline: null, jornada_id: j1, kind: "general", place_id: null, vehicle_id: null, heads_only: 0, sort: 0, ...o });
  T({ title: "Montar 5 cambiadores para actores en oficinas + 2 grandes para figuración en la nave", kind: "montaje", assignee_id: uid("PEDRO"), points: 5, urgency: "today", deadline: `${t0}T08:30` });
  T({ title: "Montar espejo de Santi (los otros 4 ya están)", kind: "montaje", assignee_id: uid("LUCIA"), points: 1, deadline: `${t0}T08:30`, status: "done" });
  T({ title: "Devolver generador pequeño a Pincalo", kind: "devolucion", place_id: pincalo, vehicle_id: camion, assignee_id: uid("PEDRO"), points: 3, urgency: "today", deadline: `${t0}T12:00`, description: "Antes de ir a Toboggan." });
  T({ title: "Recoger material Toboggan", kind: "recogida", place_id: toboggan, vehicle_id: van, assignee_id: uid("ALEX"), points: 3, deadline: `${t0}T13:00` });
  T({ title: "Recoger mini mcliner + ILOWA en Adisar", kind: "recogida", place_id: adisar, vehicle_id: camCamara, assignee_id: uid("MARIO"), points: 5 });
  T({ title: "Recoger vía circular en Movicam", kind: "recogida", place_id: movicam, vehicle_id: camGrip, assignee_id: uid("JORGE"), points: 5, status: "doing" });
  T({ title: "Permiso de rodaje Ayto. Leganés (C.C. Sambil)", kind: "gestion", jornada_id: null, status: "backlog", assignee_id: uid("ANGELA"), points: 8, urgency: "week", deadline: `${addDays(t0, 4)}T14:00` });
  T({ title: "Cerrar presupuesto catering semana 4", kind: "gestion", jornada_id: null, status: "backlog", assignee_id: uid("JACOBO"), points: 3, urgency: "week", heads_only: 1 });
  T({ title: "Reservar parking camiones para Leganés", kind: "gestion", jornada_id: null, status: "blocked", assignee_id: uid("ANGELA"), points: 2, urgency: "blocker", description: "Esperando respuesta del centro comercial." });
  T({ title: "Inventario walkies y baterías", kind: "general", jornada_id: null, status: "backlog", points: 2, urgency: "whenever" });
})();

console.log("Demo cargada: 2 jornadas, equipo de producción, proveedores, vehículos y tareas.");
