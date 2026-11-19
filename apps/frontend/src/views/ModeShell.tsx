import { useEffect, useState, type ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { ensureGuestSession } from "../lib/api";
import { getWsClient } from "../lib/ws-client";
import { useLocale } from "../lib/locale";
import { worldUrl } from "../lib/world-mode";
import "./ModeShell.css";
import { useConnectionStatus } from "../hooks/useConnectionStatus";

export function ModeShell({
  mode,
  wsUrl,
  children,
}: {
  mode: "story" | "pvp";
  wsUrl: string;
  children: ReactNode;
}) {
  const { t } = useLocale();
  const standalone =
    mode === "pvp" && import.meta.env.VITE_STANDALONE_PVP === "true";
  const location = useLocation();
  const status = useConnectionStatus(wsUrl);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [paused, setPaused] = useState(false);
  const playing =
    location.pathname === (mode === "story" ? "/historia" : "/terminal");
  const title = mode === "story" ? "Historia" : "Multijugador PvP";
  useEffect(() => {
    let active = true;
    const client = getWsClient(wsUrl);
    setError("");
    void ensureGuestSession()
      .then(() => {
        if (active) client.connect();
      })
      .catch((reason: unknown) => {
        if (active)
          setError(
            reason instanceof Error
              ? reason.message
              : "No se pudo conectar al servidor",
          );
      });
    return () => {
      active = false;
      client.close();
    };
  }, [wsUrl, attempt]);
  useEffect(() => {
    setPaused(false);
    document.getElementById("main")?.focus({ preventScroll: true });
  }, [location.pathname]);
  const entries =
    mode === "story"
      ? [
          ["/historia", "Historia"],
          ["/partidas", "Partidas guardadas"],
          ["/practicas", "Prácticas"],
          ["/exchange", "Exchange"],
        ]
      : [
          ["/pvp", "Escritorio"],
          ["/arena", "Panel de arena"],
          ["/dispositivo", "Dispositivo"],
          ["/servidores", "Atlas de señales"],
          ["/contratos", "Contratos"],
        ];
  return (
    <div className={"game-shell" + (playing ? " game-playing" : "")}>
      <a className="skip-link" href="#main">
        {t("Ir al contenido")}
      </a>
      <header className="game-header">
        {playing ? (
          <button
            type="button"
            className="mode-pause"
            onClick={() => setPaused(!paused)}
            aria-expanded={paused}
          >
            {t(paused ? "Cerrar pausa" : "Pausa")}
          </button>
        ) : (
          <Link
            to={mode === "story" ? "/historia" : "/pvp"}
            className="game-back"
          >
            ← {t(mode === "story" ? "Historia" : "Escritorio")}
          </Link>
        )}
        <h1>{t(title)}</h1>
        <span
          className="game-connection"
          data-online={status === "open"}
          role="status"
        >
          {t(
            status === "open"
              ? "En línea"
              : status === "connecting"
                ? "Conectando…"
                : "Sin conexión",
          )}
        </span>
      </header>
      {paused && (
        <nav className="mode-panel" aria-label={t("Menú de pausa")}>
          {entries.map(([path, label]) => (
            <Link key={path} to={path!} onClick={() => setPaused(false)}>
              {t(label!)}
            </Link>
          ))}
          {!standalone && <a href={worldUrl("menu")}>{t("Menú principal")}</a>}
        </nav>
      )}
      {error && (
        <div className="connection-alert" role="alert">
          {t(error)}{" "}
          <button onClick={() => setAttempt((value) => value + 1)}>
            {t("Reintentar conexión")}
          </button>
        </div>
      )}
      <main
        id="main"
        className={playing ? "game-play-area" : "main-content game-section"}
        tabIndex={-1}
      >
        {children}
      </main>
      {!playing && !standalone && (
        <footer className="mode-footer">
          <a href={worldUrl("menu")}>{t("Menú principal")}</a>
        </footer>
      )}
    </div>
  );
}
