import { useEffect, useState } from "react";
import { api } from "./api";
import { useStore } from "./store";
import type { JornadaFull, Task } from "../../shared/types";
import { todayISO } from "./lib/format";

export function useJornada(id: number | null | undefined) {
  const s = useStore();
  const [j, setJ] = useState<JornadaFull | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!id) {
      setJ(null);
      return;
    }
    let alive = true;
    api
      .get<JornadaFull>(`/jornadas/${id}`)
      .then((x) => alive && (setJ(x), setError("")))
      .catch((e) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, [id, s.version]);
  return { j, error, setJ };
}

export function useTodayJornada(date = todayISO()) {
  const s = useStore();
  const summary = s.jornadas.find((x) => x.date === date);
  return { summary, ...useJornada(summary?.id) };
}

export async function quickDone(t: Task, s: ReturnType<typeof useStore>) {
  const body: Partial<Task> = { status: "done" };
  if (t.assignee_id == null) body.assignee_id = s.me.id;
  s.setTasks((ts) => ts.map((x) => (x.id === t.id ? { ...x, status: "done" } : x)));
  try {
    await api.put(`/tasks/${t.id}`, body);
    s.toast("Hecho");
  } catch (e) {
    s.toast((e as Error).message);
  }
  s.reloadTasks();
}
