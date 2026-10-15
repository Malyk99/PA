import { useState } from "react";
import { useRoute, go } from "./router";
import { useStore } from "./store";
import { MiDia } from "./pages/MiDia";
import { Hoy } from "./pages/Hoy";
import { Tablero } from "./pages/Tablero";
import { Jornadas } from "./pages/Jornadas";
import { JornadaPage } from "./pages/JornadaPage";
import { Transporte } from "./pages/Transporte";
import { Equipo } from "./pages/Equipo";
import { Catalogo } from "./pages/Catalogo";
import { Ajustes } from "./pages/Ajustes";
import { Directorio } from "./pages/Directorio";
import { TaskModal } from "./components/TaskModal";
import { ACCESS_LABEL } from "../../shared/types";

export function App() {
  const route = useRoute();
  const s = useStore();
  const [moreOpen, setMoreOpen] = useState(false);
  const [r0, r1, r2] = route;

  // full-screen print view, no chrome
  if (r0 === "jornada" && r2 === "transporte") return <Transporte id={Number(r1)} />;

  let page;
  switch (r0) {
    case undefined:
    case "mi-dia":
      page = <MiDia />;
      break;
    case "hoy":
      page = <Hoy />;
      break;
    case "tablero":
      page = <Tablero />;
      break;
    case "jornadas":
      page = <Jornadas />;
      break;
    case "jornada":
      page = <JornadaPage id={Number(r1)} />;
      break;
    case "equipo":
      page = <Equipo />;
      break;
    case "catalogo":
      page = <Catalogo />;
      break;
    case "directorio":
      page = <Directorio />;
      break;
    case "ajustes":
      page = <Ajustes />;
      break;
    default:
      page = <MiDia />;
  }

  const tabs: { key: string; label: string; path: string; match: string[] }[] = [
    { key: "mi", label: "Mi día", path: "/", match: ["", "mi-dia"] },
    { key: "hoy", label: "En vivo", path: "/hoy", match: ["hoy"] },
    { key: "tab", label: "Tablero", path: "/tablero", match: ["tablero"] },
    { key: "jor", label: "Jornadas", path: "/jornadas", match: ["jornadas", "jornada"] },
  ];
  const cur = r0 ?? "";
  const extra = [
    { label: "Equipo", path: "/equipo", show: s.can("pa") },
    { label: "Directorio reparto", path: "/directorio", show: s.can("pa") },
    { label: "Lugares y vehículos", path: "/catalogo", show: true },
    { label: "Ajustes de producción", path: "/ajustes", show: s.can("head") },
  ];

  const openTask = new URLSearchParams(location.hash.split("?")[1] ?? "").get("tarea");

  return (
    <div className="app">
      <header className="topbar">
        <a className="brand" href="#/">
          <span className="brand-mark">PROD</span>
          <span className="brand-name">{s.settings.production_name}</span>
        </a>
        <nav className="topnav">
          {tabs.map((t) => (
            <a key={t.key} href={`#${t.path}`} className={t.match.includes(cur) ? "on" : ""}>
              {t.label}
            </a>
          ))}
          {extra.filter((e) => e.show).map((e) => (
            <a key={e.path} href={`#${e.path}`} className={`desk-only ${"/" + cur === e.path ? "on" : ""}`}>
              {e.label.split(" ")[0]}
            </a>
          ))}
        </nav>
        <div className="who">
          <span className="who-name">{s.me.name}</span>
          <span className="who-role">{s.me.role_title || ACCESS_LABEL[s.me.access]}</span>
          {!s.online && <span className="offline-dot" title="Sin conexión" />}
        </div>
      </header>

      <main className="main">{page}</main>

      <nav className="tabbar">
        {tabs.map((t) => (
          <a key={t.key} href={`#${t.path}`} className={t.match.includes(cur) ? "on" : ""}>
            {t.label}
          </a>
        ))}
        <button className={moreOpen ? "on" : ""} onClick={() => setMoreOpen((v) => !v)}>
          Más
        </button>
      </nav>
      {moreOpen && (
        <div className="sheet-backdrop" onClick={() => setMoreOpen(false)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            {extra.filter((e) => e.show).map((e) => (
              <button key={e.path} className="sheet-item" onClick={() => { setMoreOpen(false); go(e.path); }}>
                {e.label}
              </button>
            ))}
          </div>
        </div>
      )}
      {openTask && <TaskModal taskId={Number(openTask)} onClose={() => (location.hash = location.hash.split("?")[0])} />}
    </div>
  );
}
