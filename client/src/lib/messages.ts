import type { JornadaFull, Task, Place, Vehicle, User, Settings } from "../../../shared/types";
import { msgDate, minutesOf, deadlineLabel } from "./format";

interface Ctx {
  users: User[];
  places: Place[];
  vehicles: Vehicle[];
  settings: Settings;
}

const byTime = <T,>(get: (x: T) => string) => (a: T, b: T) => {
  const ma = minutesOf(get(a));
  const mb = minutesOf(get(b));
  if (ma == null && mb == null) return 0;
  if (ma == null) return 1;
  if (mb == null) return -1;
  return ma - mb;
};

function locLine(j: JornadaFull) {
  return j.address || j.location_text;
}

/** Message for the production team, matching the WhatsApp format used on set. */
export function teamMessage(j: JornadaFull, tasks: Task[], ctx: Ctx, opts: { includeTasks: boolean; footer?: string }): string {
  const lines: string[] = [];
  lines.push(`CITACIONES ${msgDate(j.date)}`);
  if (locLine(j)) lines.push(`LOC: ${locLine(j)}.`.replace(/\.\.$/, "."));
  if (j.hours_start || j.hours_end) lines.push(`HORARIO - ${j.hours_start} - ${j.hours_end}`);
  lines.push("");
  for (const c of j.calls) {
    const name = (c.name || "").toUpperCase();
    if (!name) continue;
    if (!c.start && !c.end) {
      lines.push(`${name} - ${c.note || "--"}`);
    } else {
      lines.push(`${name} - ${c.start} a ${c.end}${c.note ? " " + c.note : ""}`);
    }
  }
  lines.push("");
  lines.push(ctx.settings.signoff_team || "Gracias!\n\nSaludos!");

  if (opts.includeTasks) {
    const list = tasks.filter((t) => t.jornada_id === j.id && !t.heads_only);
    const montaje = list.filter((t) => t.kind === "montaje");
    const runs = list.filter((t) => t.kind === "recogida" || t.kind === "devolucion");
    const other = list.filter((t) => !["montaje", "recogida", "devolucion"].includes(t.kind));
    if (list.length) {
      lines.push("——————————————————————————");
      lines.push("COSITAS:");
      if (montaje.length) {
        lines.push("");
        lines.push("Hay que montar");
        for (const t of montaje) lines.push(`•  ${t.title}${assigneeSuffix(t, ctx)}`);
      }
      if (runs.length) {
        lines.push("");
        lines.push("Viajecitos a lo largo del día");
        const sorted = [...runs].sort(byTime((t: Task) => (t.deadline?.split("T")[1] ?? "")));
        for (const t of sorted) lines.push(`•  ${runLine(t, ctx)}`);
      }
      if (other.length) {
        lines.push("");
        lines.push("Además");
        for (const t of other) lines.push(`•  ${t.title}${t.deadline ? " " + deadlineLabel(t.deadline) : ""}${assigneeSuffix(t, ctx)}`);
      }
      lines.push("");
      lines.push("Si tenéis dudas me decís.");
      lines.push("");
      lines.push("Gracias!");
    }
  }
  if (opts.footer) {
    lines.push("");
    lines.push(opts.footer);
  }
  return lines.join("\n");
}

function assigneeSuffix(t: Task, ctx: Ctx) {
  const u = ctx.users.find((x) => x.id === t.assignee_id);
  return u ? ` → ${u.name.toUpperCase()}` : "";
}

function runLine(t: Task, ctx: Ctx) {
  const place = ctx.places.find((p) => p.id === t.place_id);
  const veh = ctx.vehicles.find((v) => v.id === t.vehicle_id);
  const time = t.deadline?.split("T")[1];
  let s = t.title;
  if (time) s += ` ${time}`;
  if (veh) s += ` (${veh.name.toUpperCase()})`;
  if (place?.address && !t.title.includes(place.address)) s += ` (${place.address})`;
  s += assigneeSuffix(t, ctx);
  return s;
}

/** Message for truck drivers / departments. */
export function truckMessage(j: JornadaFull, ctx: Ctx): string {
  const lines: string[] = [];
  lines.push(`CITACIÓN CAMIONES ${msgDate(j.date)}`);
  if (locLine(j)) lines.push(`LOC: ${locLine(j)}.`.replace(/\.\.$/, "."));
  const s = j.truck_start || j.hours_start;
  const e = j.truck_end || j.hours_end;
  if (s || e) lines.push(`JORNADA: ${s} - ${e}`);
  lines.push("");
  const sorted = [...j.dept_calls].sort(byTime((d) => d.time));
  for (const d of sorted) if (d.label) lines.push(`${d.time} ${d.label.toUpperCase()}`);
  const opener = ctx.users.find((u) => u.id === j.opener_id);
  if (opener) {
    lines.push("");
    lines.push(`Abrirá ${opener.name.toUpperCase()}.`);
  }
  if (j.truck_notes) {
    lines.push("");
    lines.push(j.truck_notes);
  }
  lines.push("");
  lines.push(ctx.settings.signoff_trucks || "Si tenéis alguna duda me decís.\n\nGracias.\n\nSaludos.");
  return lines.join("\n");
}

/** Short personal message, e.g. to send someone their own call privately. */
export function personalMessage(j: JornadaFull, user: User, tasks: Task[], ctx: Ctx): string {
  const call = j.calls.find((c) => c.user_id === user.id);
  const lines = [`${user.name.toUpperCase()} — ${msgDate(j.date)}`];
  if (call) lines.push(call.start ? `Citación: ${call.start} a ${call.end}${call.note ? " " + call.note : ""}` : `Citación: ${call.note || "--"}`);
  if (locLine(j)) lines.push(`LOC: ${locLine(j)}`);
  const mine = tasks.filter((t) => t.assignee_id === user.id && t.jornada_id === j.id && t.status !== "done");
  if (mine.length) {
    lines.push("");
    lines.push("Tus cositas:");
    for (const t of mine) lines.push(`•  ${t.kind === "recogida" || t.kind === "devolucion" ? runLine({ ...t, assignee_id: null }, ctx) : t.title}`);
  }
  return lines.join("\n");
}
