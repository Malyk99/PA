import express, { type Request, type Response, type NextFunction } from "express";
import cookieParser from "cookie-parser";
import multer from "multer";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { db, now, today, UPLOAD_DIR, DATA_DIR, DEFAULT_SETTINGS } from "./db.js";
import { importContacts, transportXlsx } from "./excel.js";
import type { Access, User } from "../shared/types.js";

const PORT = Number(process.env.PORT || 4000);
const PROD = process.env.NODE_ENV === "production";
const COOKIE = "pa_token";

const app = express();
app.set("trust proxy", 1); // behind Railway / Cloudflare https proxy
app.get("/healthz", (_req, res) => res.json({ ok: true }));
app.use(express.json({ limit: "2mb" }));
app.use(cookieParser());

// ---------------------------------------------------------------------------
// helpers

export function newToken() {
  return crypto.randomBytes(12).toString("base64url");
}

type AuthedRequest = Request & { user: User };

function getUserByToken(token: string | undefined): User | undefined {
  if (!token) return undefined;
  return db.prepare("SELECT * FROM users WHERE token = ? AND active = 1").get(token) as User | undefined;
}

function auth(req: Request, res: Response, next: NextFunction) {
  const token = req.cookies?.[COOKIE] || req.header("x-pa-token");
  const user = getUserByToken(token);
  if (!user) return res.status(401).json({ error: "No autorizado. Abre tu enlace personal." });
  (req as AuthedRequest).user = user;
  next();
}

const rank: Record<Access, number> = { team: 0, pa: 1, head: 2 };
function need(min: Access) {
  return (req: Request, res: Response, next: NextFunction) => {
    const u = (req as AuthedRequest).user;
    if (rank[u.access] < rank[min]) return res.status(403).json({ error: "No tienes permiso para esto." });
    next();
  };
}

function me(req: Request) {
  return (req as AuthedRequest).user;
}

function publicUser(u: User, viewer: User) {
  const { token, ...rest } = u as User & { token: string; created_at?: string };
  return viewer.access === "head" ? { ...rest, token } : rest;
}

function pick<T extends object>(body: any, keys: (keyof T)[]): Partial<T> {
  const out: any = {};
  for (const k of keys) if (body[k] !== undefined) out[k] = body[k];
  return out;
}

function updateRow(table: string, id: number, fields: Record<string, unknown>) {
  const keys = Object.keys(fields);
  if (!keys.length) return;
  const sql = `UPDATE ${table} SET ${keys.map((k) => `"${k}" = @${k}`).join(", ")} WHERE id = @__id`;
  db.prepare(sql).run({ ...fields, __id: id });
}

function insertRow(table: string, fields: Record<string, unknown>): number {
  const keys = Object.keys(fields);
  const sql = keys.length
    ? `INSERT INTO ${table} (${keys.map((k) => `"${k}"`).join(", ")}) VALUES (${keys.map((k) => `@${k}`).join(", ")})`
    : `INSERT INTO ${table} DEFAULT VALUES`;
  return Number(db.prepare(sql).run(fields).lastInsertRowid);
}

// ---------------------------------------------------------------------------
// live updates (Server-Sent Events)

const clients = new Set<Response>();
function broadcast(topic: string) {
  const msg = `data: ${JSON.stringify({ topic, at: Date.now() })}\n\n`;
  for (const c of clients) c.write(msg);
}
setInterval(() => {
  for (const c of clients) c.write(": ping\n\n");
}, 25000);

// ---------------------------------------------------------------------------
// daily housekeeping: unfinished tasks from past jornadas go back to backlog,
// backlog tasks attached to today's jornada move to "Hoy".

