import { useLocale } from "../lib/locale";
import { useEffect, useState, type FormEvent } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  formatPvpBtc,
  isPvpRegionId,
  PVP_ENERGY_INTERVAL_MS,
  PVP_REGIONS,
  PVP_STARTER_BTC,
  pvpRegion,
  type PvpRegionId,
  type PvpSelf,
  type PvpState,
} from "@null-protocol/shared";
import { arenaName, readSelectedServer } from "../lib/servers";
import { useConnectionStatus } from "../hooks/useConnectionStatus";
import { usePvpWorld } from "../hooks/usePvpWorld";
import { NetworkPanel } from "../components/Pvp/NetworkPanel";
import { DeviceServices } from "../components/Pvp/DeviceServices";
import { DefensePanel } from "../components/Pvp/DefensePanel";
import {
  CapturePanel,
  IncidentPanel,
} from "../components/Pvp/IntelligencePanel";
import { ConsolePanel } from "../components/Pvp/ConsolePanel";
import { remainingSeconds, type RunPvpAction } from "../components/Pvp/common";
import "./PVPView.css";

const PANELS = [
  { id: "network", label: "Operaciones" },
  { id: "defense", label: "Defensas" },
  { id: "incidents", label: "Incidentes" },
  { id: "traffic", label: "Capturas" },
  { id: "console", label: "Terminal" },
] as const;

function useWorldTime(serverTime: string): number {
  const [now, setNow] = useState(() => Date.parse(serverTime));
  useEffect(() => {
    const epoch = Date.parse(serverTime);
    const started = performance.now();
    setNow(epoch);
    const timer = window.setInterval(
      () => setNow(epoch + performance.now() - started),
      500,
    );
    return () => window.clearInterval(timer);
  }, [serverTime]);
  return now;
}

