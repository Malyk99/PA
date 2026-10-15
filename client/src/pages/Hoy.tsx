import { useMemo } from "react";
import { useStore } from "../store";
import { quickDone, useTodayJornada } from "../hooks";
import { TaskCard } from "../components/TaskCard";
import { Avatar, Empty, Section, sumPoints, openTask } from "../components/ui";
import { isOverdue, longDate, minutesOf, todayISO } from "../lib/format";
import type { Task } from "../../../shared/types";

interface Ev {
  min: number;
  time: string;
  label: string;
  detail?: string;
  kind: "call" | "dept" | "run" | "task";
  taskId?: number;
}

const WINDOW = 180; // minutes ahead

export function Hoy() {
  const s = useStore();
  const t0 = todayISO();
  const { summary, j } = useTodayJornada(t0);
  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();

  const todayTasks = useMemo(
    () =>
      s.tasks.filter(
        (t) =>
          (summary && t.jornada_id === summary.id) ||
          (!t.jornada_id && (t.status === "today" || t.status === "doing" || t.status === "blocked")) ||
          t.deadline?.startsWith(t0)
      ),
    [s.tasks, summary, t0]
  );

  const behind = useMemo(() => {
    const list = s.tasks.filter((t) => t.status !== "done" && (isOverdue(t.deadline, t.status) || t.status === "blocked" || (t.carried_over && t.status !== "backlog")));
    const carried = s.tasks.filter((t) => t.carried_over && t.status === "backlog");
    return { list, carried };
  }, [s.tasks]);

  const upcoming = useMemo(() => {
    const ev: Ev[] = [];
    if (j) {
      const byStart = new Map<string, string[]>();
      for (const c of j.calls) if (c.start) byStart.set(c.start, [...(byStart.get(c.start) ?? []), c.name]);
      for (const [time, names] of byStart) ev.push({ min: minutesOf(time) ?? -1, time, label: `Entran ${names.join(", ")}`, kind: "call" });
      const byEnd = new Map<string, string[]>();
      for (const c of j.calls) if (c.end) byEnd.set(c.end, [...(byEnd.get(c.end) ?? []), c.name]);
      for (const [time, names] of byEnd) ev.push({ min: minutesOf(time) ?? -1, time, label: `Salen ${names.join(", ")}`, kind: "call" });
      for (const d of j.dept_calls) ev.push({ min: minutesOf(d.time) ?? -1, time: d.time, label: d.label, kind: "dept" });
      for (const r of j.runs.filter((x) => x.kind !== "NOTA"))
        ev.push({
          min: minutesOf(r.time) ?? -1,
          time: r.time,
          label: `${r.kind === "REC" ? "Recogida" : "Devolución"} · ${r.passenger}`,
          detail: `${r.vehicle_label} · ${r.origin} → ${r.destination}`,
          kind: "run",
        });
      if (j.hours_start) ev.push({ min: minutesOf(j.hours_start) ?? -1, time: j.hours_start, label: "Empieza la jornada de rodaje", kind: "dept" });
      if (j.hours_end) ev.push({ min: minutesOf(j.hours_end) ?? -1, time: j.hours_end, label: "Fin de rodaje", kind: "dept" });
    }
    for (const t of todayTasks) {
      if (t.status === "done" || !t.deadline?.startsWith(t0)) continue;
      const time = t.deadline.split("T")[1];
      if (time === "23:59") continue;
      ev.push({ min: minutesOf(time) ?? -1, time, label: t.title, detail: s.userName(t.assignee_id) || "Sin asignar", kind: "task", taskId: t.id });
    }
    return ev.filter((e) => e.min >= nowMin && e.min <= nowMin + WINDOW).sort((a, b) => a.min - b.min);
  }, [j, todayTasks, nowMin, t0, s]);

  const open = todayTasks.filter((t) => t.status !== "done");
  const done = todayTasks.filter((t) => t.status === "done");
  const unassigned = open.filter((t) => !t.assignee_id);

  const load = useMemo(() => {
    const people = new Map<number, Task[]>();
    for (const t of open) if (t.assignee_id) people.set(t.assignee_id, [...(people.get(t.assignee_id) ?? []), t]);
    const onCall = new Set(j?.calls.filter((c) => c.start && c.user_id).map((c) => c.user_id!) ?? []);
    for (const id of onCall) if (!people.has(id)) people.set(id, []);
    return [...people.entries()]
      .map(([id, ts]) => ({ id, name: s.userName(id), pts: sumPoints(ts), n: ts.length, offToday: j ? !onCall.has(id) : false }))
      .sort((a, b) => b.pts - a.pts);
  }, [open, j, s]);
  const maxPts = Math.max(13, ...load.map((l) => l.pts));

  const pct = todayTasks.length ? Math.round((done.length / todayTasks.length) * 100) : 0;

  return (
    <div className="page hoy">
      <div className="live-head">
        <div>
          <div className="kicker">
            En vivo · {longDate(t0)}
            {summary?.day_number ? ` · Día ${summary.day_number}` : ""}
          </div>
          <div className="clock">{now.toTimeString().slice(0, 5)}</div>
        </div>
        <div className="progress-wrap" title={`${done.length} de ${todayTasks.length} tareas hechas`}>
          <div className="progress-num">
            {done.length}/{todayTasks.length}
          </div>
          <div className="progress">
            <div style={{ width: `${pct}%` }} />
          </div>
          <div className="muted small">tareas de hoy</div>
        </div>
      </div>

      <div className="live-grid">
        <div>
          <Section title={<>Se ha quedado atrás <span className="count warn">{behind.list.length}</span></>} className="behind">
            {behind.list.length === 0 ? (
              <Empty>Nada atrasado ni bloqueado.</Empty>
            ) : (
              <div className="stack">
                {behind.list.map((t) => (
                  <TaskCard key={t.id} t={t} onQuickDone={(x) => quickDone(x, s)} />
                ))}
              </div>
            )}
            {behind.carried.length > 0 && (
              <a className="carried-note" href="#/tablero">
                {behind.carried.length} tarea{behind.carried.length > 1 ? "s" : ""} de días anteriores volvieron al backlog sin terminar. Revisar en el tablero
              </a>
            )}
          </Section>

          <Section title={<>Próximas 3 horas</>}>
            {upcoming.length === 0 ? (
              <Empty>Nada programado en las próximas 3 horas.</Empty>
            ) : (
              <ol className="timeline">
                {upcoming.map((e, i) => (
                  <li key={i} className={`tl tl-${e.kind}`} onClick={() => e.taskId && openTask(e.taskId)}>
                    <span className="tl-time">{e.time}</span>
                    <span className="tl-dot" />
                    <span className="tl-body">
                      <span className="tl-label">{e.label}</span>
                      {e.detail && <span className="tl-detail">{e.detail}</span>}
                    </span>
                    <span className="tl-in">en {fmtIn(e.min - nowMin)}</span>
                  </li>
                ))}
              </ol>
            )}
          </Section>
        </div>

        <div>
          <Section title="Carga del equipo hoy" right={<span className="muted small">puntos abiertos</span>}>
            {load.length === 0 ? (
              <Empty>Nadie tiene tareas hoy.</Empty>
            ) : (
              <div className="load">
                {load.map((l) => (
                  <div key={l.id} className={`load-row ${l.pts >= 13 ? "heavy" : ""}`}>
                    <Avatar name={l.name} size={24} />
                    <span className="load-name">
                      {l.name}
                      {l.offToday && <span className="muted small"> · no citado</span>}
                    </span>
                    <span className="load-bar">
                      <span style={{ width: `${(l.pts / maxPts) * 100}%` }} />
                    </span>
                    <span className="load-pts">{l.pts}</span>
                  </div>
                ))}
                {unassigned.length > 0 && <div className="muted small">{unassigned.length} tarea(s) de hoy sin asignar · {sumPoints(unassigned)} pts</div>}
              </div>
            )}
          </Section>

          <Section title={<>Pendiente hoy <span className="count">{open.length}</span></>}>
            {open.length === 0 ? (
              <Empty>Todo hecho.</Empty>
            ) : (
              <div className="stack">
                {open
                  .filter((t) => !behind.list.includes(t))
                  .map((t) => (
                    <TaskCard key={t.id} t={t} onQuickDone={(x) => quickDone(x, s)} />
                  ))}
              </div>
            )}
          </Section>

          {done.length > 0 && (
            <Section title={<>Hecho hoy <span className="count ok">{done.length}</span></>}>
              <div className="stack">
                {done.map((t) => (
                  <TaskCard key={t.id} t={t} compact onQuickDone={() => {}} />
                ))}
              </div>
            </Section>
          )}
        </div>
      </div>
    </div>
  );
}

function fmtIn(m: number) {
  if (m < 1) return "ahora";
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h} h ${r}` : `${h} h`;
}