let lastHousekeeping = "";
function housekeeping(force = false) {
  const t = today();
  if (!force && lastHousekeeping === t) return;
  lastHousekeeping = t;
  const stale = db
    .prepare(
      `SELECT tasks.id, jornadas.date, jornadas.day_number FROM tasks
       JOIN jornadas ON jornadas.id = tasks.jornada_id
       WHERE jornadas.date < ? AND tasks.status != 'done'`
    )
    .all(t) as { id: number; date: string; day_number: number | null }[];
  const tx = db.transaction(() => {
    for (const s of stale) {
      db.prepare(
        "UPDATE tasks SET status = 'backlog', jornada_id = NULL, carried_over = 1, updated_at = ? WHERE id = ?"
      ).run(now(), s.id);
      db.prepare("INSERT INTO comments (task_id, body, system) VALUES (?, ?, 1)").run(
        s.id,
        `No se completó en la jornada del ${s.date}${s.day_number ? ` (#${s.day_number})` : ""}. Vuelve al backlog.`
      );
    }
    db.prepare(
      `UPDATE tasks SET status = 'today', updated_at = ? WHERE status = 'backlog'
       AND jornada_id IN (SELECT id FROM jornadas WHERE date = ?)`
    ).run(now(), t);
  });
  tx();
  if (stale.length) broadcast("tasks");
}
setInterval(() => housekeeping(), 60_000);

// ---------------------------------------------------------------------------
// login via personal link

app.get("/l/:token", (req, res) => {
  const user = getUserByToken(req.params.token);
  if (!user) return res.status(404).send(page("Enlace no válido", "Este enlace no existe o está desactivado. Pide uno nuevo a producción."));
  res.cookie(COOKIE, req.params.token, { httpOnly: true, sameSite: "lax", secure: req.secure, maxAge: 1000 * 60 * 60 * 24 * 365 });
  res.redirect("/");
});

function page(title: string, body: string) {
  return `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><body style="font-family:system-ui;padding:32px;max-width:420px;margin:auto"><h2>${title}</h2><p>${body}</p></body>`;
}

// ---------------------------------------------------------------------------
// API

const api = express.Router();
api.use(auth);

api.get("/events", (req, res) => {
  res.set({ "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });
  res.flushHeaders();
  res.write(": connected\n\n");
  clients.add(res);
  req.on("close", () => clients.delete(res));
});

api.post("/logout", (_req, res) => {
  res.clearCookie(COOKIE);
  res.json({ ok: true });
});

function settingsObj() {
  const rows = db.prepare("SELECT key, value FROM settings").all() as { key: string; value: string }[];
  const s: Record<string, string> = { ...DEFAULT_SETTINGS };
  for (const r of rows) s[r.key] = r.value;
  return s;
}

api.get("/bootstrap", (req, res) => {
  housekeeping();
  const u = me(req);
  const users = (db.prepare("SELECT * FROM users ORDER BY active DESC, name").all() as User[]).map((x) => publicUser(x, u));
  res.json({
    me: publicUser(u, u),
    users,
    places: db.prepare("SELECT * FROM places ORDER BY kind, name").all(),
    vehicles: db.prepare("SELECT * FROM vehicles ORDER BY name").all(),
    settings: settingsObj(),
  });
});

// settings ------------------------------------------------------------------
api.put("/settings", need("head"), (req, res) => {
  const up = db.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value");
  for (const k of Object.keys(DEFAULT_SETTINGS)) if (typeof req.body[k] === "string") up.run(k, req.body[k]);
  broadcast("meta");
  res.json(settingsObj());
});

// users ---------------------------------------------------------------------
const USER_FIELDS = ["name", "role_title", "department", "phone", "access", "active"] as const;
api.post("/users", need("head"), (req, res) => {
  const f = pick<any>(req.body, USER_FIELDS as any);
  if (!f.name) return res.status(400).json({ error: "Falta el nombre." });
  const id = insertRow("users", { ...f, token: newToken() });
  broadcast("meta");
  res.json(db.prepare("SELECT * FROM users WHERE id = ?").get(id));
});
api.put("/users/:id", need("head"), (req, res) => {
  const id = Number(req.params.id);
  const f = pick<any>(req.body, USER_FIELDS as any);
  if (id === me(req).id && f.access && f.access !== "head") return res.status(400).json({ error: "No puedes quitarte el acceso de jefatura a ti mismo." });
  updateRow("users", id, f);
  broadcast("meta");
  res.json(db.prepare("SELECT * FROM users WHERE id = ?").get(id));
});
api.post("/users/:id/regen", need("head"), (req, res) => {
  const id = Number(req.params.id);
  updateRow("users", id, { token: newToken() });
  broadcast("meta");
  res.json(db.prepare("SELECT * FROM users WHERE id = ?").get(id));
});

// places & vehicles ---------------------------------------------------------
const PLACE_FIELDS = ["kind", "name", "address", "maps_url", "notes"];
const VEHICLE_FIELDS = ["name", "driver", "phone", "notes"];
for (const [table, fields] of [
  ["places", PLACE_FIELDS],
  ["vehicles", VEHICLE_FIELDS],
] as const) {
  api.post(`/${table}`, need("pa"), (req, res) => {
    const f = pick<any>(req.body, fields as any);
    if (!f.name) return res.status(400).json({ error: "Falta el nombre." });
    const id = insertRow(table, f);
    broadcast("meta");
    res.json(db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(id));
  });
  api.put(`/${table}/:id`, need("pa"), (req, res) => {
    updateRow(table, Number(req.params.id), pick<any>(req.body, fields as any));
    broadcast("meta");
    res.json(db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(Number(req.params.id)));
  });
  api.delete(`/${table}/:id`, need("pa"), (req, res) => {
    db.prepare(`DELETE FROM ${table} WHERE id = ?`).run(Number(req.params.id));
    broadcast("meta");
    res.json({ ok: true });
  });
}

// jornadas ------------------------------------------------------------------
const JORNADA_FIELDS = [
  "date", "day_number", "title", "location_id", "location_text", "address", "maps_url",
  "hours_start", "hours_end", "truck_start", "truck_end", "meals", "weather", "notes",
  "opener_id", "truck_notes", "transport_number", "chapter",
];

function fullJornada(id: number) {
  const j = db.prepare("SELECT * FROM jornadas WHERE id = ?").get(id) as any;
  if (!j) return null;
  j.calls = db.prepare("SELECT * FROM calls WHERE jornada_id = ? ORDER BY sort, id").all(id);
  j.dept_calls = db.prepare("SELECT * FROM dept_calls WHERE jornada_id = ? ORDER BY sort, id").all(id);
  j.runs = db.prepare("SELECT * FROM runs WHERE jornada_id = ? ORDER BY sort, id").all(id);
  j.attachments = db.prepare("SELECT * FROM attachments WHERE jornada_id = ? ORDER BY created_at DESC").all(id);
  return j;
}

function canSeeDrafts(u: User) {
  return rank[u.access] >= rank.pa;
}

api.get("/jornadas", (req, res) => {
  const u = me(req);
  const rows = db
    .prepare(
      `SELECT j.*, (SELECT COUNT(*) FROM tasks t WHERE t.jornada_id = j.id) AS task_count,
              (SELECT COUNT(*) FROM tasks t WHERE t.jornada_id = j.id AND t.status = 'done') AS task_done
       FROM jornadas j ${canSeeDrafts(u) ? "" : "WHERE j.status = 'published'"} ORDER BY date`
    )
    .all();
  res.json(rows);
});

api.get("/jornadas/:id", (req, res) => {
  const j = fullJornada(Number(req.params.id));
  if (!j || (j.status !== "published" && !canSeeDrafts(me(req)))) return res.status(404).json({ error: "No encontrada" });
  res.json(j);
});

function writeChildren(id: number, body: any) {
  if (Array.isArray(body.calls)) {
    db.prepare("DELETE FROM calls WHERE jornada_id = ?").run(id);
    body.calls.forEach((c: any, i: number) =>
      insertRow("calls", {
        jornada_id: id, user_id: c.user_id ?? null, name: c.name ?? "", start: c.start ?? "", end: c.end ?? "", note: c.note ?? "", sort: i,
      })
    );
  }
  if (Array.isArray(body.dept_calls)) {
    db.prepare("DELETE FROM dept_calls WHERE jornada_id = ?").run(id);
    body.dept_calls.forEach((c: any, i: number) =>
      insertRow("dept_calls", { jornada_id: id, label: c.label ?? "", time: c.time ?? "", sort: i })
    );
  }
  if (Array.isArray(body.runs)) {
    db.prepare("DELETE FROM runs WHERE jornada_id = ?").run(id);
    body.runs.forEach((r: any, i: number) =>
      insertRow("runs", {
        jornada_id: id, vehicle_id: r.vehicle_id ?? null, vehicle_label: r.vehicle_label ?? "",
        kind: r.kind === "DEV" ? "DEV" : r.kind === "NOTA" ? "NOTA" : "REC", code: r.code ?? "", joins_prev: r.joins_prev ? 1 : 0,
        time: r.time ?? "", passenger: r.passenger ?? "", passenger_phone: r.passenger_phone ?? "", origin: r.origin ?? "",
        arrival: r.arrival ?? "", destination: r.destination ?? "", notes: r.notes ?? "", sort: i,
      })
    );
  }
}

api.post("/jornadas", need("pa"), (req, res) => {
  const f = pick<any>(req.body, JORNADA_FIELDS as any);
  if (!f.date) return res.status(400).json({ error: "Falta la fecha." });
  if (db.prepare("SELECT id FROM jornadas WHERE date = ?").get(f.date)) return res.status(409).json({ error: "Ya existe una jornada en esa fecha." });
  const id = db.transaction(() => {
    const id = insertRow("jornadas", { ...f, updated_at: now() });
    writeChildren(id, req.body);
    return id;
  })();
  broadcast("jornadas");
  res.json(fullJornada(id));
});

api.post("/jornadas/:id/duplicate", need("pa"), (req, res) => {
  const src = fullJornada(Number(req.params.id));
  const date = req.body.date as string;
  if (!src) return res.status(404).json({ error: "No encontrada" });
  if (!date) return res.status(400).json({ error: "Falta la fecha." });
  if (db.prepare("SELECT id FROM jornadas WHERE date = ?").get(date)) return res.status(409).json({ error: "Ya existe una jornada en esa fecha." });
  const id = db.transaction(() => {
    const f: any = {};
    for (const k of JORNADA_FIELDS) f[k] = src[k];
    f.date = date;
    f.day_number = src.day_number ? src.day_number + 1 : null;
    f.weather = "";
    if (/^\d+$/.test(String(src.transport_number || ""))) f.transport_number = String(Number(src.transport_number) + 1);
    const id = insertRow("jornadas", { ...f, updated_at: now() });
    // runs are day-specific, so only calls carry over
    writeChildren(id, { calls: src.calls, dept_calls: src.dept_calls, runs: req.body.include_runs ? src.runs : [] });
    return id;
  })();
  broadcast("jornadas");
  res.json(fullJornada(id));
});

api.put("/jornadas/:id", need("pa"), (req, res) => {
  const id = Number(req.params.id);
  const f = pick<any>(req.body, JORNADA_FIELDS as any);
  if (f.date) {
    const clash = db.prepare("SELECT id FROM jornadas WHERE date = ? AND id != ?").get(f.date, id);
    if (clash) return res.status(409).json({ error: "Ya existe una jornada en esa fecha." });
  }
  db.transaction(() => {
    updateRow("jornadas", id, { ...f, updated_at: now() });
    writeChildren(id, req.body);
  })();
  broadcast("jornadas");
  res.json(fullJornada(id));
});

api.post("/jornadas/:id/publish", need("pa"), (req, res) => {
  const id = Number(req.params.id);
  const publish = req.body.publish !== false;
  updateRow("jornadas", id, { status: publish ? "published" : "draft", published_at: publish ? now() : null, updated_at: now() });
  broadcast("jornadas");
  res.json(fullJornada(id));
});

api.delete("/jornadas/:id", need("head"), (req, res) => {
  const id = Number(req.params.id);
  for (const a of db.prepare("SELECT stored_name FROM attachments WHERE jornada_id = ?").all(id) as any[]) {
    fs.rm(path.join(UPLOAD_DIR, a.stored_name), () => {});
  }
  db.prepare("DELETE FROM jornadas WHERE id = ?").run(id);
  broadcast("jornadas");
  broadcast("tasks");
  res.json({ ok: true });
});

// attachments ---------------------------------------------------------------
const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOAD_DIR,
    filename: (_req, file, cb) => cb(null, `${Date.now()}-${crypto.randomBytes(4).toString("hex")}${path.extname(file.originalname)}`),
  }),
  limits: { fileSize: 30 * 1024 * 1024 },
});

