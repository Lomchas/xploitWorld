import { languageTag } from "@null-protocol/shared";
import { readLocale } from "../../lib/locale";
import type {
  PvpAction,
  PvpActionResult,
  PvpPeer,
} from "@null-protocol/shared";

export type RunPvpAction = (
  action: PvpAction,
) => Promise<PvpActionResult | null>;
export const PORT_LABEL = {
  open: "Abierto",
  closed: "Cerrado",
  filtered: "Filtrado",
} as const;
export const stamp = (iso: string): string =>
  new Date(iso).toLocaleTimeString(languageTag(readLocale()), {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
export function peerLabel(peers: PvpPeer[], id: string): string {
  return peers.find((peer) => peer.id === id)?.alias ?? id.slice(-8);
}
export function remainingSeconds(until: string | null, now: number): number {
  return until ? Math.max(0, Math.ceil((Date.parse(until) - now) / 1000)) : 0;
}
