import { useLocale } from "../../lib/locale";
import { useState, type FormEvent } from "react";
import {
  PVP_MAX_RULES,
  PVP_TOOLS,
  type PvpPeer,
  type PvpPolicy,
  type PvpSelf,
  type PvpToolId,
  type PvpTransport,
} from "@null-protocol/shared";
import { peerLabel, type RunPvpAction } from "./common";

interface DefenseProps {
  self: PvpSelf;
  peers: PvpPeer[];
  busy: boolean;
  run: RunPvpAction;
}
const tools = Object.keys(PVP_TOOLS) as PvpToolId[];

function FirewallControls({ self, peers, busy, run }: DefenseProps) {
  const { t } = useLocale();
  const [decision, setDecision] = useState<PvpPolicy>("drop");
  const [protocol, setProtocol] = useState<PvpTransport>("tcp");
  const [port, setPort] = useState("");
  const [source, setSource] = useState("");
  const config = self.config;
  const addRule = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    void run({
      type: "rule.add",
      rule: {
        action: decision,
        protocol,
        port: port === "" ? null : Number(port),
        sourceId: source || null,
      },
    });
  };
  return (
    <section className="pvp-card pvp-span" aria-labelledby="firewall-title">
      <div className="pvp-section-title">
        <h2 id="firewall-title">{t("Firewall de entrada")}</h2>
        <span className="pvp-pill">
          {config.rules.length}/{PVP_MAX_RULES} reglas
        </span>
      </div>
      <p className="pvp-muted">
        {t(
          "La primera regla que coincide decide. Al final se aplica la política de entrada.",
        )}
      </p>
      <label className="pvp-field">
        {t("Política por defecto")}
        <select
          aria-label={t("Política por defecto")}
          value={config.policy}
          disabled={busy}
          onChange={(event) =>
            void run({
              type: "policy",
              policy: event.target.value as PvpPolicy,
            })
          }
        >
          <option value="allow">{t("Permitir")}</option>
          <option value="drop">{t("Descartar")}</option>
        </select>
      </label>
      <form className="pvp-inline-form pvp-rule-form" onSubmit={addRule}>
        <label>
          {t("Acción de regla")}
          <select
            aria-label={t("Acción de regla")}
            value={decision}
            onChange={(event) => setDecision(event.target.value as PvpPolicy)}
          >
            <option value="drop">{t("Descartar")}</option>
            <option value="allow">{t("Permitir")}</option>
          </select>
        </label>
        <label>
          {t("Protocolo de regla")}
          <select
            aria-label={t("Protocolo de regla")}
            value={protocol}
            onChange={(event) =>
              setProtocol(event.target.value as PvpTransport)
            }
          >
            <option value="tcp">TCP</option>
            <option value="udp">UDP</option>
            <option value="any">{t("Cualquiera")}</option>
          </select>
        </label>
        <label>
          {t("Puerto de regla")}
          <input
            type="number"
            value={port}
            min={1}
            max={65535}
            step={1}
            onChange={(event) => setPort(event.target.value)}
            placeholder={t("Cualquiera")}
          />
        </label>
        <label>
          {t("Origen de regla")}
          <select
            aria-label={t("Origen de regla")}
            value={source}
            onChange={(event) => setSource(event.target.value)}
          >
            <option value="">{t("Cualquier equipo")}</option>
            {peers.map((peer) => (
              <option value={peer.id} key={peer.id}>
                {peer.alias}
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          disabled={busy || config.rules.length >= PVP_MAX_RULES}
        >
          {t("Añadir regla")}
        </button>
      </form>
      {config.rules.length === 0 && (
        <p className="pvp-empty">
          {t("Cadena vacía. Todos los puertos siguen la política por defecto.")}
        </p>
      )}
      <ol className="pvp-list">
        {config.rules.map((rule, index) => (
          <li key={rule.id} className="pvp-row">
            <span>
              <strong>
                {index + 1}.{" "}
                {rule.action === "drop" ? t("Descartar") : t("Permitir")}{" "}
                {rule.protocol.toUpperCase()}/{rule.port ?? "*"}
              </strong>
              <small>
                {t("Origen")}{" "}
                {rule.sourceId ? peerLabel(peers, rule.sourceId) : "cualquiera"}
              </small>
            </span>
            <div className="pvp-actions">
              <button
                aria-label={t("Subir regla ") + (index + 1)}
                disabled={busy || index === 0}
                onClick={() =>
                  void run({
                    type: "rule.move",
                    ruleId: rule.id,
                    direction: "up",
                  })
                }
              >
                ↑
              </button>
              <button
                aria-label={t("Bajar regla ") + (index + 1)}
                disabled={busy || index === config.rules.length - 1}
                onClick={() =>
                  void run({
                    type: "rule.move",
                    ruleId: rule.id,
                    direction: "down",
                  })
                }
              >
                ↓
              </button>
              <button
                aria-label={t("Quitar regla ") + (index + 1)}
                disabled={busy}
                onClick={() =>
                  void run({ type: "rule.remove", ruleId: rule.id })
                }
              >
                {t("Quitar")}
              </button>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

function VpnControls({ self, peers, busy, run }: DefenseProps) {
  const { t } = useLocale();
  const [selectedPeer, setSelectedPeer] = useState("");
  const { config } = self;
  const available = peers.filter(
    (peer) => !config.trustedPeers.includes(peer.id),
  );
  return (
    <section className="pvp-card" aria-labelledby="vpn-title">
      <div className="pvp-section-title">
        <h2 id="vpn-title">{t("VPN y pares")}</h2>
        <span className="pvp-pill">UDP/51820</span>
      </div>
      <p className="pvp-muted">
        {t(
          "Con el túnel activo, TCP/22 requiere que ambos equipos se autoricen. El firewall sigue filtrando el tráfico.",
        )}
      </p>
      <button
        disabled={busy}
        onClick={() => void run({ type: "vpn", enabled: !config.vpn })}
      >
        {config.vpn ? t("Desactivar VPN") : t("Activar VPN")}
      </button>
      <form
        className="pvp-inline-form"
        onSubmit={(event) => {
          event.preventDefault();
          if (selectedPeer)
            void run({
              type: "trust",
              targetId: selectedPeer,
              enabled: true,
            }).then((result) => {
              if (result) setSelectedPeer("");
            });
        }}
      >
        <label>
          {t("Par VPN")}
          <select
            aria-label={t("Par VPN")}
            value={selectedPeer}
            onChange={(event) => setSelectedPeer(event.target.value)}
          >
            <option value="">{t("Seleccionar equipo")}</option>
            {available.map((peer) => (
              <option key={peer.id} value={peer.id}>
                {peer.alias}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" disabled={busy || !selectedPeer}>
          {t("Confiar")}
        </button>
      </form>
      <ul className="pvp-list">
        {config.trustedPeers.map((id) => (
          <li className="pvp-row" key={id}>
            <span>{peerLabel(peers, id)}</span>
            <button
              disabled={busy}
              onClick={() =>
                void run({ type: "trust", targetId: id, enabled: false })
              }
            >
              {t("Revocar confianza")}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function DefensePanel(props: DefenseProps) {
  const { t } = useLocale();
  const { self, busy, run } = props;
  const { config } = self;
  return (
    <div className="pvp-columns">
      <section className="pvp-card pvp-span" aria-labelledby="modules-title">
        <div className="pvp-section-title">
          <h2 id="modules-title">{t("Paquetes instalables")}</h2>
          <span className="pvp-pill">{t("6 energía por paquete")}</span>
        </div>
        <p className="pvp-muted">
          {t(
            "En M2 puedes instalar herramientas con energía. El saldo BTC queda disponible para la economía de M3.",
          )}
        </p>
        <div className="pvp-tools">
          {tools.map((tool) => {
            const installed = config.tools.includes(tool);
            return (
              <article key={tool} className="pvp-tool">
                <h3>{t(PVP_TOOLS[tool].name)}</h3>
                <p>{t(PVP_TOOLS[tool].description)}</p>
                {installed ? (
                  <span className="pvp-pill pvp-green">{t("Instalado")}</span>
                ) : (
                  <button
                    aria-label={t("Instalar ") + t(PVP_TOOLS[tool].name)}
                    disabled={busy}
                    onClick={() => void run({ type: "install", tool })}
                  >
                    {t("Instalar")}
                  </button>
                )}
              </article>
            );
          })}
        </div>
      </section>
      {config.tools.includes("vpn") && <VpnControls {...props} />}
      {config.tools.includes("firewall") && <FirewallControls {...props} />}
    </div>
  );
}
