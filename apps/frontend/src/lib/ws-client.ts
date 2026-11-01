import { type WsMessage, type WsMessageType } from "@null-protocol/shared";

type EventCallback = (data: unknown) => void;
type StatusCallback = (status: ConnectionStatus) => void;

export type ConnectionStatus = "connecting" | "open" | "closed";

interface WsClientOptions {
  url: string;
  reconnectBaseDelay?: number;
  maxReconnectDelay?: number;
}

export class WsClient {
  private ws: WebSocket | null = null;
  private url: string;
  private reconnectBaseDelay: number;
  private maxReconnectDelay: number;
  private reconnectAttempts = 0;
  private reconnectTimer: number | null = null;
  private status: ConnectionStatus = "closed";
  private messageHandlers = new Map<string, Set<EventCallback>>();
  private statusHandlers = new Set<StatusCallback>();
  private isManuallyClosed = false;

  constructor({
    url,
    reconnectBaseDelay = 1000,
    maxReconnectDelay = 30000,
  }: WsClientOptions) {
    this.url = url;
    this.reconnectBaseDelay = reconnectBaseDelay;
    this.maxReconnectDelay = maxReconnectDelay;
  }

  getStatus(): ConnectionStatus {
    return this.status;
  }

  private setStatus(newStatus: ConnectionStatus): void {
    if (this.status !== newStatus) {
      this.status = newStatus;
      this.statusHandlers.forEach((cb) => cb(newStatus));
    }
  }

  onStatus(callback: StatusCallback): () => void {
    this.statusHandlers.add(callback);
    return () => this.statusHandlers.delete(callback);
  }

  on(type: string, callback: EventCallback): () => void {
    if (!this.messageHandlers.has(type)) {
      this.messageHandlers.set(type, new Set());
    }
    this.messageHandlers.get(type)!.add(callback);
    return () => {
      this.messageHandlers.get(type)?.delete(callback);
    };
  }

  private emit(type: string, data: unknown): void {
    this.messageHandlers.get(type)?.forEach((cb) => cb(data));
  }

  connect(): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      return;
    }

    this.isManuallyClosed = false;
    this.setStatus("connecting");

    this.ws = new WebSocket(this.url);

    this.ws.onopen = () => {
      this.reconnectAttempts = 0;
      this.setStatus("open");
      this.emit("open", null);
    };

    this.ws.onmessage = (event) => {
      try {
        const parsed: WsMessage = JSON.parse(event.data);
        this.emit(parsed.type, parsed.payload);
        this.emit("message", parsed);
      } catch {
        this.emit("error", new Error("Failed to parse WebSocket message"));
      }
    };

    this.ws.onclose = () => {
      this.setStatus("closed");
      this.emit("close", null);
      if (!this.isManuallyClosed) {
        this.scheduleReconnect();
      }
    };

    this.ws.onerror = (err) => {
      this.setStatus("closed");
      this.emit("error", err);
    };
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer !== null) {
      window.clearTimeout(this.reconnectTimer);
    }

    const delay = Math.min(
      this.reconnectBaseDelay * 2 ** this.reconnectAttempts,
      this.maxReconnectDelay,
    );

    this.reconnectAttempts += 1;

    this.reconnectTimer = window.setTimeout(() => {
      if (!this.isManuallyClosed) {
        this.connect();
      }
    }, delay);
  }

  send(type: string, payload: unknown): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      const message: WsMessage = { type: type as WsMessageType, payload };
      this.ws.send(JSON.stringify(message));
    }
  }

  close(): void {
    this.isManuallyClosed = true;
    if (this.reconnectTimer !== null) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.setStatus("closed");
  }
}

let clientInstance: WsClient | null = null;

export function getWsClient(url?: string): WsClient {
  if (!clientInstance && url) {
    clientInstance = new WsClient({ url });
  }
  return clientInstance!;
}
