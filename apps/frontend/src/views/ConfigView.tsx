import { useState } from "react";
import { isLocale } from "@null-protocol/shared";
import { useLocale } from "../lib/locale";
import {
  readFontSize,
  saveFontSize,
  readTerminalPreferences,
  saveTerminalPreferences,
  GAME_THEMES,
  type GameTheme,
  type TerminalPreferences,
} from "../lib/preferences";

const themes: Record<GameTheme, string> = {
  phosphor: "Fósforo verde (predeterminado)",
  amber: "Terminal ámbar",
  ultraviolet: "Ultravioleta",
  slate: "Pizarra",
  contrast: "Alto contraste",
};

export function ConfigView() {
  const { locale, setLocale, t } = useLocale();
  const [fontSize, setFontSize] = useState(readFontSize);
  const [terminal, setTerminal] = useState(readTerminalPreferences);
  const changeTerminal = (patch: Partial<TerminalPreferences>): void => {
    const value = { ...terminal, ...patch };
    setTerminal(value);
    saveTerminalPreferences(value);
  };
  return (
    <section
      className="game-page settings-page"
      aria-labelledby="settings-title"
    >
      <h1 id="settings-title">{t("Configuración")}</h1>
      <fieldset className="settings-group">
        <legend>{t("Idioma")}</legend>
        <label htmlFor="game-language">{t("Idioma del juego")}</label>
        <select
          id="game-language"
          value={locale}
          onChange={(event) => {
            const value = event.target.value;
            if (isLocale(value)) setLocale(value);
          }}
        >
          <option value="es" lang="es">
            Español
          </option>
          <option value="en" lang="en">
            English
          </option>
        </select>
      </fieldset>
      <fieldset className="settings-group">
        <legend>{t("Apariencia y accesibilidad")}</legend>
        <div className="theme-options">
          {GAME_THEMES.map((theme) => (
            <label key={theme} className="theme-option" data-swatch={theme}>
              <input
                type="radio"
                name="theme"
                value={theme}
                checked={terminal.theme === theme}
                onChange={() => changeTerminal({ theme })}
              />
              <span className="theme-swatch" aria-hidden="true">
                &gt;_
              </span>
              <span>{t(themes[theme])}</span>
            </label>
          ))}
        </div>
        <div className="settings-grid">
          <label htmlFor="terminal-font">
            {t("Tamaño de letra")}
            <select
              id="terminal-font"
              value={fontSize}
              onChange={(event) => {
                const value = Number(event.target.value);
                setFontSize(value);
                saveFontSize(value);
              }}
            >
              {[12, 14, 16, 18].map((size) => (
                <option value={size} key={size}>
                  {size} px
                </option>
              ))}
            </select>
          </label>
          <label htmlFor="terminal-cursor">
            {t("Forma del cursor")}
            <select
              id="terminal-cursor"
              value={terminal.cursor}
              onChange={(event) => {
                const cursor = event.target.value;
                if (
                  cursor === "block" ||
                  cursor === "bar" ||
                  cursor === "underline"
                )
                  changeTerminal({ cursor });
              }}
            >
              <option value="block">{t("Bloque")}</option>
              <option value="bar">{t("Barra vertical")}</option>
              <option value="underline">{t("Subrayado")}</option>
            </select>
          </label>
          <label className="settings-check">
            <input
              type="checkbox"
              checked={terminal.blink}
              onChange={(event) =>
                changeTerminal({ blink: event.target.checked })
              }
            />
            {t("Parpadeo del cursor")}
          </label>
        </div>
        <div
          className="settings-preview"
          style={{ fontSize }}
          aria-label={t("Vista previa de la terminal")}
        >
          <div>guest@xploitworld:~$ echo "{t("Sistema listo")}"</div>
          <div>{t("Sistema listo")}</div>
          <div aria-hidden="true">
            guest@xploitworld:~${" "}
            <span
              className="preview-cursor"
              data-style={terminal.cursor}
              data-blink={terminal.blink}
            />
          </div>
        </div>
      </fieldset>
    </section>
  );
}
