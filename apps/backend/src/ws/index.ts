import { WebSocketServer, type WebSocket } from "ws";
import { type Server } from "http";
import { handleMessage } from "./handler";

export function initWsServer(httpServer: Server): void {
  const wss = new WebSocketServer({ server: httpServer, path: "/ws" });

  wss.on("connection", (ws: WebSocket) => {
    console.log(`[${new Date().toISOString()}] WS client connected`);

    ws.on("message", (data: Buffer | string) => {
      const message = data.toString();
      handleMessage(ws, message);
    });

    ws.on("close", () => {
      console.log(`[${new Date().toISOString()}] WS client disconnected`);
    });

    ws.on("error", (err: Error) => {
      console.error(`[${new Date().toISOString()}] WS error:`, err.message);
    });
  });

  console.log(`[${new Date().toISOString()}] WS server initialized on /ws`);
}
