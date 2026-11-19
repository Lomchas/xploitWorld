import { useEffect } from "react";
import {
  Link,
  Navigate,
  Route,
  Routes,
  useLocation,
  useSearchParams,
} from "react-router-dom";
import { ConfigView } from "./views/ConfigView";
import { GAME_VERSION, MenuView } from "./views/MenuView";
import { useLocale } from "./lib/locale";
import { worldUrl } from "./lib/world-mode";

function OpenWorld({ mode, path }: { mode: "story" | "pvp"; path: string }) {
  const { t } = useLocale();
  const { search, hash } = useLocation();
  const target = worldUrl(
    mode,
    path.includes("?") ? path + hash : path + search + hash,
  );
  useEffect(() => {
    window.location.replace(target);
  }, [target]);
  return (
    <a href={target}>{t(mode === "story" ? "Historia" : "Multijugador PvP")}</a>
  );
}

function LegacyExchange() {
  const [params] = useSearchParams();
  const arena = params.get("panel") === "servicios";
  return (
    <OpenWorld
      mode={arena ? "pvp" : "story"}
      path={arena ? "/contratos" : "/exchange?" + params}
    />
  );
}

export default function App() {
  const { t } = useLocale();
  const { pathname } = useLocation();
  return (
    <div className="game-shell">
      <a className="skip-link" href="#main">
        {t("Ir al contenido")}
      </a>
      {pathname === "/config" && (
        <header className="game-header">
          <Link to="/" className="game-back">
            ← {t("Menú principal")}
          </Link>
          <span className="game-wordmark">
            XploitworlD_ <small>{GAME_VERSION}</small>
          </span>
        </header>
      )}
      <main
        id="main"
        tabIndex={-1}
        className={
          pathname === "/" ? "game-main-menu" : "main-content game-section"
        }
      >
        <Routes>
          <Route path="/" element={<MenuView />} />
          <Route path="/config" element={<ConfigView />} />
          <Route
            path="/historia"
            element={<OpenWorld mode="story" path="/historia" />}
          />
          <Route
            path="/partidas"
            element={<OpenWorld mode="story" path="/partidas" />}
          />
          <Route
            path="/practicas"
            element={<OpenWorld mode="story" path="/practicas" />}
          />
          <Route path="/exchange" element={<LegacyExchange />} />
          {["/pvp", "/arena", "/servidores", "/dispositivo", "/contratos"].map(
            (path) => (
              <Route
                key={path}
                path={path}
                element={<OpenWorld mode="pvp" path={path} />}
              />
            ),
          )}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}
