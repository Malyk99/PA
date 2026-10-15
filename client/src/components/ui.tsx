import type { ReactNode } from "react";
import type { Task, Urgency } from "../../../shared/types";
import { URGENCY_LABEL } from "../../../shared/types";

export function openTask(id: number) {
  const base = location.hash.split("?")[0] || "#/";
  location.hash = `${base.replace(/^#/, "")}?tarea=${id}`;
}

export function Avatar({ name, size = 26 }: { name: string; size?: number }) {
  if (!name) return <span className="avatar empty" style={{ width: size, height: size }} title="Sin asignar">?</span>;
  const initials = name.split(/\s+/).map((p) => p[0]).join("").slice(0, 2).toUpperCase();
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) % 360;
  return (
    <span className="avatar" style={{ width: size, height: size, ["--h" as any]: h }} title={name}>
      {initials}
    </span>
  );
}

export function UrgencyChip({ u }: { u: Urgency }) {
  return <span className={`chip urg-${u}`}>{URGENCY_LABEL[u]}</span>;
}

export function Points({ p }: { p: number | null }) {
  if (!p) return null;
  return <span className="pts" title={`${p} puntos`}>{p}</span>;
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>;
}

export function Section({ title, right, children, className = "" }: { title: ReactNode; right?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`section ${className}`}>
      <div className="section-head">
        <h2>{title}</h2>
        {right}
      </div>
      {children}
    </section>
  );
}

export function sumPoints(tasks: Task[]) {
  return tasks.reduce((a, t) => a + (t.points ?? 0), 0);
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // fallback for http on phones (clipboard API needs https)
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try {
      ok = document.execCommand("copy");
    } catch {
      ok = false;
    }
    ta.remove();
    return ok;
  }
}
