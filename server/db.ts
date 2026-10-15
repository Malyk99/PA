import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

export const DATA_DIR = process.env.PA_DATA_DIR || path.resolve(process.cwd(), "data");
export const UPLOAD_DIR = path.join(DATA_DIR, "uploads");
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

export const db = new Database(path.join(DATA_DIR, "pa.db"));
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  role_title TEXT NOT NULL DEFAULT '',
  department TEXT NOT NULL DEFAULT 'Producción',
  phone TEXT NOT NULL DEFAULT '',
  access TEXT NOT NULL DEFAULT 'team' CHECK (access IN ('head','pa','team')),
  token TEXT NOT NULL UNIQUE,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS places (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL DEFAULT 'location' CHECK (kind IN ('location','vendor')),
  name TEXT NOT NULL,
  address TEXT NOT NULL DEFAULT '',
  maps_url TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS vehicles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  driver TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS jornadas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL UNIQUE,
  day_number INTEGER,
  title TEXT NOT NULL DEFAULT '',
  location_id INTEGER REFERENCES places(id) ON DELETE SET NULL,
  location_text TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  maps_url TEXT NOT NULL DEFAULT '',
  hours_start TEXT NOT NULL DEFAULT '',
  hours_end TEXT NOT NULL DEFAULT '',
  truck_start TEXT NOT NULL DEFAULT '',
  truck_end TEXT NOT NULL DEFAULT '',
  meals TEXT NOT NULL DEFAULT '',
  weather TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  opener_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  truck_notes TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published')),
  published_at TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS calls (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  jornada_id INTEGER NOT NULL REFERENCES jornadas(id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  name TEXT NOT NULL DEFAULT '',
  start TEXT NOT NULL DEFAULT '',
  end TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  sort INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS dept_calls (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  jornada_id INTEGER NOT NULL REFERENCES jornadas(id) ON DELETE CASCADE,
  label TEXT NOT NULL DEFAULT '',
  time TEXT NOT NULL DEFAULT '',
  sort INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  jornada_id INTEGER NOT NULL REFERENCES jornadas(id) ON DELETE CASCADE,
  vehicle_id INTEGER REFERENCES vehicles(id) ON DELETE SET NULL,
  vehicle_label TEXT NOT NULL DEFAULT '',
  kind TEXT NOT NULL DEFAULT 'REC' CHECK (kind IN ('REC','DEV','NOTA')),
  time TEXT NOT NULL DEFAULT '',
  code TEXT NOT NULL DEFAULT '',
  joins_prev INTEGER NOT NULL DEFAULT 0,
  passenger TEXT NOT NULL DEFAULT '',
  passenger_phone TEXT NOT NULL DEFAULT '',
  origin TEXT NOT NULL DEFAULT '',
  arrival TEXT NOT NULL DEFAULT '',
  destination TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  sort INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'backlog' CHECK (status IN ('backlog','today','doing','blocked','done')),
  assignee_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  points INTEGER,
  urgency TEXT NOT NULL DEFAULT 'week' CHECK (urgency IN ('blocker','today','week','whenever')),
  deadline TEXT,
  jornada_id INTEGER REFERENCES jornadas(id) ON DELETE SET NULL,
  kind TEXT NOT NULL DEFAULT 'general' CHECK (kind IN ('general','montaje','recogida','devolucion','gestion')),
  place_id INTEGER REFERENCES places(id) ON DELETE SET NULL,
  vehicle_id INTEGER REFERENCES vehicles(id) ON DELETE SET NULL,
  carried_over INTEGER NOT NULL DEFAULT 0,
  heads_only INTEGER NOT NULL DEFAULT 0,
  sort REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  done_at TEXT,
  done_by INTEGER REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  body TEXT NOT NULL,
  system INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS attachments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  jornada_id INTEGER NOT NULL REFERENCES jornadas(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  stored_name TEXT NOT NULL,
  mime TEXT NOT NULL DEFAULT '',
  size INTEGER NOT NULL DEFAULT 0,
  label TEXT NOT NULL DEFAULT '',
  uploaded_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_assignee ON tasks(assignee_id);
CREATE INDEX IF NOT EXISTS idx_tasks_jornada ON tasks(jornada_id);
CREATE INDEX IF NOT EXISTS idx_comments_task ON comments(task_id);

CREATE TABLE IF NOT EXISTS contacts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL DEFAULT '',
  name TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  grp TEXT NOT NULL DEFAULT 'Reparto',
  notes TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_contacts_code ON contacts(code);
`);

// ---- migrations for databases created by earlier versions ----
function hasColumn(table: string, col: string) {
  return (db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).some((c) => c.name === col);
}
function addColumn(table: string, def: string) {
  const col = def.split(" ")[0];
  if (!hasColumn(table, col)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${def}`);
}
addColumn("jornadas", "transport_number TEXT NOT NULL DEFAULT ''");
addColumn("jornadas", "chapter TEXT NOT NULL DEFAULT ''");

// runs: allow NOTA rows (e.g. "COME"), contact codes and stops joined to the previous run
const runsSql = (db.prepare("SELECT sql FROM sqlite_master WHERE name = 'runs'").get() as { sql: string }).sql;
if (runsSql.includes("CHECK (kind IN ('REC','DEV'))")) {
  db.exec(`
    PRAGMA foreign_keys = OFF;
    BEGIN;
    CREATE TABLE runs_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      jornada_id INTEGER NOT NULL REFERENCES jornadas(id) ON DELETE CASCADE,
      vehicle_id INTEGER REFERENCES vehicles(id) ON DELETE SET NULL,
      vehicle_label TEXT NOT NULL DEFAULT '',
      kind TEXT NOT NULL DEFAULT 'REC' CHECK (kind IN ('REC','DEV','NOTA')),
      time TEXT NOT NULL DEFAULT '',
      code TEXT NOT NULL DEFAULT '',
      passenger TEXT NOT NULL DEFAULT '',
      passenger_phone TEXT NOT NULL DEFAULT '',
      origin TEXT NOT NULL DEFAULT '',
      arrival TEXT NOT NULL DEFAULT '',
      destination TEXT NOT NULL DEFAULT '',
      notes TEXT NOT NULL DEFAULT '',
      joins_prev INTEGER NOT NULL DEFAULT 0,
      sort INTEGER NOT NULL DEFAULT 0
    );
    INSERT INTO runs_new (id, jornada_id, vehicle_id, vehicle_label, kind, time, passenger, passenger_phone, origin, arrival, destination, notes, sort)
      SELECT id, jornada_id, vehicle_id, vehicle_label, kind, time, passenger, passenger_phone, origin, arrival, destination, notes, sort FROM runs;
    DROP TABLE runs;
    ALTER TABLE runs_new RENAME TO runs;
    COMMIT;
    PRAGMA foreign_keys = ON;
  `);
}

export const DEFAULT_SETTINGS: Record<string, string> = {
  production_name: "Nueva producción",
  production_company: "",
  total_days: "",
  office_address: "",
  production_contacts: "",
  signoff_team: "Gracias!\n\nSaludos!",
  signoff_trucks: "Si tenéis alguna duda me decís.\n\nGracias.\n\nSaludos.",
};

const insertSetting = db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)");
for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) insertSetting.run(k, v);

export function now(): string {
  // local time, sortable
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

export function today(): string {
  return now().slice(0, 10);
}
