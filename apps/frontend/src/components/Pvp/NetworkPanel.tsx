import { useLocale } from "../../lib/locale";
import { useState, type FormEvent } from "react";
import {
  normalizeAddress,
  PVP_EVIDENCE_TTL_MS,
  PVP_PAGE_SIZE,
  PVP_PORTS,
  type PvpSelf,
  type PvpState,
} from "@null-protocol/shared";
import { PORT_LABEL, stamp, type RunPvpAction } from "./common";

interface NetworkProps {
  world: PvpState;
  self: PvpSelf;
  busy: boolean;
  now: number;
  run: RunPvpAction;
  query: string;
  onRoster: (page: number, query: string) => void;
}
export function NetworkPanel({
  world,
  self,
  busy,
  now,
  run,
  query,
  onRoster,
}: NetworkProps) {
  const { t } = useLocale();
  const [filter, setFilter] = useState(query);
  const [searchError, setSearchError] = useState("");
  const [targetId, setTargetId] = useState("");
  const [linkPort, setLinkPort] = useState(1);
  const endpoint = PVP_PORTS[linkPort] ?? PVP_PORTS[1];
  const target = world.peers.find((peer) => peer.id === targetId);
  const scan =
    target &&
    world.events.find(
      (event) =>
        !event.archived && event.kind === "scan" && event.peerId === target.id,
    );
  const expired = Boolean(
    scan && Date.parse(scan.createdAt) + PVP_EVIDENCE_TTL_MS < now,
  );
  const ready = self.integrity > 0 && !self.config.isolated;
  const search = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const input = filter.trim();
    const address = input ? normalizeAddress(input) : "";
    if (address === undefined) {
      setSearchError("Escribe una dirección IPv4 o IPv6 completa.");
      return;
    }
    setSearchError("");
    onRoster(0, address);
  };
  return (
    <div className="pvp-columns">
      <section className="pvp-card" aria-labelledby="pvp-network-title">
        <div className="pvp-section-title">
          <h2 id="pvp-network-title">{t("Dispositivos en la red")}</h2>
          <span className="pvp-pill pvp-green">
            {world.onlineCount} activos
          </span>
        </div>
        <form onSubmit={search} className="pvp-inline-form">
          <label>
            {t("Buscar por IPv4 o IPv6")}
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              maxLength={45}
              placeholder={t("10.0.0.2 o 2001:db8:4::2")}
            />
          </label>
          <button type="submit">{t("Buscar")}</button>
        </form>
        {searchError && <p role="alert">{t(searchError)}</p>}
        {world.peers.length === 0 && (
          <p className="pvp-empty">
            {query
              ? t("La búsqueda no encontró dispositivos.")
              : t("Aún no hay otros dispositivos en esta región.")}
          </p>
        )}
        <ul className="pvp-list pvp-roster">
          {world.peers.map((peer) => (
            <li key={peer.id}>
              <button
                type="button"
                aria-pressed={target?.id === peer.id}
                onClick={() => setTargetId(peer.id)}
              >
                <span>
                  <strong>{peer.alias}</strong>
                  {peer.ipv4 && <code>{peer.ipv4}</code>}
                  <code>{peer.address}</code>
                </span>
                <span className={peer.online ? "pvp-green" : "pvp-muted"}>
                  {peer.online ? t("Activo") : t("Ausente")}
                </span>
              </button>
            </li>
          ))}
        </ul>
        {world.peerCount > PVP_PAGE_SIZE && (
          <div className="pvp-pagination">
            <button
              disabled={world.page === 0}
              onClick={() => onRoster(world.page - 1, query)}
            >
              {t("Anterior")}
            </button>
            <span>
              {world.page + 1} / {Math.ceil(world.peerCount / PVP_PAGE_SIZE)}
            </span>
            <button
              disabled={(world.page + 1) * PVP_PAGE_SIZE >= world.peerCount}
              onClick={() => onRoster(world.page + 1, query)}
            >
              {t("Siguiente")}
            </button>
          </div>
        )}
        <p className="pvp-muted">
          {t(
            "Los dispositivos ausentes siguen en la arena con sus defensas guardadas.",
          )}
        </p>
      </section>
      <section className="pvp-card" aria-labelledby="pvp-target-title">
        <div className="pvp-section-title">
          <h2 id="pvp-target-title">{t("Reconocimiento")}</h2>
          <span className="pvp-pill">TCP / UDP</span>
        </div>
        {target ? (
          <>
            <p>
              <strong>{target.alias}</strong>{" "}
              {target.ipv4 && <code>{target.ipv4}</code>}{" "}
              <code>{target.address}</code>
            </p>
            <button
              className="pvp-primary"
              disabled={busy || !ready}
              onClick={() => void run({ type: "scan", targetId: target.id })}
            >
              {t("Escanear dispositivo")}
            </button>
            <div className="pvp-inline-form">
              <label>
                {t("Puerto del enlace")}
                <select
                  value={linkPort}
                  onChange={(event) => setLinkPort(Number(event.target.value))}
                >
                  {PVP_PORTS.map(({ protocol, port }, index) => (
                    <option key={protocol + port} value={index}>
                      {protocol.toUpperCase()}/{port}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                disabled={busy || !ready}
                onClick={() =>
                  void run({
                    type: "link.open",
                    targetId: target.id,
                    ...endpoint,
                  })
                }
              >
                {t("Abrir enlace virtual")}
              </button>
            </div>
            {!ready && (
              <p className="pvp-muted">
                {t(
                  "Recupera la integridad o retira el aislamiento para escanear.",
                )}
              </p>
            )}
            {scan?.ports && (
              <>
                <p className="pvp-muted">
                  {t("Observación de las ")}
                  {stamp(scan.createdAt)}
                  {expired ? t(" · Caducó") : ""}
                </p>
                <ul className="pvp-list">
                  {scan.ports.map((port) => (
                    <li className="pvp-row" key={port.protocol + port.port}>
                      <span>
                        <strong>
                          {port.protocol.toUpperCase()}/{port.port}
                        </strong>
                        <small>
                          {t(port.banner ?? "Sin servicio identificado")}
                        </small>
                      </span>
                      <span className={"pvp-state pvp-" + port.state}>
                        {t(PORT_LABEL[port.state])}
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </>
        ) : (
          <p className="pvp-empty">
            {t(
              "Selecciona un dispositivo para observar sus puertos. El escaneo muestra lo que responde a tu equipo.",
            )}
          </p>
        )}
      </section>
      <section className="pvp-card pvp-span" aria-labelledby="pvp-links-title">
        <h2 id="pvp-links-title">{t("Enlaces de tu dispositivo")}</h2>
        {!world.links.length && (
          <p className="pvp-muted">
            {t(
              "Selecciona un equipo y abre un enlace virtual para comprobar su disponibilidad.",
            )}
          </p>
        )}
        <ul className="pvp-list">
          {world.links.map((link) => (
            <li className="pvp-row" key={link.id}>
              <span>
                <strong>
                  {link.incoming ? t("Desde") : t("Hacia")} {link.peerAlias} ·{" "}
                  {link.protocol.toUpperCase()}/{link.port}
                </strong>
                <small>
                  {link.reason
                    ? t(link.reason)
                    : t("Abierto a las {time}", { time: stamp(link.openedAt) })}
                </small>
              </span>
              <span className={link.closedAt ? "pvp-muted" : "pvp-green"}>
                {link.closedAt ? t("Cerrado") : t("Activo")}
              </span>
            </li>
          ))}
        </ul>
      </section>
      <section
        className="pvp-card pvp-span"
        aria-labelledby="pvp-ranking-title"
      >
        <div className="pvp-section-title">
          <h2 id="pvp-ranking-title">{t("Clasificación regional")}</h2>
        </div>
        <ol className="pvp-ranking">
          {world.leaderboard.map((peer) => (
            <li key={peer.id}>
              {peer.ipv4 && <code>{peer.ipv4}</code>}
              <span>{peer.score} pts</span>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
