import { StrictMode } from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { applyIncomingPreferences } from "./lib/world-mode";
import "./Game.css";
import { LocaleProvider } from "./lib/LocaleProvider";
import { applyGameTheme, readTerminalPreferences } from "./lib/preferences";
import "./index.css";
import "./Workstation.css";
applyIncomingPreferences();
applyGameTheme(readTerminalPreferences().theme);
const { default: App } =
  import.meta.env.MODE === "story"
    ? await import("./StoryApp")
    : import.meta.env.MODE === "pvp"
      ? await import("./ArenaApp")
      : await import("./App");
const root = document.getElementById("root");
if (!root) throw new Error("No se encontró el contenedor principal");
ReactDOM.createRoot(root).render(
  <StrictMode>
    <BrowserRouter>
      <LocaleProvider>
        <App />
      </LocaleProvider>
    </BrowserRouter>
  </StrictMode>,
);