api.post("/jornadas/:id/attachments", need("pa"), upload.single("file"), (req, res) => {
  const file = req.file;
  if (!file) return res.status(400).json({ error: "Falta el archivo." });
  // multer decodes names as latin1
  const filename = Buffer.from(file.originalname, "latin1").toString("utf8");
  const id = insertRow("attachments", {
    jornada_id: Number(req.params.id), filename, stored_name: file.filename, mime: file.mimetype, size: file.size,
    label: req.body.label || "", uploaded_by: me(req).id,
  });
  broadcast("jornadas");
  res.json(db.prepare("SELECT * FROM attachments WHERE id = ?").get(id));
});

api.delete("/attachments/:id", need("pa"), (req, res) => {
  const a = db.prepare("SELECT * FROM attachments WHERE id = ?").get(Number(req.params.id)) as any;
  if (a) {
    fs.rm(path.join(UPLOAD_DIR, a.stored_name), () => {});
    db.prepare("DELETE FROM attachments WHERE id = ?").run(a.id);
  }
  broadcast("jornadas");
  res.json({ ok: true });
});

app.get("/files/:id", auth, (req, res) => {
  const a = db.prepare("SELECT * FROM attachments WHERE id = ?").get(Number(req.params.id)) as any;
  if (!a) return res.status(404).send("No encontrado");
  const inline = req.query.download ? "attachment" : "inline";
  res.setHeader("Content-Disposition", `${inline}; filename*=UTF-8''${encodeURIComponent(a.filename)}`);
  res.type(a.mime || "application/octet-stream");
  res.sendFile(path.join(UPLOAD_DIR, a.stored_name));
});

