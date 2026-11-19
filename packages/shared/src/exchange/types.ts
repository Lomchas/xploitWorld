import type {
  RewardId,
  ServiceFinding,
  ServiceKind,
  ServiceScope,
  Sku,
} from "./catalog";
import type { PvpServiceId } from "../pvp/catalog";

export type InventoryState = "READY" | "EQUIPPED" | "RESERVED" | "CONSUMED";
export type ListingState = "OPEN" | "SOLD" | "CANCELED";
export type ServiceState =
  "HIRED" | "DELIVERED" | "DISPUTED" | "PAID" | "REFUNDED";

export interface OwnedItem {
  id: string;
  sku: Sku;
  state: InventoryState;
  acquiredAt: string;
}

export interface MarketOffer {
  id: string;
  sku: Sku;
  seller: string;
  priceSats: string;
  state: ListingState;
  own: boolean;
}

export interface ServiceOfferView {
  id: string;
  kind: ServiceKind;
  title: string;
  description: string;
  merchant: string;
  biography: string;
  priceSats: string;
  hours: number;
  active: boolean;
  revision: number;
  own: boolean;
  delivered: number;
  reputation: number | null;
}

export interface DutyBoard {
  day: string;
  earned: number;
  reserveReached: boolean;
  next: {
    id: string;
    reward: number;
    title: string;
    briefing: string;
    questions: { prompt: string; options: string[] }[];
  } | null;
  retryAt: string | null;
}

export interface ServiceContractView {
  id: string;
  kind: ServiceKind;
  title: string;
  description: string | null;
  priceSats: string;
  feePercent: number;
  scope: ServiceScope | null;
  report: string | null;
  effect: string | null;
  reviewAt: string | null;
  state: ServiceState;
  client: string;
  provider: string;
  side: "client" | "provider";
  target: { ipv4: string | null; ipv6: string } | null;
  evidenceChoices: { id: string; at: string; summary: string }[];
  hiredAt: string;
  dueAt: string;
  deliveredAt: string | null;
  evidence: string | null;
  disputedAt: string | null;
  dispute: string | null;
  settledAt: string | null;
  resolution: string | null;
  rating: number | null;
}

export interface ExchangeState {
  deployed: boolean;
  linked: boolean;
  canTrade: boolean;
  balanceSats: string | null;
  inventory: OwnedItem[];
  duty: DutyBoard;
  storyRequirement: { code: string; sku: Sku } | null;
  serviceAssets: {
    integrity: number;
    recoveryAvailableAt: string | null;
    services: PvpServiceId[];
    incidents: { id: string; at: string; summary: string }[];
  } | null;
  rewards: {
    id: RewardId;
    state: "locked" | "ready" | "claimed";
    available: number;
  }[];
  market: MarketOffer[];
  marketHistory: MarketOffer[];
  merchant: { description: string } | null;
  services: ServiceOfferView[];
  contracts: ServiceContractView[];
}

export type ExchangeAction =
  | { type: "shop.buy"; sku: Sku; quantity?: number }
  | {
      type:
        | "inventory.equip"
        | "inventory.unequip"
        | "inventory.use"
        | "inventory.read";
      id: string;
    }
  | { type: "reward.claim"; reward: RewardId }
  | { type: "duty.submit"; id: string; answers: [number, number] }
  | { type: "market.list"; id: string; price: string }
  | { type: "market.buy"; id: string }
  | { type: "market.cancel"; id: string }
  | { type: "merchant.save"; description: string }
  | {
      type: "service.offer";
      kind: ServiceKind;
      title: string;
      description: string;
      price: string;
      hours: number;
    }
  | { type: "service.pause" | "service.refund"; id: string }
  | {
      type: "service.hire";
      id: string;
      revision: number;
      service?: PvpServiceId;
      incidentId?: string;
    }
  | { type: "service.deliver"; id: string; evidenceId: string }
  | {
      type: "service.report";
      id: string;
      finding: ServiceFinding;
      report: string;
    }
  | { type: "service.accept"; id: string; rating: number }
  | { type: "service.dispute"; id: string; reason: string };

export interface ExchangeResult {
  message: string;
  id?: string;
  content?: string;
  accepted?: boolean;
}
