import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { ModeShell } from "./views/ModeShell";
import { getWebSocketUrl } from "./lib/urls";
import { useLocale } from "./lib/locale";

const Historia = lazy(() =>
  import("./views/HistoriaView").then((m) => ({ default: m.HistoriaView })),
);
const Saves = lazy(() =>
  import("./views/SavedGamesView").then((m) => ({ default: m.SavedGamesView })),
);
const Practice = lazy(() =>
  import("./views/PracticeView").then((m) => ({ default: m.PracticeView })),
);
const Exchange = lazy(() =>
  import("./views/ExchangeView").then((m) => ({ default: m.ExchangeView })),
);
const wsUrl = getWebSocketUrl();

export default function StoryApp() {
  const { t } = useLocale();
  return (
    <ModeShell mode="story" wsUrl={wsUrl}>
      <Suspense fallback={<p role="status">{t("Cargando…")}</p>}>
        <Routes>
          <Route path="/historia" element={<Historia wsUrl={wsUrl} />} />
          <Route path="/partidas" element={<Saves />} />
          <Route path="/practicas" element={<Practice />} />
          <Route path="/exchange" element={<Exchange />} />
          <Route path="*" element={<Navigate to="/historia" replace />} />
        </Routes>
      </Suspense>
    </ModeShell>
  );
}
