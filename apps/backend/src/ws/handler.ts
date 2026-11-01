import { type WebSocket } from "ws";
import {
  type WsMessage,
  type CmdPayload,
  type CmdResponsePayload,
} from "@null-protocol/shared";

export function handleMessage(ws: WebSocket, data: string): void {
  let parsed: WsMessage;
  try {
    parsed = JSON.parse(data) as WsMessage;
  } catch {
    console.warn(`[${new Date().toISOString()}] Received invalid JSON`);
    return;
  }

  switch (parsed.type) {
    case "cmd": {
      const cmdPayload = parsed.payload as CmdPayload;
      const output = `executed: ${cmdPayload.raw}`;
      const response: WsMessage<"cmd_response", CmdResponsePayload> = {
        type: "cmd_response",
        payload: { output },
      };
      ws.send(JSON.stringify(response));
      break;
    }
    case "ping": {
      const pong: WsMessage<"pong", null> = {
        type: "pong",
        payload: null,
      };
      ws.send(JSON.stringify(pong));
      break;
    }
    default:
      console.warn(
        `[${new Date().toISOString()}] Unknown message type: ${(parsed as WsMessage).type}`,
      );
      break;
  }
}
