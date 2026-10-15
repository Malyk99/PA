import { useMemo, useState } from "react";
import { useStore } from "../store";
import { useTodayJornada, quickDone, useJornada } from "../hooks";
import { TaskCard } from "../components/TaskCard";
import { TaskModal } from "../components/TaskModal";
import { Empty, Section, sumPoints } from "../components/ui";
import { addDays, isOverdue, longDate, mapsLink, todayISO } from "../lib/format";
import type { Task } from "../../../shared/types";

export function MiDia() {
  const s = useStore();
  const t0 = todayISO();
  const [date, setDate] = useState(t0);
  const { summary, j } = useTodayJornada(date);
  const [creating, setCreating] = useState(false);

  // next published jornada after the selected date, for the "mañana" preview
  const next = s.jornadas.find((x) => x.date > date && (x.status === "published" || s.can("pa")));
  const nextFull = useJornada(next?.id).j;

  const myCall = j?.calls.find((c) => c.user_id === s.me.id);
  const nextCall = nextFull?.calls.find((c) => c.user_id === s.me.id);

  const mine = useMemo(() => {
    const list = s.tasks.filter((t) => t.assignee_id === s.me.id);
    const forDay = list.filter(
      (t) =>
        (summary && t.jornada_id === summary.id) ||
        (date === t0 && t.status !== "backlog" && t.status !== "done" && !t.jornada_id) ||
        (date === t0 && t.deadline?.startsWith(t0))
    );
    const uniq = Array.from(new Map(forDay.map((t) => [t.id, t])).values());
    const order = (t: Task) => (t.status === "done" ? 3 : isOverdue(t.deadline, t.status) ? 0 : t.urgency === "blocker" ? 0.5 : 1);
    uniq.sort((a, b) => order(a) - order(b) || (a.deadline ?? "99").localeCompare(b.deadline ?? "99"));
    const backlog = list.filter((t) => t.status !== "done" && !uniq.includes(t));
    return { day: uniq, backlog };
  }, [s.tasks, s.me.id, summary, date, t0]);

  const open = mine.day.filter((t) => t.status !== "done");
  const draftHidden = summary && summary.status === "draft" && !s.can("pa");

  return (
    <div className="page midia">
      <div className="day-switch">
        <button className="btn ghost sm" onClick={() => setDate(addDays(date, -1))} aria-label="Día anterior">‹</button>
        <div className="day-switch-label">
          <div className="kicker">{date === t0 ? "Hoy" : date === addDays(t0, 1) ? "Mañana" : date < t0 ? "Pasado" : "Próximo"}</div>
          <div className="day-title">{longDate(date)}</div>
        </div>
        <button className="btn ghost sm" onClick={() => setDate(addDays(date, 1))} aria-label="Día siguiente">›</button>
      </div>

      {!summary || draftHidden ? (
        <div className="hero-call off">
          <div className="hero-label">Sin jornada publicada</div>
          <div className="hero-sub">Cuando producción publique la jornada aparecerá aquí tu citación.</div>
        </div>
      ) : (
        <div className="hero-call">
          <div className="hero-top">
            <span className="hero-label">Tu citación</span>
            {summary.day_number ? (
              <span className="hero-day">
                Día {summary.day_number}
                {s.settings.total_days ? `/${s.settings.total_days}` : ""}
              </span>
            ) : null}
            {summary.status === "draft" && <span className="chip draft">Borrador</span>}
          </div>
          {myCall ? (
            myCall.start ? (
              <div className="hero-time">
                {myCall.start}
                <span className="hero-dash">–</span>
                {myCall.end}
              </div>
            ) : (
              <div className="hero-time small">{myCall.note || "Sin hora"}</div>
            )
          ) : (
            <div className="hero-time small">No estás citado</div>
          )}
          {myCall?.start && myCall.note && <div className="hero-note">{myCall.note}</div>}
          {j && (
            <div className="hero-loc">
              <div>
                <div className="hero-loc-name">{j.location_text || "Localización"}</div>
                <div className="hero-loc-addr">{j.address}</div>
              </div>
              {(j.address || j.maps_url) && (
                <a className="btn sm light" href={mapsLink(j.address || j.location_text, j.maps_url)} target="_blank" rel="noreferrer">
                  Cómo llegar
                </a>
              )}
            </div>
          )}
          {j && (
            <div className="hero-facts">
              {j.hours_start && (
                <span>
                  Rodaje <b>{j.hours_start}–{j.hours_end}</b>
                </span>
              )}
              {j.meals && <span>{j.meals}</span>}
              {j.weather && <span>{j.weather}</span>}
            </div>
          )}
        </div>
      )}

      {j?.notes && <div className="note-banner">{j.notes}</div>}

      <Section
        title={
          <>
            Mis cositas <span className="count">{open.length}</span>
          </>
        }
        right={
          <div className="row gap">
            {open.length > 0 && <span className="muted small">{sumPoints(open)} pts</span>}
            <button className="btn sm" onClick={() => setCreating(true)}>+ Tarea</button>
          </div>
        }
      >
        {mine.day.length === 0 ? (
          <Empty>Nada asignado para este día.</Empty>
        ) : (
          <div className="stack">
            {mine.day.map((t) => (
              <TaskCard key={t.id} t={t} onQuickDone={(x) => quickDone(x, s)} />
            ))}
          </div>
        )}
      </Section>

      {j && j.attachments.length > 0 && (
        <Section title="Documentos del día">
          <div className="docs">
            {j.attachments.map((a) => (
              <a key={a.id} className="doc" href={`/files/${a.id}`} target="_blank" rel="noreferrer">
                <span className="doc-ext">{a.filename.split(".").pop()?.toUpperCase()}</span>
                <span className="doc-name">{a.label || a.filename}</span>
              </a>
            ))}
          </div>
        </Section>
      )}

      {j && (
        <div className="row gap wrap">
          {j.runs.length > 0 && (
            <a className="btn ghost" href={`#/jornada/${j.id}/transporte`}>
              Orden de transporte
            </a>
          )}
          <a className="btn ghost" href={`#/jornada/${j.id}`}>
            Ver jornada completa
          </a>
        </div>
      )}

      {next && nextFull && (
        <Section title={date === t0 ? "Mañana" : "Siguiente jornada"} className="next">
          <div className="card next-card" onClick={() => setDate(next.date)}>
            <div>
              <div className="kicker">{longDate(next.date)}{next.status === "draft" ? " · borrador" : ""}</div>
              <div className="next-loc">{nextFull.location_text}</div>
            </div>
            <div className="next-call">{nextCall ? (nextCall.start ? `${nextCall.start}–${nextCall.end}` : nextCall.note) : "—"}</div>
          </div>
        </Section>
      )}

      {mine.backlog.length > 0 && (
        <Section title={<>Pendiente sin día <span className="count">{mine.backlog.length}</span></>}>
          <div className="stack">
            {mine.backlog.map((t) => (
              <TaskCard key={t.id} t={t} />
            ))}
          </div>
        </Section>
      )}

      {creating && <TaskModal draft={{ jornada_id: summary?.id ?? null, assignee_id: s.me.id, status: summary ? "today" : "backlog" }} onClose={() => setCreating(false)} />}
    </div>
  );
}
