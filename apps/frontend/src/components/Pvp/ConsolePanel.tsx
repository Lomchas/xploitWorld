import { useState, type FormEvent } from "react";
import type { PvpSelf, PvpState } from "@null-protocol/shared";
import { useLocale } from "../../lib/locale";
import { parsePvpCommand } from "./commands";
import type { RunPvpAction } from "./common";
import { actionPvpOutput, localPvpOutput } from "./console-output";

interface ConsoleProps {
  state: PvpState;
  self: PvpSelf;
  busy: boolean;
  run: RunPvpAction;
}
export function ConsolePanel({ state, self, busy, run }: ConsoleProps) {
  const { t } = useLocale();
  const [input, setInput] = useState("");
  const [entries, setEntries] = useState<string[]>([]);
  const append = (line: string): void =>
    setEntries((current) => [...current.slice(-39), line]);
  const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    const raw = input.trim();
    if (!raw || busy) return;
    setInput("");
    append(self.alias + "@" + (self.hostname ?? "arena-lab") + " $ " + raw);
    try {
      if (/^(exploit|counter)(?:\s|$)/i.test(raw))
        throw new Error("La acción no está disponible en este laboratorio.");
      const parsed = parsePvpCommand(raw, state.peers);
      if ("local" in parsed) {
        append(localPvpOutput(parsed.local, state, t));
      } else {
        const result = await run(parsed.action);
        if (result) {
          append(actionPvpOutput(result, t));
        } else
          append(
            t(
              "Consulta el mensaje de operaciones para conocer el estado de la acción.",
            ),
          );
      }
    } catch (error: unknown) {
      append(t(error instanceof Error ? error.message : "Comando inválido."));
    }
  };
  return (
    <section className="pvp-card" aria-labelledby="pvp-console-title">
      <div className="pvp-section-title">
        <h2 id="pvp-console-title">{t("Terminal de operaciones")}</h2>
        <span className="pvp-pill">VNET</span>
      </div>
      <p className="pvp-muted">
        {t(
          "Ejecuta acciones del juego sobre la red de tu región. Escribe help para ver los comandos.",
        )}
      </p>
      <form
        className="pvp-inline-form"
        onSubmit={(event) => void submit(event)}
      >
        <label>
          {t("Comando PVP")}
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            maxLength={240}
            spellCheck={false}
            autoComplete="off"
            placeholder="status"
          />
        </label>
        <button type="submit" disabled={busy || !input.trim()}>
          {t("Ejecutar")}
        </button>
      </form>
      <pre
        className="pvp-console"
        role="log"
        aria-label={t("Salida de la terminal PVP")}
      >
        {entries.length
          ? entries.join("\n\n")
          : t("NullOS VNET · escribe help")}
      </pre>
    </section>
  );
}
