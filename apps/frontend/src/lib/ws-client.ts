import {
  isCmdResponsePayload,
  isRecord,
  isWsMessage,
  type CmdResponsePayload,
  type Locale,
  type WsMessage,
  type WsMessageType,
} from "@null-protocol/shared";
import { requestId } from "./request-id";

type EventCallback = (data: unknown) => void;
export type ConnectionStatus = "connecting" | "open" | "closed";
type StatusCallback = (status: ConnectionStatus) => void;
interface WsClientOptions {
  url: string;
  reconnectBaseDelay?: number;
  maxReconnectDelay?: number;
}
interface PendingCommand {
  resolve: (value: CmdResponsePayload) => void;
  reject: (error: Error) => void;
  timer: number;
}

export class WsClient {
  private ws: WebSocket | null = null;
  private readonly url: string;
  private readonly reconnectBaseDelay: number;
  private readonly maxReconnectDelay: number;
  private reconnectAttempts = 0;
  private reconnectTimer: number | null = null;
  private status: ConnectionStatus = "closed";
  private readonly messageHandlers = new Map<string, Set<EventCallback>>();
  private readonly statusHandlers = new Set<StatusCallback>();
  private readonly pending = new Map<string, PendingCommand>();
  private isManuallyClosed = true;

  constructor({
    url,
    reconnectBaseDelay = 1000,
    maxReconnectDelay = 30_000,
  }: WsClientOptions) {
    this.url = url;
    this.reconnectBaseDelay = reconnectBaseDelay;
    this.maxReconnectDelay = maxReconnectDelay;
  }
  getStatus(): ConnectionStatus {
    return this.status;
  }
  private setStatus(status: ConnectionStatus): void {
    if (this.status !== status) {
      this.status = status;
      this.statusHandlers.forEach((callback) => callback(status));
    }
  }
  onStatus(callback: StatusCallback): () => void {
    this.statusHandlers.add(callback);
    return () => {
      this.statusHandlers.delete(callback);
    };
  }
  on(type: string, callback: EventCallback): () => void {
    const handlers = this.messageHandlers.get(type) ?? new Set<EventCallback>();
    handlers.add(callback);
    this.messageHandlers.set(type, handlers);
    return () => {
      handlers.delete(callback);
      if (!handlers.size) this.messageHandlers.delete(type);
    };
  }
  private emit(type: string, value: unknown): void {
    this.messageHandlers.get(type)?.forEach((callback) => callback(value));
  }
  connect(): void {
    if (
      this.ws &&
      (this.ws.readyState === WebSocket.OPEN ||
        this.ws.readyState === WebSocket.CONNECTING)
    )
      return;
    this.clearReconnect();
    this.isManuallyClosed = false;
    this.setStatus("connecting");
    let socket: WebSocket;
    try {
      socket = new WebSocket(this.url);
    } catch (error: unknown) {
      this.setStatus("closed");
      this.emit("error", error);
      this.scheduleReconnect();
      return;
    }
    this.ws = socket;
    socket.onopen = () => {
      if (this.ws !== socket) return;
      this.reconnectAttempts = 0;
      this.setStatus("open");
      this.emit("open", null);
    };
    socket.onmessage = (event) => {
      if (this.ws !== socket) return;
      let parsed: unknown;
      try {
        parsed = JSON.parse(String(event.data));
      } catch {
        this.emit("error", new Error("Respuesta WebSocket inválida"));
        return;
      }
      if (!isWsMessage(parsed)) {
        this.emit("error", new Error("Mensaje WebSocket inválido"));
        return;
      }
      const pending = parsed.id ? this.pending.get(parsed.id) : undefined;
      if (pending && parsed.id) {
        if (
          parsed.type === "cmd_response" &&
          isCmdResponsePayload(parsed.payload)
        ) {
          window.clearTimeout(pending.timer);
          this.pending.delete(parsed.id);
          pending.resolve(parsed.payload);
        } else if (parsed.type === "error") {
          window.clearTimeout(pending.timer);
          this.pending.delete(parsed.id);
          const message =
            isRecord(parsed.payload) &&
            typeof parsed.payload.message === "string"
              ? parsed.payload.message
              : "Comando rechazado";
          pending.reject(new Error(message));
        }
      }
      this.emit(parsed.type, parsed.payload);
      this.emit("message", parsed);
    };
    socket.onclose = () => {
      if (this.ws !== socket) return;
      this.ws = null;
      this.rejectPending();
      this.setStatus("closed");
      this.emit("close", null);
      this.scheduleReconnect();
    };
    socket.onerror = (error) => {
      if (this.ws === socket) this.emit("error", error);
    };
  }
  private clearReconnect(): void {
    if (this.reconnectTimer !== null) window.clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
  }
  private scheduleReconnect(): void {
    if (this.isManuallyClosed) return;
    this.clearReconnect();
    const delay = Math.min(
      this.reconnectBaseDelay * 2 ** Math.min(this.reconnectAttempts++, 16),
      this.maxReconnectDelay,
    );
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }
  send(type: WsMessageType, payload: unknown, id?: string): boolean {
    if (this.ws?.readyState !== WebSocket.OPEN) return false;
    const message: WsMessage = { type, payload, ...(id ? { id } : {}) };
    this.ws.send(JSON.stringify(message));
    return true;
  }
  execute(raw: string, locale?: Locale): Promise<CmdResponsePayload> {
    if (this.status !== "open")
      return Promise.reject(
        new Error("Terminal sin conexión. Espera el estado ONLINE."),
      );
    const id = requestId();
    return new Promise((resolve, reject) => {
      const timer = window.setTimeout(() => {
        this.pending.delete(id);
        reject(new Error("El comando agotó el tiempo de espera"));
      }, 10_000);
      this.pending.set(id, { resolve, reject, timer });
      if (!this.send("cmd", { raw, locale }, id)) {
        window.clearTimeout(timer);
        this.pending.delete(id);
        reject(new Error("Conexión cerrada"));
      }
    });
  }
  private rejectPending(): void {
    for (const pending of this.pending.values()) {
      window.clearTimeout(pending.timer);
      pending.reject(new Error("Conexión cerrada; el comando no se reenvió"));
    }
    this.pending.clear();
  }
  close(): void {
    this.isManuallyClosed = true;
    this.clearReconnect();
    const socket = this.ws;
    this.ws = null;
    if (socket) {
      socket.onopen = null;
      socket.onmessage = null;
      socket.onclose = null;
      socket.onerror = null;
      socket.close();
    }
    this.rejectPending();
    this.setStatus("closed");
  }
}
const clients = new Map<string, WsClient>();
export function getWsClient(url: string): WsClient {
  let client = clients.get(url);
  if (!client) {
    client = new WsClient({ url });
    clients.set(url, client);
  }
  return client;
}
