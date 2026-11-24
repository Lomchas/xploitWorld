import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { ModeShell } from "./views/ModeShell";
import { getWebSocketUrl } from "./lib/urls";
import { useLocale } from "./lib/locale";

const Desktop = lazy(() =>
  import("./views/ArenaDesktop").then((m) => ({ default: m.ArenaDesktop })),
);
const Terminal = lazy(() =>
  import("./views/ArenaTerminal").then((m) => ({ default: m.ArenaTerminal })),
);
const Drill = lazy(() =>
  import("./views/ArenaDrill").then((m) => ({ default: m.ArenaDrill })),
);
const Device = lazy(() =>
  import("./views/PVPView").then((m) => ({ default: m.PVPView })),
);
const Atlas = lazy(() =>
  import("./views/ServerListView").then((m) => ({ default: m.ServerListView })),
);
const Contracts = lazy(() =>
  import("./views/ArenaContracts").then((m) => ({ default: m.ArenaContracts })),
);
const wsUrl = getWebSocketUrl();

export default function ArenaApp() {
  const { t } = useLocale();
  return (
    <ModeShell mode="pvp" wsUrl={wsUrl}>
      <Suspense fallback={<p role="status">{t("Cargando…")}</p>}>
        <Routes>
          <Route path="/pvp" element={<Desktop wsUrl={wsUrl} />} />
          <Route path="/terminal" element={<Terminal wsUrl={wsUrl} />} />
          <Route path="/arena" element={<Device wsUrl={wsUrl} />} />
          <Route
            path="/dispositivo"
            element={<Device wsUrl={wsUrl} device />}
          />
          <Route path="/servidores" element={<Atlas wsUrl={wsUrl} />} />
          <Route path="/entrenamiento" element={<Drill />} />
          <Route path="/contratos" element={<Contracts />} />
          <Route path="*" element={<Navigate to="/pvp" replace />} />
        </Routes>
      </Suspense>
    </ModeShell>
  );
}
