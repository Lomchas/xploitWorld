import { useEffect, useState } from "react";
import { getWsClient, type ConnectionStatus } from "../../lib/ws-client";
import "./TopBar.css";

export function TopBar({ wsUrl }: { wsUrl: string }) {
  const [status, setStatus] = useState<ConnectionStatus>("closed");

  useEffect(() => {
    const client = getWsClient(wsUrl);
    setStatus(client.getStatus());

    const unsubscribe = client.onStatus((newStatus) => {
      setStatus(newStatus);
    });

    if (client.getStatus() === "closed") {
      client.connect();
    }

    return () => {
      unsubscribe();
    };
  }, [wsUrl]);

  const getStatusDisplay = () => {
    switch (status) {
      case "open":
        return (
          <>
            <span className="status-dot connected"></span>
            <span className="status-text">ONLINE</span>
          </>
        );
      case "connecting":
        return (
          <>
            <span className="status-dot connecting"></span>
            <span className="status-text">CONNECTING...</span>
          </>
        );
      default:
        return (
          <>
            <span className="status-dot disconnected"></span>
            <span className="status-text">OFFLINE</span>
          </>
        );
    }
  };

  return (
    <header className="topbar">
      <div className="topbar-brand">
        NULL_PROTOCOL <span className="topbar-version">// v0.0.0</span>
      </div>
      <div className="topbar-status">{getStatusDisplay()}</div>
    </header>
  );
}
