import { Link } from "react-router-dom";
import { useLocale } from "../lib/locale";

import { worldUrl } from "../lib/world-mode";

export const GAME_VERSION = "M6.5";

export function MenuView() {
  const { t } = useLocale();
  return (
    <section className="game-menu" aria-labelledby="menu-title">
      <div className="menu-content">
        <div className="menu-brand">
          <h1 id="menu-title">
            XploitworlD<span aria-hidden="true">_</span>
          </h1>
          <span className="menu-version">{GAME_VERSION}</span>
        </div>
        <nav className="menu-choices" aria-label={t("Menú principal")}>
          <a className="menu-play" href={worldUrl("story", "/historia")}>
            {t("Historia")}
            <span aria-hidden="true">↗</span>
          </a>
          <a className="menu-play" href={worldUrl("pvp", "/pvp")}>
            {t("Multijugador PvP")}
            <span aria-hidden="true">↗</span>
          </a>
          <Link to="/config">
            {t("Configuración")}
            <span aria-hidden="true">→</span>
          </Link>
        </nav>
      </div>
      <div className="menu-visual" aria-hidden="true">
        <div className="menu-radar">
          <div />
          <span />
        </div>
      </div>
    </section>
  );
}
