import { useCallback, useEffect, useRef, useState } from "react";
import type {
  PvpAction,
  PvpActionResult,
  PvpRegionId,
  PvpState,
} from "@null-protocol/shared";
import {
  ApiError,
  ensureGuestSession,
  fetchPvpState,
  joinPvp,
  sendPvpAction,
} from "../lib/api";
import { getWsClient } from "../lib/ws-client";
import { requestId as createRequestId } from "../lib/request-id";

interface PendingAction {
  id: string;
  profileId: string;
  arenaVisit: number;
  action: PvpAction;
}
const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : "No se pudo completar la solicitud.";

export function usePvpWorld(wsUrl: string, page: number, query: string) {
  const [state, setState] = useState<PvpState | null>(null);
  const [readError, setReadError] = useState("");
  const [feedback, setDisplayedFeedback] = useState<{
    text: string;
    error: boolean;
  } | null>(null);
  const latestFeedback = useRef<typeof feedback>(null);
  const setFeedback = (value: typeof feedback): void => {
    latestFeedback.current = value;
    setDisplayedFeedback(value);
  };
  const [retry, setRetry] = useState<PendingAction | null>(null);
  const [busy, setBusy] = useState(false);
  const active = useRef(false);
  const acting = useRef(false);
  const generation = useRef(0);
  const requested = useRef(0);
  const reading = useRef<Promise<void> | null>(null);
  const refresh = useCallback(async () => {
    const epoch = generation.current;
    const order = ++requested.current;
    // Keep snapshots in order. Collapse notifications that arrive during the same request.
    if (reading.current) await reading.current;
    if (
      !active.current ||
      epoch !== generation.current ||
      order !== requested.current
    )
      return;
    const pending = (async () => {
      try {
        const snapshot = await fetchPvpState(page, query).catch(
          async (error: unknown) => {
            if (!(error instanceof ApiError) || error.status !== 401)
              throw error;
            await ensureGuestSession();
            return fetchPvpState(page, query);
          },
        );
        if (active.current && epoch === generation.current) {
          setState(snapshot);
          setRetry((previous) =>
            previous?.profileId === snapshot.self?.id &&
            previous?.arenaVisit === snapshot.self?.arenaVisit
              ? previous
              : null,
          );
          setReadError("");
        }
      } catch (error: unknown) {
        if (active.current && epoch === generation.current)
          setReadError(errorMessage(error));
      }
    })();
    reading.current = pending;
    await pending;
    if (reading.current === pending) reading.current = null;
  }, [page, query]);
  const refreshLatest = useRef(refresh);
  useEffect(() => {
    generation.current++;
    active.current = true;
    refreshLatest.current = refresh;
    void refresh();
    return () => {
      active.current = false;
    };
  }, [refresh]);

  const profileId = state?.self?.id;
  const arenaVisit = state?.self?.arenaVisit;
  useEffect(() => {
    if (!profileId) return;
    const client = getWsClient(wsUrl);
    let timer: number | undefined;
    const schedule = (): void => {
      if (timer !== undefined) return;
      timer = window.setTimeout(() => {
        timer = undefined;
        void refreshLatest.current();
      }, 700);
    };
    const subscribe = (): void => {
      client.send("pvp_watch", null);
    };
    const removeUpdate = client.on("pvp_update", schedule);
    const removeStatus = client.onStatus((status) => {
      if (status === "open") {
        subscribe();
        schedule();
      }
    });
    subscribe();
    const reconciliation = window.setInterval(schedule, 12_000);
    return () => {
      removeUpdate();
      removeStatus();
      client.send("pvp_unwatch", null);
      window.clearInterval(reconciliation);
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [profileId, wsUrl]);

  async function join(
    regionId: PvpRegionId,
    alias: string,
    hostname?: string,
  ): Promise<string> {
    if (acting.current) return "Hay otra acción en curso.";
    acting.current = true;
    setBusy(true);
    setFeedback(null);
    try {
      await ensureGuestSession();
      const result = await joinPvp(regionId, alias, hostname);
      if (result.granted) window.dispatchEvent(new Event("xwd:wallet"));
      const message = result.granted
        ? "Dispositivo desplegado. Se acreditaron 20 BTC de Arena."
        : "Reconectado a tu dispositivo.";
      if (active.current) {
        setFeedback({ text: message, error: false });
        await refreshLatest.current();
      }
      return message;
    } catch (error: unknown) {
      const message = errorMessage(error);
      if (active.current) setFeedback({ text: message, error: true });
      return message;
    } finally {
      acting.current = false;
      if (active.current) setBusy(false);
    }
  }

  async function run(
    action: PvpAction,
    requestId?: string,
  ): Promise<PvpActionResult | null> {
    if (acting.current || !profileId || arenaVisit === undefined) return null;
    if (retry && !requestId) {
      setFeedback({
        text: "Reintenta o descarta la acción pendiente antes de enviar otra.",
        error: true,
      });
      return null;
    }
    acting.current = true;
    setBusy(true);
    const id = requestId ?? createRequestId();
    setFeedback(null);
    try {
      const result = await sendPvpAction(id, action, arenaVisit);
      if (active.current) {
        setRetry(null);
        setFeedback({ text: result.message, error: false });
        await refreshLatest.current();
      }
      return result;
    } catch (error: unknown) {
      if (active.current) {
        const uncertain = !(error instanceof ApiError) || error.status >= 500;
        setRetry(uncertain ? { id, profileId, arenaVisit, action } : null);
        setFeedback({
          text: uncertain
            ? "No llegó la confirmación. Puedes reintentar la misma acción."
            : errorMessage(error),
          error: true,
        });
        await refreshLatest.current();
      }
      return null;
    } finally {
      acting.current = false;
      if (active.current) setBusy(false);
    }
  }

  return {
    state,
    readError,
    feedback,
    latestFeedback: () => latestFeedback.current?.text,
    retry,
    busy,
    join,
    run,
    refresh,
    retryAction: () =>
      retry && retry.profileId === profileId && retry.arenaVisit === arenaVisit
        ? run(retry.action, retry.id)
        : Promise.resolve(null),
    discardRetry: () => {
      setRetry(null);
      setFeedback(null);
    },
  };
}
