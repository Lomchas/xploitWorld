import { useLocale } from "../../lib/locale";
import {
  PVP_ENERGY_COST,
  PVP_SERVICES,
  type PvpSelf,
  type PvpServiceId,
} from "@null-protocol/shared";
import type { RunPvpAction } from "./common";

const services = Object.keys(PVP_SERVICES) as PvpServiceId[];
export function DeviceServices({
  self,
  busy,
  run,
  now,
}: {
  self: PvpSelf;
  busy: boolean;
  run: RunPvpAction;
  now: number;
}) {
  const { t } = useLocale();
  const { config } = self;
  return (
    <section className="pvp-card" aria-labelledby="services-title">
      <div className="pvp-section-title">
        <h2 id="services-title">{t("Servicios del dispositivo")}</h2>
        <span className="pvp-pill">XploitOS</span>
      </div>
      <ul className="pvp-list">
        {services.map((id) => {
          const service = PVP_SERVICES[id];
          const status = config.services[id];
          const restarting = Boolean(
            status.restartUntil && Date.parse(status.restartUntil) > now,
          );
          const port = id === "web" && config.tls ? 443 : service.port;
          return (
            <li className="pvp-row" key={id}>
              <span>
                <strong>{t(service.name)}</strong>
                <small>
                  {service.protocol.toUpperCase()}/{port} ·{" "}
                  {status.open
                    ? restarting
                      ? t("Reiniciando")
                      : t("Abierto")
                    : t("Cerrado")}{" "}
                  · {status.patched ? t("Parcheado") : t("Vulnerable")}
                </small>
              </span>
              <div className="pvp-actions">
                <button
                  disabled={busy}
                  aria-label={
                    (status.open ? t("Cerrar ") : t("Abrir ")) + t(service.name)
                  }
                  onClick={() =>
                    void run({
                      type: "service",
                      service: id,
                      open: !status.open,
                    })
                  }
                >
                  {status.open ? t("Cerrar") : t("Abrir")}
                </button>
                <button
                  disabled={busy || status.patched}
                  aria-label={t("Parchear ") + t(service.name)}
                  onClick={() => void run({ type: "patch", service: id })}
                >
                  {status.patched
                    ? t("Parcheado")
                    : t("Parchear · ") + PVP_ENERGY_COST.patch + " E"}
                </button>
              </div>
            </li>
          );
        })}
      </ul>
      {config.tools.includes("tls") && (
        <div className="pvp-actions">
          <button
            disabled={busy}
            onClick={() => void run({ type: "tls", enabled: !config.tls })}
          >
            {config.tls ? t("Desactivar TLS") : t("Activar TLS")}
          </button>
          <span className="pvp-muted">
            {t("Portal en TCP/")}
            {config.tls ? 443 : 80}
          </span>
        </div>
      )}
    </section>
  );
}
