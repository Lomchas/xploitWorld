export type ConnectionStatus = "connecting" | "open" | "closed";

export interface TerminalMessage {
  type: "cmd" | "cmd_response" | "ping" | "pong";
  payload: unknown;
}

export interface CommandHistoryEntry {
  command: string;
  timestamp: number;
}
