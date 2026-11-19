import {
  isPvpProtocol,
  isPvpRegionId,
  isPvpServiceId,
  isPvpToolId,
  isRecord,
  normalizeAddress,
  PVP_MAX_RULES,
  PVP_PORTS,
  type PvpAction,
  type PvpDeviceConfig,
  type PvpRegionId,
  type PvpRuleInput,
} from "@null-protocol/shared";
import { HttpError } from "../lib/http";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ENTITY_ID = /^[a-z0-9]{20,36}$/;
const ALIAS = /^[A-Za-z0-9_-]{3,24}$/;

function exact(value: Record<string, unknown>, ...keys: string[]): boolean {
  return (
    Object.keys(value).length === keys.length &&
    keys.every((key) => Object.hasOwn(value, key))
  );
}
function uuid(value: unknown): value is string {
  return typeof value === "string" && UUID.test(value);
}
function entityId(value: unknown): value is string {
  return typeof value === "string" && ENTITY_ID.test(value);
}
function port(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 1 &&
    value <= 65535
  );
}
function policy(value: unknown): value is PvpRuleInput["action"] {
  return value === "allow" || value === "drop";
}
function ruleFields(value: Record<string, unknown>): PvpRuleInput | null {
  if (
    !policy(value.action) ||
    !(value.protocol === "any" || isPvpProtocol(value.protocol)) ||
    !(value.port === null || port(value.port)) ||
    !(value.sourceId === null || entityId(value.sourceId))
  )
    return null;
  return {
    action: value.action,
    protocol: value.protocol,
    port: value.port,
    sourceId: value.sourceId,
  };
}
function action(value: unknown): PvpAction | null {
  if (!isRecord(value)) return null;
  const {
    type,
    targetId,
    eventId,
    protocol,
    enabled,
    tool,
    service,
    open,
    ruleId,
    direction,
  } = value;
  switch (type) {
    case "scan":
      return exact(value, "type", "targetId") && entityId(targetId)
        ? { type, targetId }
        : null;
    case "link.open":
      return exact(value, "type", "targetId", "protocol", "port") &&
        entityId(targetId) &&
        isPvpProtocol(protocol) &&
        port(value.port) &&
        PVP_PORTS.some(
          (item) => item.protocol === protocol && item.port === value.port,
        )
        ? { type, targetId, protocol, port: value.port }
        : null;
    case "exploit":
      return exact(value, "type", "targetId", "protocol", "port") &&
        entityId(targetId) &&
        isPvpProtocol(protocol) &&
        port(value.port)
        ? { type, targetId, protocol, port: value.port }
        : null;
    case "counter":
      return exact(value, "type", "eventId", "protocol", "port") &&
        entityId(eventId) &&
        isPvpProtocol(protocol) &&
        port(value.port)
        ? { type, eventId, protocol, port: value.port }
        : null;
    case "install":
      return exact(value, "type", "tool") && isPvpToolId(tool)
        ? { type, tool }
        : null;
    case "patch":
      return exact(value, "type", "service") && isPvpServiceId(service)
        ? { type, service }
        : null;
    case "service":
      return exact(value, "type", "service", "open") &&
        isPvpServiceId(service) &&
        typeof open === "boolean"
        ? { type, service, open }
        : null;
    case "tls":
    case "vpn":
    case "isolate":
      return exact(value, "type", "enabled") && typeof enabled === "boolean"
        ? { type, enabled }
        : null;
    case "trust":
      return exact(value, "type", "targetId", "enabled") &&
        entityId(targetId) &&
        typeof enabled === "boolean"
        ? { type, targetId, enabled }
        : null;
    case "policy":
      return exact(value, "type", "policy") && policy(value.policy)
        ? { type, policy: value.policy }
        : null;
    case "rule.add": {
      const rule =
        isRecord(value.rule) &&
        exact(value.rule, "action", "protocol", "port", "sourceId")
          ? ruleFields(value.rule)
          : null;
      return exact(value, "type", "rule") && rule ? { type, rule } : null;
    }
    case "rule.remove":
      return exact(value, "type", "ruleId") && uuid(ruleId)
        ? { type, ruleId }
        : null;
    case "rule.move":
      return exact(value, "type", "ruleId", "direction") &&
        uuid(ruleId) &&
        (direction === "up" || direction === "down")
        ? { type, ruleId, direction }
        : null;
    case "analyze":
    case "block":
    case "ack":
      return exact(value, "type", "eventId") && entityId(eventId)
        ? { type, eventId }
        : null;
    case "repair":
      return exact(value, "type") ? { type } : null;
    default:
      return null;
  }
}

export function parseAction(value: unknown): {
  requestId: string;
  command: PvpAction;
  arenaVisit?: number;
} {
  if (
    !isRecord(value) ||
    !(
      exact(value, "requestId", "action") ||
      exact(value, "requestId", "action", "arenaVisit")
    ) ||
    (value.arenaVisit !== undefined && !isArenaVisit(value.arenaVisit)) ||
    !uuid(value.requestId)
  ) {
    throw new HttpError(
      400,
      "Se requiere un identificador UUID y una acción PVP.",
    );
  }
  const command = action(value.action);
  if (!command) throw new HttpError(400, "Acción PVP o parámetros inválidos.");
  return {
    requestId: value.requestId.toLowerCase(),
    command,
    arenaVisit: value.arenaVisit,
  };
}
const isArenaVisit = (value: unknown): value is number =>
  typeof value === "number" &&
  Number.isSafeInteger(value) &&
  value >= 0 &&
  value <= 2_147_483_647;

