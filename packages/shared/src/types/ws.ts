export type WsMessageType = "cmd" | "cmd_response" | "ping" | "pong";

export interface WsMessage<
  T extends WsMessageType = WsMessageType,
  P = unknown,
> {
  type: T;
  payload: P;
}

export interface CmdPayload {
  raw: string;
}

export interface CmdResponsePayload {
  output: string;
}
