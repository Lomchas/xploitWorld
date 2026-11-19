import { isSku, type Sku } from "../exchange/catalog";
import { isLocale, type Locale } from "../locales";

export type WsMessageType =
  | "cmd"
  | "cmd_response"
  | "ping"
  | "pong"
  | "error"
  | "pvp_watch"
  | "pvp_unwatch"
  | "pvp_update";
export interface WsMessage<
  T extends WsMessageType = WsMessageType,
  P = unknown,
> {
  type: T;
  payload: P;
  id?: string;
}
export interface CmdPayload {
  raw: string;
  locale?: Locale;
}
export interface CmdResponsePayload {
  output: string;
  exitCode: number;
  cwd: string;
  progressChanged?: boolean;
  imagePath?: string;
  requiredItem?: Sku;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
export function isWsMessage(value: unknown): value is WsMessage {
  return (
    isRecord(value) &&
    typeof value.type === "string" &&
    [
      "cmd",
      "cmd_response",
      "ping",
      "pong",
      "error",
      "pvp_watch",
      "pvp_unwatch",
      "pvp_update",
    ].includes(value.type) &&
    Object.hasOwn(value, "payload") &&
    (value.id === undefined ||
      (typeof value.id === "string" && value.id.length <= 80))
  );
}
export function isCmdPayload(value: unknown): value is CmdPayload {
  return (
    isRecord(value) &&
    typeof value.raw === "string" &&
    value.raw.trim().length > 0 &&
    value.raw.length <= 2000 &&
    (value.locale === undefined || isLocale(value.locale))
  );
}
export function isCmdResponsePayload(
  value: unknown,
): value is CmdResponsePayload {
  return (
    isRecord(value) &&
    typeof value.output === "string" &&
    typeof value.cwd === "string" &&
    typeof value.exitCode === "number" &&
    Number.isInteger(value.exitCode) &&
    (value.progressChanged === undefined ||
      typeof value.progressChanged === "boolean") &&
    (value.imagePath === undefined || typeof value.imagePath === "string") &&
    (value.requiredItem === undefined || isSku(value.requiredItem))
  );
}