// contacts directory (cast, extras, drivers…) --------------------------------
const CONTACT_FIELDS = ["code", "name", "phone", "address", "grp", "notes"];
api.get("/contacts", need("pa"), (_req, res) => {
  res.json(db.prepare("SELECT * FROM contacts ORDER BY grp, CAST(code AS INTEGER), code, name").all());
});
api.post("/contacts", need("pa"), (req, res) => {
  const f = pick<any>(req.body, CONTACT_FIELDS as any);
  if (!f.name && !f.code) return res.status(400).json({ error: "Falta nombre o código." });
  const id = insertRow("contacts", f);
  broadcast("contacts");
  res.json(db.prepare("SELECT * FROM contacts WHERE id = ?").get(id));
});
api.put("/contacts/:id", need("pa"), (req, res) => {
  updateRow("contacts", Number(req.params.id), pick<any>(req.body, CONTACT_FIELDS as any));
  broadcast("contacts");
  res.json(db.prepare("SELECT * FROM contacts WHERE id = ?").get(Number(req.params.id)));
});
api.delete("/contacts/:id", need("pa"), (req, res) => {
  db.prepare("DELETE FROM contacts WHERE id = ?").run(Number(req.params.id));
  broadcast("contacts");
  res.json({ ok: true });
});
const memUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });
api.post("/contacts/import", need("pa"), memUpload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Falta el archivo." });
  try {
    const { contacts, sheet } = await importContacts(req.file.buffer);
    if (!contacts.length) return res.status(400).json({ error: "No encontré una tabla con columnas de código y nombre (p. ej. la pestaña ACTORES)." });
    const replace = req.body.mode === "replace";
    let added = 0, updated = 0;
    db.transaction(() => {
      if (replace) db.prepare("DELETE FROM contacts").run();
      const byCode = db.prepare("SELECT id FROM contacts WHERE code = ? AND code != ''");
      for (const c of contacts) {
        const ex = c.code ? (byCode.get(c.code) as any) : null;
        if (ex) {
          db.prepare("UPDATE contacts SET name = ?, address = COALESCE(NULLIF(?, ''), address), phone = COALESCE(NULLIF(?, ''), phone) WHERE id = ?").run(c.name, c.address, c.phone, ex.id);
          updated++;
        } else {
          insertRow("contacts", c as any);
          added++;
        }
      }
    })();
    broadcast("contacts");
    res.json({ sheet, added, updated, total: contacts.length });
  } catch (e) {
    res.status(400).json({ error: "No se pudo leer el Excel: " + (e as Error).message });
  }
});

