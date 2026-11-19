export function getWebSocketUrl(): string {
  const override = import.meta.env.VITE_WS_URL;
  const url = new URL(override || "/ws", window.location.href);
  if (url.protocol === "http:") url.protocol = "ws:";
  if (url.protocol === "https:") url.protocol = "wss:";
  if (url.protocol !== "ws:" && url.protocol !== "wss:")
    throw new Error("VITE_WS_URL debe usar ws:// o wss://");
  if (url.pathname === "/") url.pathname = "/ws";
  return url.toString();
}