function DeployForm({
  initialRegion,
  busy,
  join,
}: {
  initialRegion: PvpRegionId;
  busy: boolean;
  join: (region: PvpRegionId, alias: string) => Promise<string>;
}) {
  const { t, locale } = useLocale();
  const [region, setRegion] = useState<PvpRegionId>(initialRegion);
  const [alias, setAlias] = useState("");
  const deploy = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    void join(region, alias.trim());
  };
  return (
    <section className="pvp-card pvp-deploy" aria-labelledby="deploy-title">
      <p className="eyebrow">{t("XploitworlD / RED ABIERTA")}</p>
      <h1 id="deploy-title">{t("Despliega tu dispositivo PVP")}</h1>
      <p>
        {t(
          "Tu dispositivo tiene servicios virtuales para verificar conectividad y practicar controles de defensa.",
        )}
      </p>
      <div className="pvp-starter">
        <span>{t("Crédito de primer despliegue")}</span>
        <strong>
          {PVP_STARTER_BTC} {t("BTC de Arena")}
        </strong>
      </div>
      <form onSubmit={deploy} className="pvp-deploy-form">
        <label>
          {t("Alias de operador")}
          <input
            value={alias}
            onChange={(e) => setAlias(e.target.value)}
            minLength={3}
            maxLength={24}
            pattern="[A-Za-z0-9_\-]{3,24}"
            required
            autoComplete="nickname"
            placeholder={t("Tu alias")}
          />
        </label>
        <label>
          {t("Arena de despliegue")}
          <select
            aria-label={t("Arena de despliegue")}
            value={region}
            onChange={(e) => {
              if (isPvpRegionId(e.target.value)) setRegion(e.target.value);
            }}
          >
            {PVP_REGIONS.map((item) => (
              <option value={item.id} key={item.id}>
                {arenaName(item, locale, t)}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className="pvp-primary" disabled={busy}>
          {busy ? t("Desplegando…") : t("Entrar al mundo PVP")}
        </button>
      </form>
      <Link to="/servidores" className="text-link">{t("Elegir arena en el Atlas")}</Link>
      <Link to="/pvp" className="text-link">
        {t("Abrir mi escritorio")}
      </Link>
    </section>
  );
}

function Operations({
  state,
  busy,
  run,
  query,
  onRoster,
  live,
}: {
  state: PvpState;
  busy: boolean;
  run: RunPvpAction;
  query: string;
  onRoster: (page: number, query: string) => void;
  live: boolean;
}) {
  const { t, locale } = useLocale();
  const [panel, setPanel] = useState<(typeof PANELS)[number]["id"]>("network");
  const now = useWorldTime(state.serverTime);
  const self = state.self!;
  const region = pvpRegion(self.regionId);
  const alerts = state.events.filter(
    (event) =>
      !event.archived &&
      !event.acknowledgedAt &&
      (event.kind === "alert" || event.kind === "integrity"),
  ).length;
  const energy = Math.min(
    100,
    self.energy +
      Math.floor(
        Math.max(0, now - Date.parse(state.serverTime)) /
          PVP_ENERGY_INTERVAL_MS,
      ),
  );
  const deviceStatus =
    self.integrity === 0
      ? "Comprometido"
      : self.config.isolated
        ? "Aislado"
        : "En red";
  return (
    <>
      <header className="pvp-header">
        <div>
          <p className="eyebrow">{t("XploitworlD / RED ABIERTA")}</p>
          <h1>{t("Operaciones PVP")}</h1>
          <p>
            <strong>{self.alias}</strong> ·{" "}
            <Link to={"/servidores?arena=" + encodeURIComponent(region.id)}>
              {arenaName(region, locale, t)}
            </Link>{" "}
            · <code>{self.address}</code>
            {self.ipv4 && (
              <>
                {" "}
                · <code>{self.ipv4}</code>
              </>
            )}
          </p>
        </div>
        <span className={"pvp-pill " + (live ? "pvp-green" : "pvp-muted")}>
          {live ? t("Sincronización en vivo") : t("Actualización periódica")}
        </span>
      </header>
      <section
        className="pvp-metrics"
        aria-label={t("Estado de tu dispositivo")}
      >
        <div>
          <small>{t("Saldo")}</small>
          <strong>
            {formatPvpBtc(self.balanceSats)} <span>BTC</span>
          </strong>
        </div>
        <div>
          <small>{t("Integridad")}</small>
          <strong>{self.integrity}%</strong>
          <progress
            aria-label={t("Integridad")}
            max={100}
            value={self.integrity}
          />
        </div>
        <div>
          <small>{t("Energía")}</small>
          <strong>{energy}/100</strong>
          <progress aria-label={t("Energía")} max={100} value={energy} />
        </div>
        <div>
          <small>{t("Dispositivo")}</small>
          <strong className={self.integrity === 0 ? "pvp-critical" : ""}>
            {t(deviceStatus)}
          </strong>
          <span>
            {self.config.tools.length}
            {t(" paquetes instalados")}
          </span>
        </div>
      </section>
      <Link to="/dispositivo" className="text-link">
        {t("Configurar dispositivo y servicios")}
      </Link>
      <nav className="pvp-tabs" aria-label={t("Paneles PVP")}>
        {PANELS.map((item) => (
          <button
            type="button"
            key={item.id}
            aria-pressed={panel === item.id}
            onClick={() => setPanel(item.id)}
          >
            {t(item.label)}
            {item.id === "incidents" && alerts > 0 && (
              <span className="pvp-count" aria-label={alerts + t(" sin leer")}>
                {alerts}
              </span>
            )}
          </button>
        ))}
      </nav>
      {panel === "network" && (
        <NetworkPanel
          world={state}
          self={self}
          now={now}
          busy={busy}
          run={run}
          query={query}
          onRoster={onRoster}
        />
      )}
      {panel === "defense" && (
        <DefensePanel self={self} peers={state.peers} busy={busy} run={run} />
      )}
      {panel === "incidents" && (
        <IncidentPanel
          events={state.events}
          self={self}
          busy={busy}
          now={now}
          run={run}
        />
      )}
      {panel === "traffic" && (
        <CapturePanel
          events={state.events}
          installed={self.config.tools.includes("capture")}
        />
      )}
      {panel === "console" && (
        <ConsolePanel state={state} self={self} busy={busy} run={run} />
      )}
    </>
  );
}

function DeviceWorkspace({
  self,
  serverTime,
  busy,
  run,
}: {
  self: PvpSelf;
  serverTime: string;
  busy: boolean;
  run: RunPvpAction;
}) {
  const { t } = useLocale();
  const now = useWorldTime(serverTime);
  const repairCooldown = remainingSeconds(self.repairReadyAt, now);
  return (
    <>
      <header className="pvp-header">
        <div>
          <p className="eyebrow">{t("RED ABIERTA / DISPOSITIVO")}</p>
          <h1>{t("Configuración del dispositivo")}</h1>

          <p>
            {t("Define qué servicios quedan expuestos al resto de la arena.")}
          </p>
          <p>
            <strong>
              {self.alias}@{self.hostname}
            </strong>{" "}
            · <code>{self.address}</code>
            {self.ipv4 && (
              <>
                {" "}
                · <code>{self.ipv4}</code>
              </>
            )}
          </p>
        </div>
        <Link to="/pvp" className="text-link">
          {t("Volver a PvP")}
        </Link>
      </header>
      <div className="pvp-actions pvp-device-actions">
        <button
          disabled={busy || self.integrity === 100 || repairCooldown > 0}
          onClick={() => void run({ type: "repair" })}
        >
          {repairCooldown
            ? t("Reparación en ") + repairCooldown + " s"
            : t("Reparar · 15 E")}
        </button>
        {self.config.tools.includes("firewall") && (
          <button
            disabled={busy}
            onClick={() =>
              void run({ type: "isolate", enabled: !self.config.isolated })
            }
          >
            {self.config.isolated
              ? t("Retirar aislamiento")
              : t("Aislar dispositivo")}
          </button>
        )}
        <span className="pvp-muted">
          {self.integrity === 0
            ? t("Repara el equipo para volver a operar.")
            : t("La energía se recupera cada 2 s.")}
        </span>
      </div>
      <DeviceServices self={self} busy={busy} run={run} now={now} />
    </>
  );
}

export function PVPView({
  wsUrl,
  device = false,
}: {
  wsUrl: string;
  device?: boolean;
}) {
  const { t } = useLocale();
  const location = useLocation();
  const requested: unknown = location.state?.serverId;
  const initialRegion = isPvpRegionId(requested)
    ? requested
    : (readSelectedServer()?.id ?? "sa");
  const [roster, setRoster] = useState({ page: 0, query: "" });
  const pvp = usePvpWorld(wsUrl, roster.page, roster.query);
  const visit = pvp.state?.self?.arenaVisit;
  useEffect(() => {
    setRoster((previous) =>
      previous.page || previous.query ? { page: 0, query: "" } : previous,
    );
  }, [visit]);
  const live = useConnectionStatus(wsUrl) === "open";
  return (
    <div className="pvp-view">
      {pvp.readError && (
        <div className="pvp-feedback pvp-feedback-error" role="alert">
          <span>{t(pvp.readError)}</span>
          <button type="button" onClick={() => void pvp.refresh()}>
            {t("Actualizar estado")}
          </button>
        </div>
      )}
      {pvp.feedback && (
        <div
          className={
            "pvp-feedback" + (pvp.feedback.error ? " pvp-feedback-error" : "")
          }
          role={pvp.feedback.error ? "alert" : "status"}
        >
          <span>{t(pvp.feedback.text)}</span>
          {pvp.retry && (
            <div className="pvp-actions">
              <button
                type="button"
                disabled={pvp.busy}
                onClick={() => void pvp.retryAction()}
              >
                {t("Reintentar la misma acción")}
              </button>
              <button
                type="button"
                disabled={pvp.busy}
                onClick={pvp.discardRetry}
              >
                {t("Descartar reintento")}
              </button>
            </div>
          )}
        </div>
      )}
      {!pvp.state && !pvp.readError && (
        <p role="status">{t("Conectando con la arena…")}</p>
      )}
      {device &&
        pvp.state &&
        (pvp.state.self ? (
          <DeviceWorkspace
            self={pvp.state.self}
            serverTime={pvp.state.serverTime}
            busy={pvp.busy}
            run={pvp.run}
          />
        ) : (
          <section className="pvp-card">
            <h1>{t("Configuración del dispositivo")}</h1>
            <p>
              {t("Despliega un dispositivo para configurar sus servicios.")}
            </p>
            <Link to="/pvp" className="text-link">
              {t("Desplegar en PvP")}
            </Link>
          </section>
        ))}
      {!device &&
        pvp.state &&
        (pvp.state.self ? (
          <Operations
            key={pvp.state.self.id + ":" + pvp.state.self.arenaVisit}
            state={pvp.state}
            busy={pvp.busy}
            run={pvp.run}
            query={roster.query}
            live={live}
            onRoster={(page, query) => setRoster({ page, query })}
          />
        ) : (
          <DeployForm
            initialRegion={initialRegion}
            busy={pvp.busy}
            join={pvp.join}
          />
        ))}
    </div>
  );
}
