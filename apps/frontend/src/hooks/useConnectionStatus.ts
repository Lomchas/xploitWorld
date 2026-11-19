import { useSyncExternalStore } from "react";
import { getWsClient, type ConnectionStatus } from "../lib/ws-client";
export function useConnectionStatus(wsUrl: string): ConnectionStatus {
  const client = getWsClient(wsUrl);
  return useSyncExternalStore(
    (callback) => client.onStatus(callback),
    () => client.getStatus(),
  );
}
