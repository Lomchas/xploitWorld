import { useEffect, useState } from "react";
import { useConnectionStatus } from "../../hooks/useConnectionStatus";
import type { WorldPulse } from "../../hooks/useWorld";

export function TopBar({ wsUrl, pulse }: { wsUrl: string; pulse: WorldPulse }) {
  const status = useConnectionStatus(wsUrl);
  const [time, setTime] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setTime(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  const online = pulse.world?.regions.reduce(
    (count, region) => count + region.online,
    0,
  );
  return (
    <header className="station-topbar">
      <div className="station-brand">
        <span>
          XploitworlD
          <span className="brand-cursor" aria-hidden="true">
            _
          </span>
        </span>
        <div className="station-brand-info">
          <span className="station-brand-description">OPERACIONES CIBER</span>
          <span className="station-version">M6.2</span>
        </div>
      </div>
      <div className="station-health" aria-label="Estado de la red">
        <span
          className={status === "open" ? "health-live" : "health-warn"}
          role="status"
        >
          {status === "open"
            ? "EN LÍNEA"
            : status === "connecting"
              ? "ENLAZANDO"
              : "SIN ENLACE"}
        </span>
        <span>
          {pulse.stale
            ? "LECTURA ANTERIOR"
            : `${online ?? "—"} OPERADOR${online === 1 ? "" : "ES"}`}
        </span>
        <span>RTT {pulse.latency === null ? "—" : pulse.latency + " ms"}</span>
      </div>
      <time className="station-clock" dateTime={time.toISOString()}>
        {time.toLocaleTimeString("es-CO", { hour12: false })}
      </time>
    </header>
  );
}
