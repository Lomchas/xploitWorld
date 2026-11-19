import { WebSocket } from "ws";
import {
  isCmdPayload,
  isWsMessage,
  type WsMessage,
  type Locale,
  type CmdResponsePayload,
} from "@null-protocol/shared";
import type { VirtualShell } from "../game/shell";

export function handleMessage(
  ws: Pick<WebSocket, "send" | "readyState">,
  data: string,
  shell: VirtualShell | null,
  onWatch?: (type: "pvp_watch" | "pvp_unwatch") => void | Promise<void>,
  onCommand?: (raw: string, locale?: Locale) => Promise<CmdResponsePayload>,
): void | Promise<void> {
  const send = (message: WsMessage): void => {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(message));
  };
  let parsed: unknown;
  try {
    parsed = JSON.parse(data);
  } catch {
    send({ type: "error", payload: { message: "JSON inválido" } });
    return;
  }
  if (!isWsMessage(parsed)) {
    send({ type: "error", payload: { message: "Mensaje inválido" } });
    return;
  }
  const replyId = parsed.id ? { id: parsed.id } : {};
  if (
    onWatch &&
    parsed.payload === null &&
    (parsed.type === "pvp_watch" || parsed.type === "pvp_unwatch")
  ) {
    return onWatch(parsed.type);
  }
  if (parsed.type === "ping") {
    send({ type: "pong", payload: null, ...replyId });
    return;
  }
  if (parsed.type !== "cmd" || !isCmdPayload(parsed.payload)) {
    send({
      type: "error",
      payload: { message: "Comando inválido (máximo 2000 caracteres)" },
      ...replyId,
    });
    return;
  }
  if (onCommand)
    return onCommand(parsed.payload.raw, parsed.payload.locale).then(
      (payload) => send({ type: "cmd_response", payload, ...replyId }),
    );
  if (!shell) {
    send({
      type: "error",
      payload: { message: "Este canal pertenece a otro modo." },
      ...replyId,
    });
    return;
  }
  send({
    type: "cmd_response",
    payload: shell.execute(parsed.payload.raw),
    ...replyId,
  });
}
