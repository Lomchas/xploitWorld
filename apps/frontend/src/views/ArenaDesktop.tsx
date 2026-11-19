import { useEffect, useState, type FormEvent } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  ARENA_WORKSPACE_ROOT,
  formatPvpBtc,
  PVP_REGIONS,
  PVP_TOOLS,
  pvpRegion,
  isPvpRegionId,
  type PvpRegionId,
  type WorkspaceListing,
} from "@null-protocol/shared";
import { listWorkspace } from "../lib/api";
import { useLocale } from "../lib/locale";
import { arenaName, readSelectedServer } from "../lib/servers";
import { usePvpWorld } from "../hooks/usePvpWorld";
import "./ArenaDesktop.css";

function PersonalFiles({ user }: { user: string }) {
  const { t } = useLocale();
  const [path, setPath] = useState(ARENA_WORKSPACE_ROOT);
  const [files, setFiles] = useState<WorkspaceListing>();
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    void listWorkspace(path)
      .then((result) => {
        if (active) {
          setFiles(result);
          setError("");
        }
      })
      .catch((reason: unknown) => {
        if (active)
          setError(
            reason instanceof Error
              ? reason.message
              : "Falló la lectura de archivos.",
          );
      });
    return () => {
      active = false;
    };
  }, [path, user]);
  return (
    <section className="arena-files">
      <h2>{t("Archivos personales")}</h2>
      <code>{path.replace(ARENA_WORKSPACE_ROOT, "~/archivos")}</code>
      {path !== ARENA_WORKSPACE_ROOT && (
        <button onClick={() => setPath(path.slice(0, path.lastIndexOf("/")))}>
          {t("Carpeta anterior")}
        </button>
      )}
      {error && <p role="alert">{t(error)}</p>}
      {files &&
        (files.entries.length ? (
          <ul>
            {files.entries.map((entry) => {
              const name = entry.path.split("/").at(-1);
              return (
                <li key={entry.path}>
                  {entry.kind === "DIRECTORY" ? (
                    <button type="button" onClick={() => setPath(entry.path)}>
                      {name}/
                    </button>
                  ) : entry.kind === "TEXT" ? (
                    <Link to="/terminal" state={{ file: entry.path }}>
                      {name}
                    </Link>
                  ) : (
                    <span>{name}</span>
                  )}
                </li>
              );
            })}
          </ul>
        ) : (
          <p>{t("Esta carpeta está vacía.")}</p>
        ))}
    </section>
  );
}

export function ArenaDesktop({ wsUrl }: { wsUrl: string }) {
  const { t, locale } = useLocale();
  const world = usePvpWorld(wsUrl, 0, "");
  const self = world.state?.self;
  const [user, setUser] = useState("");
  const [hostname, setHostname] = useState("");
  const location = useLocation();
  const requested: unknown = location.state?.serverId;
  const [region, setRegion] = useState<PvpRegionId>(() =>
    isPvpRegionId(requested) ? requested : (readSelectedServer()?.id ?? "sa"),
  );
  const [files, setFiles] = useState(false);
  const [apps, setApps] = useState(false);
  const deploy = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void world.join(
      region,
      user.trim(),
      hostname.trim().toLowerCase() || undefined,
    );
  };
  return (
    <section className="arena-desktop" aria-labelledby="desktop-title">
      <div className="arena-top">
        <p className="arena-kicker">{t("LABORATORIO MULTIJUGADOR")}</p>
        <h2 id="desktop-title">{self?.hostname ?? t("Tu equipo de Arena")}</h2>
        {self && (
          <p>
            <code>
              {self.alias}@{self.hostname}
            </code>{" "}
            <span>
              {formatPvpBtc(self.balanceSats)} {t("BTC de Arena")}
            </span>
            {" · "}
            <Link to="/servidores">
              {arenaName(pvpRegion(self.regionId), locale, t)}
            </Link>
          </p>
        )}
      </div>
      {world.readError && (
        <p role="alert">
          {t(world.readError)}{" "}
          <button onClick={() => void world.refresh()}>
            {t("Reintentar")}
          </button>
        </p>
      )}
      {world.feedback && (
        <p role={world.feedback.error ? "alert" : "status"}>
          {t(world.feedback.text)}
        </p>
      )}
      {!world.state && !world.readError && (
        <p role="status">{t("Conectando con la arena…")}</p>
      )}
      {world.state && !self && (
        <>
          <form className="arena-deploy" onSubmit={deploy}>
            <label>
              {t("Usuario del equipo")}
              <input
                required
                autoComplete="username"
                minLength={3}
                maxLength={24}
                pattern="[A-Za-z0-9_\\-]{3,24}"
                value={user}
                onChange={(e) => setUser(e.target.value)}
              />
            </label>
            <label>
              {t("Nombre del equipo")}
              <input
                autoComplete="off"
                minLength={3}
                maxLength={32}
                pattern="[a-z0-9][a-z0-9\\-]{1,30}[a-z0-9]"
                value={hostname}
                onChange={(e) => setHostname(e.target.value)}
                placeholder={
                  user
                    ? user.toLowerCase().replaceAll("_", "-") + "-lab"
                    : "operador-lab"
                }
              />
            </label>
            <label>
              {t("Arena de despliegue")}
              <select
                value={region}
                onChange={(e) => {
                  if (isPvpRegionId(e.target.value)) setRegion(e.target.value);
                }}
              >
                {PVP_REGIONS.map((item) => (
                  <option key={item.id} value={item.id}>
                    {arenaName(item, locale, t)}
                  </option>
                ))}
              </select>
            </label>
            <button type="submit" disabled={world.busy}>
              {t("Crear mi computadora")}
            </button>
          </form>
          <Link to="/servidores">{t("Elegir arena en el Atlas")}</Link>
          <Link to="/contratos#account-title">
            {t("Recuperar acceso a Arena")}
          </Link>
        </>
      )}
      {self && (
        <>
          <div
            className="arena-launcher"
            role="group"
            aria-label={t("Aplicaciones del escritorio")}
          >
            <Link to="/terminal">
              <span aria-hidden="true">›_</span>
              {t("Terminal")}
            </Link>
            <button
              type="button"
              onClick={() => setFiles(!files)}
              aria-expanded={files}
            >
              <span aria-hidden="true">▱</span>
              {t("Archivos")}
            </button>
            <Link to="/servidores">
              <span aria-hidden="true">◎</span>
              {t("Atlas de señales")}
            </Link>
            <Link to="/dispositivo">
              <span aria-hidden="true">◫</span>
              {t("Dispositivo")}
            </Link>
            <Link to="/arena">
              <span aria-hidden="true">≋</span>
              {t("Panel de arena")}
            </Link>
            <Link to="/contratos">
              <span aria-hidden="true">↔</span>
              {t("Contratos")}
            </Link>
            <button
              type="button"
              onClick={() => setApps(!apps)}
              aria-expanded={apps}
            >
              <span aria-hidden="true">⠿</span>
              {t("Aplicaciones")}
            </button>
          </div>
          {files && <PersonalFiles user={self.id} />}
          {apps && (
            <section className="arena-files">
              <h2>{t("Aplicaciones instaladas")}</h2>
              <ul>
                {self.config.tools.map((id) => (
                  <li key={id}>
                    <strong>{t(PVP_TOOLS[id].name)}</strong>
                    <p>{t(PVP_TOOLS[id].description)}</p>
                  </li>
                ))}
              </ul>
              <Link to="/dispositivo">{t("Configurar dispositivo")}</Link>
            </section>
          )}
        </>
      )}
    </section>
  );
}
