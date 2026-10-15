const DAYS = ["DOMINGO", "LUNES", "MARTES", "MIÉRCOLES", "JUEVES", "VIERNES", "SÁBADO"];
const MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

export function parseDate(iso: string): Date {
  return new Date(iso.slice(0, 10) + "T12:00:00");
}

export function weekday(iso: string): string {
  return DAYS[parseDate(iso).getDay()];
}

/** "JUEVES 15.10.2026" */
export function msgDate(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${weekday(iso)} ${d}.${m}.${y}`;
}

/** "jueves, 15 de octubre" */
export function longDate(iso: string): string {
  const d = parseDate(iso);
  const w = DAYS[d.getDay()].toLowerCase();
  return `${w.charAt(0).toUpperCase()}${w.slice(1)}, ${d.getDate()} de ${MONTHS[d.getMonth()]}`;
}

/** "Jue 15 oct" */
export function shortDate(iso: string): string {
  const d = parseDate(iso);
  const w = DAYS[d.getDay()].slice(0, 3);
  return `${w.charAt(0)}${w.slice(1).toLowerCase()} ${d.getDate()} ${MONTHS[d.getMonth()].slice(0, 3)}`;
}

export function todayISO(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function nowLocal(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${todayISO()}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function addDays(iso: string, n: number): string {
  const d = parseDate(iso);
  d.setDate(d.getDate() + n);
  const p = (x: number) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** deadline "YYYY-MM-DDTHH:MM" -> "12:00" if today, else "Jue 15 oct 12:00" */
export function deadlineLabel(dl: string | null): string {
  if (!dl) return "";
  const [date, time] = dl.split("T");
  if (date === todayISO()) return time || "hoy";
  if (date === addDays(todayISO(), 1)) return `mañana ${time ?? ""}`.trim();
  return `${shortDate(date)}${time ? " " + time : ""}`;
}

export function isOverdue(dl: string | null, status: string): boolean {
  if (!dl || status === "done") return false;
  const full = dl.length === 10 ? `${dl}T23:59` : dl;
  return full < nowLocal();
}

export function mapsLink(address: string, url?: string): string {
  if (url) return url;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
}

export function telLink(phone: string): string {
  return `tel:${phone.replace(/[^\d+]/g, "")}`;
}

export function waLink(text: string, phone?: string): string {
  const p = phone ? phone.replace(/[^\d]/g, "") : "";
  return `https://wa.me/${p}?text=${encodeURIComponent(text)}`;
}

export function minutesOf(hhmm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

/** "7:30" -> "07:30" */
export function normTime(t: string): string {
  const m = /^(\d{1,2})[:.h](\d{2})$/.exec(t.trim());
  if (!m) return t.trim();
  return `${m[1].padStart(2, "0")}:${m[2]}`;
}
