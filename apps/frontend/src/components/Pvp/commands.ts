import {
  formatCommandTable,
  type Translator,
  isPvpProtocol,
  isPvpServiceId,
  isPvpToolId,
  normalizeAddress,
  type PvpAction,
  type PvpPeer,
  type PvpPolicy,
  type PvpProtocol,
  type PvpTransport,
} from "@null-protocol/shared";

type Local = "help" | "status" | "peers" | "alerts" | "rules";
export type PvpCommand = { local: Local } | { action: PvpAction };
function target(peers: PvpPeer[], text: string | undefined): string {
  const key = text && normalizeAddress(text);
  const match =
    key && peers.find((peer) => peer.address === key || peer.ipv4 === key);
  if (!match)
    throw new Error(
      "Elige una IPv4 o IPv6 de la página de dispositivos visible.",
    );
  return match.id;
}
function boolean(text: string | undefined): boolean {
  if (text !== "on" && text !== "off") throw new Error("Usa on u off.");
  return text === "on";
}
function policy(text: string | undefined): PvpPolicy {
  if (text !== "allow" && text !== "drop") throw new Error("Usa allow o drop.");
  return text;
}
function portNumber(text: string | undefined): number {
  const value = Number(text);
  if (!text || !/^\d{1,5}$/.test(text) || value < 1 || value > 65535)
    throw new Error("El puerto debe estar entre 1 y 65535.");
  return value;
}
function transport(text: string | undefined): PvpProtocol {
  if (!isPvpProtocol(text)) throw new Error("Usa tcp o udp.");
  return text;
}
export function parsePvpCommand(raw: string, peers: PvpPeer[]): PvpCommand {
  if (raw.length > 240)
    throw new Error("El comando admite hasta 240 caracteres.");
  const [command, ...args] = raw.trim().split(/\s+/);
  const [a, b, c, d, e] = args;
  const count = (expected: number, usage: string): void => {
    if (args.length !== expected) throw new Error("Uso: " + usage);
  };
  switch (command) {
    case "help":
    case "status":
    case "peers":
    case "alerts":
    case "rules":
      count(0, command);
      return { local: command };
    case "scan":
      count(1, "scan <equipo>");
      return { action: { type: "scan", targetId: target(peers, a) } };
    case "pkg":
      count(2, "pkg install <paquete>");
      if (a !== "install" || !isPvpToolId(b))
        throw new Error(
          "Paquetes: firewall, ids, capture, tls, vpn, analyzer.",
        );
      return { action: { type: "install", tool: b } };
    case "patch":
      count(1, "patch <web|admin|dns>");
      if (!isPvpServiceId(a)) throw new Error("Servicio desconocido.");
      return { action: { type: "patch", service: a } };
    case "service":
      count(2, "service <web|admin|dns> <open|close>");
      if (!isPvpServiceId(a) || (b !== "open" && b !== "close"))
        throw new Error("Servicio o estado inválido.");
      return { action: { type: "service", service: a, open: b === "open" } };
    case "tls":
    case "vpn":
    case "isolate":
      count(1, command + " <on|off>");
      return { action: { type: command, enabled: boolean(a) } };
    case "trust":
      count(2, "trust <equipo> <on|off>");
      return {
        action: {
          type: "trust",
          targetId: target(peers, a),
          enabled: boolean(b),
        },
      };
    case "firewall": {
      if (a === "policy") {
        count(2, "firewall policy <allow|drop>");
        return { action: { type: "policy", policy: policy(b) } };
      }
      if (a === "add" && (args.length === 4 || args.length === 5)) {
        const protocol: PvpTransport = c === "any" ? "any" : transport(c);
        return {
          action: {
            type: "rule.add",
            rule: {
              action: policy(b),
              protocol,
              port: d === "any" ? null : portNumber(d),
              sourceId: e ? target(peers, e) : null,
            },
          },
        };
      }
      if (a === "remove") {
        count(2, "firewall remove <regla>");
        return { action: { type: "rule.remove", ruleId: b! } };
      }
      if (a === "move") {
        count(3, "firewall move <regla> <up|down>");
        if (c !== "up" && c !== "down") throw new Error("Usa up o down.");
        return { action: { type: "rule.move", ruleId: b!, direction: c } };
      }
      throw new Error("Consulta help para la sintaxis del firewall.");
    }
    case "analyze":
    case "block":
    case "ack":
      count(1, command + " <evento>");
      return { action: { type: command, eventId: a! } };
    case "repair":
      count(0, "repair");
      return { action: { type: "repair" } };
    default:
      throw new Error("Comando PVP desconocido. Escribe help.");
  }
}

const commandRows: readonly (readonly [string, string])[] = [
  ["status", "Muestra integridad, dirección y saldo."],
  ["peers", "Lista las IPv4 e IPv6 visibles."],
  ["alerts | rules", "Consulta alertas o reglas activas."],
  ["scan <IPv4|IPv6>", "Inspecciona los puertos de un equipo."],
  [
    "pkg install <paquete>",
    "Instala firewall, ids, capture, tls, vpn o analyzer.",
  ],
  ["patch <web|admin|dns>", "Parchea el servicio."],
  ["service <servicio> <open|close>", "Cambia la exposición de un servicio."],
  ["tls | vpn | isolate <on|off>", "Configura cifrado o aislamiento."],
  ["trust <IP> <on|off>", "Autoriza o revoca un par de VPN."],
  ["firewall policy <allow|drop>", "Cambia la política por defecto."],
  [
    "firewall add <acción> <proto> <puerto> [IP]",
    "Añade una regla de entrada.",
  ],
  ["firewall remove <regla>", "Elimina una regla."],
  ["firewall move <regla> <up|down>", "Reordena las reglas."],
  ["analyze | block | ack <evento>", "Examina, bloquea o archiva evidencia."],
  ["repair", "Recupera integridad del equipo."],
];

export const pvpCommandHelp = (t: Translator) =>
  formatCommandTable(
    commandRows.map(([command, description]) => [t(command), t(description)]),
    t,
  );
