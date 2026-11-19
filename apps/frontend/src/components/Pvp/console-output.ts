import {
  formatPvpBtc,
  type PvpActionResult,
  type PvpState,
  type Translator,
} from "@null-protocol/shared";
import { pvpCommandHelp, type PvpCommand } from "./commands";
import { PORT_LABEL } from "./common";

export function localPvpOutput(
  command: Extract<PvpCommand, { local: unknown }>["local"],
  state: PvpState,
  t: Translator,
): string {
  const self = state.self;
  if (command === "help") return pvpCommandHelp(t);
  if (!self)
    return t("Primero despliega un dispositivo con join <arena> <alias>.");
  switch (command) {
    case "status":
      return [
        self.alias,
        [self.ipv4, self.address].filter(Boolean).join("  "),
        t("Integridad: {value}%", { value: self.integrity }),
        t("Energía: {value}/100", { value: self.energy }),
        formatPvpBtc(self.balanceSats) + " BTC",
      ].join("\n");
    case "peers":
      return (
        state.peers
          .map((peer) =>
            [peer.alias, peer.ipv4, peer.address].filter(Boolean).join("  "),
          )
          .join("\n") || t("No hay otros dispositivos en esta página.")
      );
    case "alerts":
      return (
        state.events
          .filter((item) => item.kind === "alert" || item.specimen)
          .slice(0, 10)
          .map((item) => item.id + "  " + t(item.message))
          .join("\n") || t("Sin evidencia reciente.")
      );
    case "rules":
      return (
        self.config.rules
          .map(
            (rule) =>
              `${rule.id}  ${rule.action} ${rule.protocol}/${rule.port ?? "*"}`,
          )
          .join("\n") || t("Cadena vacía.")
      );
  }
}

export function actionPvpOutput(
  result: PvpActionResult,
  t: Translator,
): string {
  return [
    t(result.message),
    ...(result.ports ?? []).map((port) =>
      [
        port.protocol.toUpperCase() + "/" + port.port,
        t(PORT_LABEL[port.state]),
        port.banner ? t(port.banner) : "",
      ]
        .filter(Boolean)
        .join("  "),
    ),
    ...(result.analysis
      ? [...result.analysis.instructions, t(result.analysis.remedy)]
      : []),
  ].join("\n");
}