export function parseTransfer(value: unknown): {
  regionId: PvpRegionId;
  arenaVisit: number;
  alias?: string;
} {
  if (
    !isRecord(value) ||
    !(
      exact(value, "regionId", "arenaVisit") ||
      exact(value, "regionId", "arenaVisit", "alias")
    ) ||
    !isPvpRegionId(value.regionId) ||
    !isArenaVisit(value.arenaVisit) ||
    (value.alias !== undefined &&
      (typeof value.alias !== "string" || !ALIAS.test(value.alias)))
  ) {
    throw new HttpError(
      400,
      "Elige una arena válida y, si necesitas otro alias, usa de 3 a 24 caracteres.",
    );
  }
  return {
    regionId: value.regionId,
    arenaVisit: value.arenaVisit,
    alias: value.alias,
  };
}
export function parseJoin(value: unknown): {
  regionId: PvpRegionId;
  alias: string;
  hostname?: string;
} {
  if (
    !isRecord(value) ||
    !(
      exact(value, "regionId", "alias") ||
      exact(value, "regionId", "alias", "hostname")
    ) ||
    (value.hostname !== undefined &&
      (typeof value.hostname !== "string" ||
        !/^[a-z0-9](?:[a-z0-9-]{1,30}[a-z0-9])$/.test(value.hostname))) ||
    !isPvpRegionId(value.regionId) ||
    typeof value.alias !== "string" ||
    !ALIAS.test(value.alias)
  ) {
    throw new HttpError(
      400,
      "Elige una región y un alias de 3 a 24 letras, números, guiones o guiones bajos.",
    );
  }
  return {
    regionId: value.regionId,
    alias: value.alias,
    ...(typeof value.hostname === "string" ? { hostname: value.hostname } : {}),
  };
}
export function parseRosterQuery(
  pageValue: unknown,
  queryValue: unknown,
): { page: number; query: string } {
  const page =
    pageValue === undefined
      ? 0
      : typeof pageValue === "string" && /^\d{1,5}$/.test(pageValue)
        ? Number(pageValue)
        : -1;
  const query = queryValue === undefined ? "" : queryValue;
  const normalized =
    query === ""
      ? ""
      : typeof query === "string"
        ? normalizeAddress(query)
        : undefined;
  if (page < 0 || normalized === undefined)
    throw new HttpError(
      400,
      "Usa una dirección IPv4 o IPv6 y una página válida.",
    );
  return { page, query: normalized };
}

/** Persisted configuration is written only by validated game actions. Fail closed on corrupt state. */
export function readConfig(value: unknown): PvpDeviceConfig {
  if (
    !isRecord(value) ||
    !Array.isArray(value.tools) ||
    value.tools.length > 6 ||
    !value.tools.every(isPvpToolId) ||
    !isRecord(value.services) ||
    !policy(value.policy) ||
    !Array.isArray(value.rules) ||
    value.rules.length > PVP_MAX_RULES ||
    !Array.isArray(value.trustedPeers) ||
    value.trustedPeers.length > 16 ||
    !value.trustedPeers.every(entityId) ||
    typeof value.tls !== "boolean" ||
    typeof value.vpn !== "boolean" ||
    typeof value.isolated !== "boolean"
  ) {
    throw new Error("Invalid persisted PVP device");
  }
  const service = (
    id: "web" | "admin" | "dns",
  ): PvpDeviceConfig["services"][typeof id] => {
    const state = (value.services as Record<string, unknown>)[id];
    if (
      !isRecord(state) ||
      typeof state.open !== "boolean" ||
      typeof state.patched !== "boolean" ||
      (state.restartUntil !== undefined &&
        (typeof state.restartUntil !== "string" ||
          !Number.isFinite(Date.parse(state.restartUntil))))
    ) {
      throw new Error("Invalid persisted PVP service");
    }
    return {
      open: state.open,
      patched: state.patched,
      ...(state.restartUntil !== undefined
        ? { restartUntil: state.restartUntil }
        : {}),
    };
  };
  const rules = value.rules.map((rule: unknown) => {
    if (!isRecord(rule) || !uuid(rule.id))
      throw new Error("Invalid persisted PVP rule");
    const input = ruleFields(rule);
    if (!input) throw new Error("Invalid persisted PVP rule");
    return { id: rule.id, ...input };
  });
  const tools = value.tools;
  if (
    (value.tls && !tools.includes("tls")) ||
    (value.vpn && !tools.includes("vpn")) ||
    ((value.isolated || rules.length > 0 || value.policy === "drop") &&
      !tools.includes("firewall"))
  ) {
    throw new Error("Persisted PVP defense missing its installed tool");
  }
  return {
    tools: [...tools],
    services: {
      web: service("web"),
      admin: service("admin"),
      dns: service("dns"),
    },
    rules,
    policy: value.policy,
    tls: value.tls,
    vpn: value.vpn,
    trustedPeers: [...value.trustedPeers],
    isolated: value.isolated,
  };
}
