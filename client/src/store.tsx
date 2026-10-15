import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { api, ApiError, subscribe } from "./api";
import type { Contact, Jornada, Place, Settings, Task, User, Vehicle } from "../../shared/types";

export interface JornadaSummary extends Jornada {
  task_count: number;
  task_done: number;
}

interface Store {
  me: User;
  users: User[];
  places: Place[];
  vehicles: Vehicle[];
  settings: Settings;
  tasks: Task[];
  contacts: Contact[];
  reloadContacts: () => Promise<void>;
  jornadas: JornadaSummary[];
  version: number; // bumps when jornadas change so detail views refetch
  reloadMeta: () => Promise<void>;
  reloadTasks: () => Promise<void>;
  reloadJornadas: () => Promise<void>;
  setTasks: React.Dispatch<React.SetStateAction<Task[]>>;
  can: (min: "pa" | "head") => boolean;
  userName: (id: number | null | undefined) => string;
  toast: (msg: string) => void;
  online: boolean;
}

const Ctx = createContext<Store | null>(null);

export function useStore() {
  const s = useContext(Ctx);
  if (!s) throw new Error("store missing");
  return s;
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<"loading" | "anon" | "ready" | "error">("loading");
  const [err, setErr] = useState("");
  const [meta, setMeta] = useState<{ me: User; users: User[]; places: Place[]; vehicles: Vehicle[]; settings: Settings } | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [jornadas, setJornadas] = useState<JornadaSummary[]>([]);
  const [version, setVersion] = useState(0);
  const [toastMsg, setToastMsg] = useState("");
  const [online, setOnline] = useState(true);
  const [tick, setTick] = useState(0);
  const toastTimer = useRef<number>();

  const reloadMeta = useCallback(async () => {
    const m = await api.get<any>("/bootstrap");
    setMeta(m);
  }, []);
  const reloadContacts = useCallback(async () => {
    try {
      setContacts(await api.get<Contact[]>("/contacts"));
    } catch {
      setContacts([]); // team members have no access to the directory
    }
  }, []);
  const reloadTasks = useCallback(async () => setTasks(await api.get<Task[]>("/tasks")), []);
  const reloadJornadas = useCallback(async () => {
    setJornadas(await api.get<JornadaSummary[]>("/jornadas"));
    setVersion((v) => v + 1);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        await Promise.all([reloadMeta(), reloadTasks(), reloadJornadas(), reloadContacts()]);
        setState("ready");
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) setState("anon");
        else {
          setErr(String((e as Error).message));
          setState("error");
        }
      }
    })();
  }, [reloadMeta, reloadTasks, reloadJornadas]);

  useEffect(() => {
    if (state !== "ready") return;
    const unsub = subscribe((topic) => {
      setOnline(true);
      if (topic === "tasks") reloadTasks().catch(() => {});
      if (topic === "jornadas") {
        reloadJornadas().catch(() => {});
        reloadTasks().catch(() => {});
      }
      if (topic === "meta") reloadMeta().catch(() => {});
      if (topic === "contacts") reloadContacts().catch(() => {});
    });
    // refresh when the phone wakes up / tab regains focus
    const onVis = () => {
      if (document.visibilityState === "visible") {
        Promise.all([reloadTasks(), reloadJornadas()]).then(() => setOnline(true)).catch(() => setOnline(false));
      }
    };
    document.addEventListener("visibilitychange", onVis);
    // tick once a minute so "overdue" badges update
    const t = window.setInterval(() => setTick((v) => v + 1), 60_000);
    return () => {
      unsub();
      document.removeEventListener("visibilitychange", onVis);
      clearInterval(t);
    };
  }, [state, reloadTasks, reloadJornadas, reloadMeta]);

  const toast = useCallback((msg: string) => {
    setToastMsg(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToastMsg(""), 2600);
  }, []);

  const value = useMemo<Store | null>(() => {
    if (!meta) return null;
    const rank = { team: 0, pa: 1, head: 2 } as const;
    return {
      ...meta,
      tasks,
      contacts,
      reloadContacts,
      jornadas,
      version,
      reloadMeta,
      reloadTasks,
      reloadJornadas,
      setTasks,
      can: (min) => rank[meta.me.access] >= rank[min],
      userName: (id) => meta.users.find((u) => u.id === id)?.name ?? "",
      toast,
      online,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meta, tasks, contacts, reloadContacts, jornadas, version, reloadMeta, reloadTasks, reloadJornadas, toast, online, tick]);

  if (state === "loading") return <div className="splash">Cargando…</div>;
  if (state === "anon")
    return (
      <div className="splash">
        <div className="splash-card">
          <div className="brand-mark">PROD</div>
          <h1>Abre tu enlace personal</h1>
          <p>Para entrar, usa el enlace que te ha enviado producción por WhatsApp. Si no lo tienes, pídeselo a tu jefe de producción.</p>
        </div>
      </div>
    );
  if (state === "error" || !value)
    return (
      <div className="splash">
        <div className="splash-card">
          <h1>No se puede conectar</h1>
          <p>{err || "El servidor no responde. Comprueba que el ordenador de producción está encendido y en la misma WiFi."}</p>
          <button className="btn" onClick={() => location.reload()}>Reintentar</button>
        </div>
      </div>
    );

  return (
    <Ctx.Provider value={value}>
      {children}
      {toastMsg && <div className="toast" role="status">{toastMsg}</div>}
    </Ctx.Provider>
  );
}
