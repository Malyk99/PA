import type { Task } from "../../../shared/types";
import { KIND_LABEL } from "../../../shared/types";
import { useStore } from "../store";
import { Avatar, Points, UrgencyChip, openTask } from "./ui";
import { deadlineLabel, isOverdue } from "../lib/format";

export function TaskCard({ t, draggable, compact, onQuickDone }: { t: Task; draggable?: boolean; compact?: boolean; onQuickDone?: (t: Task) => void }) {
  const s = useStore();
  const place = s.places.find((p) => p.id === t.place_id);
  const veh = s.vehicles.find((v) => v.id === t.vehicle_id);
  const jor = s.jornadas.find((j) => j.id === t.jornada_id);
  const overdue = isOverdue(t.deadline, t.status);
  return (
    <article
      className={`card task urgbar-${t.urgency} ${t.status === "done" ? "is-done" : ""} ${overdue ? "is-overdue" : ""}`}
      draggable={draggable}
      onDragStart={(e) => {
        e.dataTransfer.setData("text/task", String(t.id));
        e.dataTransfer.effectAllowed = "move";
      }}
      onClick={() => openTask(t.id)}
      tabIndex={0}
      onKeyDown={(e) => e.key === "Enter" && openTask(t.id)}
    >
      <div className="task-top">
        {onQuickDone && t.status !== "done" && (
          <button
            className="tick"
            aria-label="Marcar como hecha"
            onClick={(e) => {
              e.stopPropagation();
              onQuickDone(t);
            }}
          />
        )}
        {onQuickDone && t.status === "done" && <span className="tick done" aria-label="Hecha" />}
        <div className="task-title">{t.title}</div>
        <Points p={t.points} />
      </div>
      {!compact && (
        <div className="task-meta">
          {t.urgency !== "week" && t.status !== "done" && <UrgencyChip u={t.urgency} />}
          {t.kind !== "general" && <span className="chip ghost">{KIND_LABEL[t.kind]}</span>}
          {t.deadline && <span className={`chip time ${overdue ? "late" : ""}`}>{overdue ? "Atrasada · " : ""}{deadlineLabel(t.deadline)}</span>}
          {t.carried_over ? <span className="chip carried">Arrastrada</span> : null}
          {t.heads_only ? <span className="chip ghost">Solo jefatura</span> : null}
          {t.status === "blocked" && <span className="chip blocked">Bloqueada</span>}
        </div>
      )}
      {(place || veh || jor || !compact) && (
        <div className="task-foot">
          <span className="task-where">
            {[veh?.name, place?.name, jor && !compact ? `Día ${jor.day_number ?? ""}`.trim() : null].filter(Boolean).join(" · ")}
          </span>
          <span className="task-who">
            {t.comment_count ? <span className="ccount" title="Comentarios">{t.comment_count} msj</span> : null}
            <Avatar name={s.userName(t.assignee_id)} size={22} />
          </span>
        </div>
      )}
    </article>
  );
}
