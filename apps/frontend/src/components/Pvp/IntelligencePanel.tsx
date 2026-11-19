import { useLocale } from "../../lib/locale";
import { useState } from "react";
import {
  PVP_EVIDENCE_TTL_MS,
  PVP_SERVICES,
  type PvpEvent,
  type PvpProtocol,
  type PvpSelf,
} from "@null-protocol/shared";
import { PORT_LABEL, stamp, type RunPvpAction } from "./common";

interface EvidenceProps {
  events: PvpEvent[];
  self: PvpSelf;
  busy: boolean;
  now: number;
  run: RunPvpAction;
}
const EVENT_NAMES: Record<PvpEvent["kind"], string> = {
  join: "Despliegue",
  transfer: "Traslado",
  link: "Enlace",
  scan: "Reconocimiento",
  probe: "Sonda",
  alert: "Alerta IDS",
  integrity: "Integridad",
  configuration: "Configuración",
  analysis: "Análisis NPX",
  repair: "Reparación",
};
export function IncidentPanel({ events, self, busy, now, run }: EvidenceProps) {
  const { t } = useLocale();
  const [filter, setFilter] = useState<"all" | "incident" | "analysis">(
    "incident",
  );
  const rows = events.filter(
    (event) =>
      filter === "all" ||
      (filter === "analysis"
        ? event.kind === "analysis"
        : event.kind === "alert" || event.kind === "integrity"),
  );
  const has = (tool: "ids" | "firewall" | "analyzer"): boolean =>
    self.config.tools.includes(tool);
  return (
    <section className="pvp-card" aria-labelledby="pvp-incidents-title">
      <div className="pvp-section-title">
        <h2 id="pvp-incidents-title">{t("Incidentes y análisis")}</h2>
        <span className="pvp-pill">{t("Registro privado")}</span>
      </div>
      <p className="pvp-muted">
        {t(
          "Revisa los registros del IDS y documenta el origen y el efecto de cada incidente.",
        )}
      </p>
      <label className="pvp-field">
        {t("Filtro de eventos")}
        <select
          aria-label={t("Filtro de eventos")}
          value={filter}
          onChange={(e) => setFilter(e.target.value as typeof filter)}
        >
          <option value="incident">{t("Incidentes")}</option>
          <option value="analysis">{t("Análisis")}</option>
          <option value="all">{t("Todos")}</option>
        </select>
      </label>
      {rows.length === 0 && (
        <p className="pvp-empty">{t("Todavía no hay eventos de este tipo.")}</p>
      )}
      <ul className="pvp-list">
        {rows.map((event) => {
          const recent =
            !event.archived &&
            Date.parse(event.createdAt) + PVP_EVIDENCE_TTL_MS >= now;
          const source =
            event.kind === "alert" && event.peerId && event.incident;
          return (
            <li key={event.id} className="pvp-event">
              <article aria-label={t(event.message)}>
                <div className="pvp-section-title">
                  <div className="pvp-actions">
                    <span className={"pvp-pill pvp-" + event.severity}>
                      {t(EVENT_NAMES[event.kind])}
                    </span>
                    {event.archived && (
                      <span className="pvp-muted">{t("Visita anterior")}</span>
                    )}
                    {!event.archived &&
                      !event.acknowledgedAt &&
                      (event.kind === "alert" ||
                        event.kind === "integrity") && (
                        <span className="pvp-green">{t("Nuevo")}</span>
                      )}
                  </div>
                  <time dateTime={event.createdAt}>
                    {stamp(event.createdAt)}
                  </time>
                </div>
                <p>{t(event.message)}</p>
                {(source || event.specimen) && (
                  <code className="pvp-evidence-id">{event.id}</code>
                )}
                {event.specimen && (
                  <details className="pvp-details">
                    <summary>{t("Inspeccionar muestra NPX1")}</summary>
                    <dl>
                      <dt>{t("Hexadecimal")}</dt>
                      <dd>
                        <code>{event.specimen.hex}</code>
                      </dd>
                      <dt>SHA-256</dt>
                      <dd>
                        <code>{event.specimen.sha256}</code>
                      </dd>
                    </dl>
                    <button
                      disabled={busy || !!event.archived || !has("analyzer")}
                      onClick={() =>
                        void run({ type: "analyze", eventId: event.id })
                      }
                    >
                      {t("Analizar muestra")}
                    </button>
                    {!has("analyzer") && (
                      <p className="pvp-muted">
                        {t("Instala el laboratorio de análisis en Defensas.")}
                      </p>
                    )}
                  </details>
                )}
                {event.analysis && (
                  <div className="pvp-details">
                    <strong>{event.analysis.signature}</strong>
                    <pre>{event.analysis.instructions.join("\n")}</pre>
                    <p>{t(event.analysis.remedy)}</p>
                    <button
                      disabled={
                        busy ||
                        self.config.services[event.analysis.service].patched
                      }
                      onClick={() =>
                        void run({
                          type: "patch",
                          service: event.analysis!.service,
                        })
                      }
                    >
                      {self.config.services[event.analysis.service].patched
                        ? t("Servicio parcheado")
                        : t("Parchear ") +
                          PVP_SERVICES[event.analysis.service].name}
                    </button>
                  </div>
                )}
                <div className="pvp-actions">
                  {source && recent && has("firewall") && (
                    <button
                      disabled={busy}
                      onClick={() =>
                        void run({ type: "block", eventId: event.id })
                      }
                    >
                      {t("Bloquear origen")}
                    </button>
                  )}
                  {!event.archived &&
                    !event.acknowledgedAt &&
                    (event.kind === "alert" || event.kind === "integrity") && (
                      <button
                        disabled={busy}
                        onClick={() =>
                          void run({ type: "ack", eventId: event.id })
                        }
                      >
                        {t("Marcar leído")}
                      </button>
                    )}
                  {source && !recent && (
                    <small>
                      {t("Evidencia fuera de la ventana de respuesta.")}
                    </small>
                  )}
                </div>
              </article>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function CapturePanel({
  events,
  installed,
}: {
  events: PvpEvent[];
  installed: boolean;
}) {
  const { t } = useLocale();
  const [protocol, setProtocol] = useState<PvpProtocol | "all">("all");
  const flows = events
    .flatMap((event) =>
      (event.flows ?? []).map((flow, index) => ({
        flow,
        id: event.id + "-" + index,
        time: event.createdAt,
      })),
    )
    .filter(({ flow }) => protocol === "all" || flow.protocol === protocol)
    .slice(0, 120);
  return (
    <section className="pvp-card" aria-labelledby="pvp-capture-title">
      <div className="pvp-section-title">
        <h2 id="pvp-capture-title">{t("Capturas de interfaz virtual")}</h2>
        <span className="pvp-pill">{flows.length} flujos</span>
      </div>
      <p className="pvp-muted">
        {t(
          "Inspecciona el intercambio TCP o UDP, el origen y el destino virtuales y el cifrado observado.",
        )}
      </p>
      <label className="pvp-field">
        {t("Protocolo de captura")}
        <select
          aria-label={t("Protocolo de captura")}
          value={protocol}
          onChange={(e) => setProtocol(e.target.value as typeof protocol)}
        >
          <option value="all">{t("Todos")}</option>
          <option value="tcp">TCP</option>
          <option value="udp">UDP</option>
        </select>
      </label>
      {!installed && (
        <p className="pvp-empty">
          {t(
            "Instala Captura de tráfico en Defensas para registrar los flujos nuevos.",
          )}
        </p>
      )}
      {installed && flows.length === 0 && (
        <p className="pvp-empty">
          {t(
            "Aún no hay flujos con ese filtro. Escanea un dispositivo de tu región para generar tráfico.",
          )}
        </p>
      )}
      <ul className="pvp-list">
        {flows.map(({ flow, id, time }) => (
          <li className="pvp-event" key={id}>
            <details>
              <summary className="pvp-flow-summary">
                <strong>
                  {flow.protocol.toUpperCase()}/{flow.port}
                </strong>
                <span className={"pvp-state pvp-" + flow.state}>
                  {t(PORT_LABEL[flow.state])}
                </span>
                <span className="pvp-pill">
                  {flow.encryption === "none"
                    ? t("Sin cifrado")
                    : flow.encryption.toUpperCase() + " cifrado"}
                </span>
                <time dateTime={time}>{stamp(time)}</time>
              </summary>
              <dl className="pvp-flow-addresses">
                <dt>{t("Origen")}</dt>
                <dd>
                  <code>
                    [{flow.source}]:{flow.sourcePort}
                  </code>
                </dd>
                <dt>{t("Destino")}</dt>
                <dd>
                  <code>
                    [{flow.destination}]:{flow.port}
                  </code>
                </dd>
              </dl>
              <ol className="pvp-trace">
                {flow.trace.map((line, index) => (
                  <li key={index}>{line}</li>
                ))}
              </ol>
            </details>
          </li>
        ))}
      </ul>
    </section>
  );
}