// transport order export -----------------------------------------------------
const DAYS_ES = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const MONTHS_ES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
app.get("/files/transporte/:id.xlsx", auth, async (req, res) => {
  const j = fullJornada(Number(req.params.id));
  if (!j) return res.status(404).send("No encontrada");
  const s = settingsObj();
  const d = new Date(j.date + "T12:00:00");
  const users = db.prepare("SELECT name, phone FROM users").all() as { name: string; phone: string }[];
  const contacts = s.production_contacts.split("\n").map((x) => x.trim()).filter(Boolean).map((line) => {
    const u = users.find((x) => x.name.toUpperCase() === line.toUpperCase());
    return u?.phone ? `${u.name.toUpperCase()} ${u.phone}` : line;
  });
  const buf = await transportXlsx({
    production: s.production_name,
    title: "ORDEN DE TRANSPORTE EQUIPO ARTÍSTICO",
    number: j.transport_number || String(j.day_number ?? ""),
    dateLabel: `${DAYS_ES[d.getDay()]}, ${d.getDate()} de ${MONTHS_ES[d.getMonth()]} de ${d.getFullYear()}`,
    hours: j.hours_start ? `${j.hours_start} A ${j.hours_end}` : "",
    chapter: j.chapter || "",
    contacts: contacts.join(" / "),
    setName: [j.location_text, j.address].filter(Boolean).join(" · "),
    mapsUrl: j.maps_url || (j.address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(j.address)}` : ""),
    runs: j.runs,
  });
  const prefix = s.production_name.replace(/[^A-Za-z0-9]+/g, "").slice(0, 6).toUpperCase() || "PROD";
  const fname = `${prefix}_OT_${j.date.slice(2).replace(/-/g, "")}.xlsx`;
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="${fname}"`);
  res.send(buf);
});

// backup: heads can download a consistent copy of the whole database --------
api.get("/backup", need("head"), async (_req, res) => {
  const file = path.join(DATA_DIR, `backup-${Date.now()}.db`);
  await db.backup(file);
  res.download(file, `pa-assistant-backup-${today()}.db`, () => fs.rm(file, () => {}));
});

// tasks ---------------------------------------------------------------------
const TASK_FIELDS = [
  "title", "description", "status", "assignee_id", "points", "urgency", "deadline", "jornada_id",
  "kind", "place_id", "vehicle_id", "heads_only", "sort",
];

function visibleTasksSql(u: User) {
  return u.access === "team" ? "WHERE t.heads_only = 0" : "";
}

function getTask(id: number) {
  return db
    .prepare(`SELECT t.*, (SELECT COUNT(*) FROM comments c WHERE c.task_id = t.id AND c.system = 0) AS comment_count FROM tasks t WHERE t.id = ?`)
    .get(id) as any;
}

api.get("/tasks", (req, res) => {
  housekeeping();
  const u = me(req);
  const rows = db
    .prepare(
      `SELECT t.*, (SELECT COUNT(*) FROM comments c WHERE c.task_id = t.id AND c.system = 0) AS comment_count
       FROM tasks t ${visibleTasksSql(u)}
       ORDER BY CASE t.urgency WHEN 'blocker' THEN 0 WHEN 'today' THEN 1 WHEN 'week' THEN 2 ELSE 3 END, t.sort, t.id`
    )
    .all();
  res.json(rows);
});

function nameOf(id: number | null | undefined) {
  if (!id) return "nadie";
  const r = db.prepare("SELECT name FROM users WHERE id = ?").get(id) as any;
  return r?.name ?? "alguien";
}

const STATUS_ES: Record<string, string> = { backlog: "Backlog", today: "Hoy", doing: "En curso", blocked: "Bloqueado", done: "Hecho" };

function systemComment(taskId: number, body: string, userId: number) {
  db.prepare("INSERT INTO comments (task_id, user_id, body, system) VALUES (?, ?, ?, 1)").run(taskId, userId, body);
}

function canEditTask(u: User, t: any, f: any) {
  if (u.access !== "team") return true;
  if (t.heads_only) return false;
  // team: can work on tasks assigned to them, or claim unassigned ones
  const mine = t.assignee_id === u.id;
  const claiming = t.assignee_id == null && (f.assignee_id === u.id || f.assignee_id === undefined);
  if (!mine && !claiming) return false;
  if (f.assignee_id !== undefined && f.assignee_id !== u.id && f.assignee_id !== null) return false;
  return true;
}

api.post("/tasks", (req, res) => {
  const u = me(req);
  const f = pick<any>(req.body, TASK_FIELDS as any);
  if (!f.title?.trim()) return res.status(400).json({ error: "Falta el título." });
  if (u.access === "team") {
    f.heads_only = 0;
    if (f.assignee_id && f.assignee_id !== u.id) return res.status(403).json({ error: "Solo jefatura y PAs pueden asignar a otras personas." });
  }
  if (f.jornada_id && (!f.status || f.status === "backlog")) {
    const j = db.prepare("SELECT date FROM jornadas WHERE id = ?").get(f.jornada_id) as any;
    if (j?.date === today()) f.status = "today";
  }
  const id = insertRow("tasks", { ...f, created_by: u.id, created_at: now(), updated_at: now(), sort: Date.now() / 1000 });
  systemComment(id, `${u.name} creó la tarea${f.assignee_id ? ` y la asignó a ${nameOf(f.assignee_id)}` : ""}.`, u.id);
  broadcast("tasks");
  res.json(getTask(id));
});

api.put("/tasks/:id", (req, res) => {
  const u = me(req);
  const id = Number(req.params.id);
  const t = getTask(id);
  if (!t) return res.status(404).json({ error: "No encontrada" });
  const f = pick<any>(req.body, TASK_FIELDS as any);
  if (!canEditTask(u, t, f)) return res.status(403).json({ error: "Solo puedes mover tus propias tareas." });
  if (u.access === "team") delete f.heads_only;
  const notes: string[] = [];
  if (f.status && f.status !== t.status) {
    notes.push(`movió a ${STATUS_ES[f.status]}`);
    if (f.status === "done") Object.assign(f, { done_at: now(), done_by: u.id });
    else Object.assign(f, { done_at: null, done_by: null });
  }
  if (f.assignee_id !== undefined && f.assignee_id !== t.assignee_id) notes.push(f.assignee_id ? `asignó a ${nameOf(f.assignee_id)}` : "quitó la asignación");
  if (f.jornada_id !== undefined && f.jornada_id !== t.jornada_id) {
    if (f.jornada_id) {
      const j = db.prepare("SELECT date, day_number FROM jornadas WHERE id = ?").get(f.jornada_id) as any;
      notes.push(`programó para el ${j?.date ?? "?"}`);
      if (j?.date === today() && (f.status ?? t.status) === "backlog") f.status = "today";
    } else notes.push("la sacó de la jornada");
    f.carried_over = 0;
  }
  updateRow("tasks", id, { ...f, updated_at: now() });
  if (notes.length) systemComment(id, `${u.name} ${notes.join(", ")}.`, u.id);
  broadcast("tasks");
  res.json(getTask(id));
});

api.delete("/tasks/:id", (req, res) => {
  const u = me(req);
  const t = getTask(Number(req.params.id));
  if (!t) return res.json({ ok: true });
  if (u.access === "team" && t.created_by !== u.id) return res.status(403).json({ error: "Solo puedes borrar tareas que creaste tú." });
  db.prepare("DELETE FROM tasks WHERE id = ?").run(t.id);
  broadcast("tasks");
  res.json({ ok: true });
});

api.get("/tasks/:id/comments", (req, res) => {
  const t = getTask(Number(req.params.id));
  if (!t || (t.heads_only && me(req).access === "team")) return res.status(404).json({ error: "No encontrada" });
  res.json(db.prepare("SELECT * FROM comments WHERE task_id = ? ORDER BY created_at, id").all(t.id));
});

api.post("/tasks/:id/comments", (req, res) => {
  const u = me(req);
  const t = getTask(Number(req.params.id));
  if (!t || (t.heads_only && u.access === "team")) return res.status(404).json({ error: "No encontrada" });
  const body = String(req.body.body || "").trim();
  if (!body) return res.status(400).json({ error: "Comentario vacío." });
  db.prepare("INSERT INTO comments (task_id, user_id, body) VALUES (?, ?, ?)").run(t.id, u.id, body);
  db.prepare("UPDATE tasks SET updated_at = ? WHERE id = ?").run(now(), t.id);
  broadcast("tasks");
  res.json(db.prepare("SELECT * FROM comments WHERE task_id = ? ORDER BY created_at, id").all(t.id));
});

app.use("/api", api);

// ---------------------------------------------------------------------------
// static client (production build)

const dist = path.resolve(process.cwd(), "dist");
if (PROD || fs.existsSync(path.join(dist, "index.html"))) {
  app.use(express.static(dist));
  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api") || req.path.startsWith("/files")) return next();
    res.sendFile(path.join(dist, "index.html"));
  });
}

