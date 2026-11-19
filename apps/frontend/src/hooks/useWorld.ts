import { useEffect, useState } from "react";
import type { PvpRegionId, WorldState } from "@null-protocol/shared";
import { fetchWorld } from "../lib/api";

export interface WorldPulse {
  world: WorldState | null;
  latency: number | null;
  stale: boolean;
}

export function useWorld(arena?: PvpRegionId): WorldPulse {
  const [value, setValue] = useState<WorldPulse>({
    world: null,
    latency: null,
    stale: false,
  });
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    let reading = false;
    const refresh = async (): Promise<void> => {
      if (reading || document.hidden) return;
      reading = true;
      const started = performance.now();
      try {
        const world = await fetchWorld(arena, controller.signal);
        if (active)
          setValue({
            world,
            latency: Math.round(performance.now() - started),
            stale: false,
          });
      } catch {
        if (active) setValue((last) => ({ ...last, stale: true }));
      } finally {
        reading = false;
      }
    };
    void refresh();
    const timer = window.setInterval(() => void refresh(), 8_000);
    const focus = () => void refresh();
    document.addEventListener("visibilitychange", focus);
    return () => {
      active = false;
      controller.abort();
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", focus);
    };
  }, [arena]);
  return value;
}
