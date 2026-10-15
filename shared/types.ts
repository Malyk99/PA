// Shared types between server and client.

export type Access = "head" | "pa" | "team";

export interface User {
  id: number;
  name: string;
  role_title: string; // e.g. "UPM", "Ayte. Producción"
  department: string; // e.g. "Producción"
  phone: string;
  access: Access;
  active: number;
  token?: string; // only returned to heads
}

export type PlaceKind = "location" | "vendor";

export interface Place {
  id: number;
  kind: PlaceKind;
  name: string;
  address: string;
  maps_url: string;
  notes: string;
}

export interface Vehicle {
  id: number;
  name: string; // "Van", "Camión cámara", "Coche 1"
  driver: string;
  phone: string;
  notes: string;
}

export interface Jornada {
  id: number;
  date: string; // YYYY-MM-DD
  day_number: number | null;
  title: string;
  location_id: number | null;
  location_text: string;
  address: string;
  maps_url: string;
  hours_start: string; // HH:MM
  hours_end: string;
  truck_start: string;
  truck_end: string;
  meals: string;
  weather: string;
  notes: string;
  opener_id: number | null;
  truck_notes: string;
  transport_number: string;
  chapter: string;
  status: "draft" | "published";
  published_at: string | null;
  updated_at: string;
}

export interface Call {
  id: number;
  jornada_id: number;
  user_id: number | null;
  name: string; // display name (copied from user or free text)
  start: string;
  end: string;
  note: string; // "con disco", "OT", ...
  sort: number;
}

export interface DeptCall {
  id: number;
  jornada_id: number;
  label: string; // "CÁMARA LISTO"
  time: string;
  sort: number;
}

export interface Run {
  id: number;
  jornada_id: number;
  vehicle_id: number | null;
  vehicle_label: string; // "COCHE 1 - DAVID"
  kind: "REC" | "DEV" | "NOTA"; // NOTA = free line such as "COME"
  time: string;
  code: string; // contact code from the directory (24, PE, 1053…)
  joins_prev: number; // 1 = extra stop of the previous REC/DEV (no new number)
  passenger: string;
  passenger_phone: string;
  origin: string;
  arrival: string;
  destination: string;
  notes: string;
  sort: number;
}

export type TaskStatus = "backlog" | "today" | "doing" | "blocked" | "done";
export type Urgency = "blocker" | "today" | "week" | "whenever";
export type TaskKind = "general" | "montaje" | "recogida" | "devolucion" | "gestion";

export interface Task {
  id: number;
  title: string;
  description: string;
  status: TaskStatus;
  assignee_id: number | null;
  created_by: number | null;
  points: number | null; // fibonacci
  urgency: Urgency;
  deadline: string | null; // ISO local "YYYY-MM-DDTHH:MM"
  jornada_id: number | null;
  kind: TaskKind;
  place_id: number | null;
  vehicle_id: number | null;
  carried_over: number; // 1 when it came back from a past jornada
  heads_only: number;
  sort: number;
  created_at: string;
  updated_at: string;
  done_at: string | null;
  done_by: number | null;
  comment_count?: number;
}

export interface Comment {
  id: number;
  task_id: number;
  user_id: number | null;
  body: string;
  system: number;
  created_at: string;
}

export interface Contact {
  id: number;
  code: string;
  name: string;
  phone: string;
  address: string;
  grp: string; // Reparto, Figuración, Equipo, Otro
  notes: string;
}

export interface Attachment {
  id: number;
  jornada_id: number;
  filename: string;
  stored_name: string;
  mime: string;
  size: number;
  label: string;
  uploaded_by: number | null;
  created_at: string;
}

export interface Settings {
  production_name: string;
  production_company: string;
  total_days: string;
  office_address: string;
  production_contacts: string; // free text lines "NAME phone"
  signoff_team: string;
  signoff_trucks: string;
}

export interface JornadaFull extends Jornada {
  calls: Call[];
  dept_calls: DeptCall[];
  runs: Run[];
  attachments: Attachment[];
}

export const FIB = [1, 2, 3, 5, 8, 13, 21] as const;

export const STATUS_LABEL: Record<TaskStatus, string> = {
  backlog: "Backlog",
  today: "Hoy",
  doing: "En curso",
  blocked: "Bloqueado",
  done: "Hecho",
};

export const URGENCY_LABEL: Record<Urgency, string> = {
  blocker: "Bloqueante",
  today: "Hoy",
  week: "Esta semana",
  whenever: "Cuando se pueda",
};

export const KIND_LABEL: Record<TaskKind, string> = {
  general: "General",
  montaje: "Montaje",
  recogida: "Recogida",
  devolucion: "Devolución",
  gestion: "Gestión",
};

export const ACCESS_LABEL: Record<Access, string> = {
  head: "Jefatura",
  pa: "PA / Ayte.",
  team: "Equipo",
};