// ---------------------------------------------------------------------------
// first run: create an admin so someone can log in

function ensureAdmin() {
  const count = (db.prepare("SELECT COUNT(*) AS n FROM users").get() as any).n as number;
  if (count === 0) {
    insertRow("users", { name: "Admin", role_title: "UPM", department: "Producción", access: "head", token: newToken() });
  }
}

function lanAddresses() {
  const out: string[] = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const i of list ?? []) if (i.family === "IPv4" && !i.internal) out.push(i.address);
  }
  return out;
}

ensureAdmin();
housekeeping(true);

app.listen(PORT, "0.0.0.0", () => {
  const webPort = PROD ? PORT : 5173;
  const base = (process.env.PUBLIC_URL || "").replace(/\/$/, "") || `http://localhost:${webPort}`;
  const heads = db.prepare("SELECT name, token FROM users WHERE access = 'head' AND active = 1 ORDER BY id LIMIT 3").all() as any[];
  const lan = lanAddresses();
  console.log("\n  PA Assistant en marcha\n");
  console.log(`  Dirección:           ${base}`);
  if (!process.env.PUBLIC_URL) for (const ip of lan) console.log(`  Desde el móvil (WiFi): http://${ip}:${webPort}`);
  console.log("\n  Enlaces de acceso de jefatura:");
  for (const h of heads) console.log(`   - ${h.name}: ${base}/l/${h.token}`);
  console.log("");
});
