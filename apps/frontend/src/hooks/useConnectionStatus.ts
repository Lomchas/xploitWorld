import { useState, useEffect, useCallback } from "react";
import { getWsClient, type ConnectionStatus } from "../lib/ws-client";

export function useConnectionStatus(wsUrl: string): ConnectionStatus {
  const [status, setStatus] = useState<ConnectionStatus>("closed");

  const handleStatusChange = useCallback((newStatus: ConnectionStatus) => {
    setStatus(newStatus);
  }, []);

  useEffect(() => {
    const client = getWsClient(wsUrl);
    setStatus(client.getStatus());

    const unsubscribe = client.onStatus(handleStatusChange);

    if (client.getStatus() === "closed") {
      client.connect();
    }

    return () => {
      unsubscribe();
    };
  }, [wsUrl, handleStatusChange]);

  return status;
}
