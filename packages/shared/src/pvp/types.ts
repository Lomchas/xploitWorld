import type {
  PvpProtocol,
  PvpRegionId,
  PvpServiceId,
  PvpToolId,
} from "./catalog";

export type PvpPolicy = "allow" | "drop";
export type PvpTransport = PvpProtocol | "any";
export interface PvpRuleInput {
  action: PvpPolicy;
  protocol: PvpTransport;
  port: number | null;
  sourceId: string | null;
}
export interface PvpRule extends PvpRuleInput {
  id: string;
}
export interface PvpDeviceConfig {
  tools: PvpToolId[];
  services: Record<
    PvpServiceId,
    {
      open: boolean;
      patched: boolean;
      restartUntil?: string;
    }
  >;
  policy: PvpPolicy;
  rules: PvpRule[];
  tls: boolean;
  vpn: boolean;
  trustedPeers: string[];
  isolated: boolean;
}
export type PvpAction =
  | { type: "scan"; targetId: string }
  | { type: "link.open"; targetId: string; protocol: PvpProtocol; port: number }
  | { type: "exploit"; targetId: string; protocol: PvpProtocol; port: number }
  | { type: "counter"; eventId: string; protocol: PvpProtocol; port: number }
  | { type: "install"; tool: PvpToolId }
  | { type: "patch"; service: PvpServiceId }
  | { type: "service"; service: PvpServiceId; open: boolean }
  | { type: "tls" | "vpn" | "isolate"; enabled: boolean }
  | { type: "trust"; targetId: string; enabled: boolean }
  | { type: "policy"; policy: PvpPolicy }
  | { type: "rule.add"; rule: PvpRuleInput }
  | { type: "rule.remove"; ruleId: string }
  | { type: "rule.move"; ruleId: string; direction: "up" | "down" }
  | { type: "analyze" | "block" | "ack"; eventId: string }
  | { type: "repair" };

export type PvpPortState = "open" | "closed" | "filtered";
export interface PvpLinkState {
  id: string;
  peerAlias: string;
  incoming: boolean;
  protocol: PvpProtocol;
  port: number;
  openedAt: string;
  closedAt: string | null;
  reason: string | null;
}
export interface PvpPortObservation {
  protocol: PvpProtocol;
  port: number;
  state: PvpPortState;
  banner?: string;
}
export interface PvpFlow {
  source: string;
  destination: string;
  protocol: PvpProtocol;
  sourcePort: number;
  port: number;
  state: PvpPortState;
  encryption: "none" | "tls" | "vpn";
  trace: string[];
}
export interface PvpSpecimen {
  format: "NPX1";
  hex: string;
  sha256: string;
}
export interface PvpAnalysis {
  signature: string;
  service: PvpServiceId;
  instructions: string[];
  sha256: string;
  remedy: string;
}
export type PvpEventKind =
  | "join"
  | "transfer"
  | "link"
  | "scan"
  | "probe"
  | "alert"
  | "integrity"
  | "configuration"
  | "analysis"
  | "repair";
export interface PvpEventData {
  message: string;
  severity: "info" | "notice" | "warning" | "critical";
  incident?: "recon" | "probe";
  ports?: PvpPortObservation[];
  flows?: PvpFlow[];
  specimen?: PvpSpecimen;
  analysis?: PvpAnalysis;
}
export interface PvpEvent extends PvpEventData {
  id: string;
  kind: PvpEventKind;
  peerId: string | null;
  createdAt: string;
  acknowledgedAt: string | null;
  archived?: boolean;
}
export interface PvpPeer {
  id: string;
  alias: string;
  address: string;
  ipv4: string | null;
  online: boolean;
  score: number;
  compromises: number;
}
export interface PvpSelf extends PvpPeer {
  hostname?: string;
  equipment?: string[];
  regionId: PvpRegionId;
  arenaVisit: number;
  balanceSats: string;
  integrity: number;
  energy: number;
  attackReadyAt: string | null;
  repairReadyAt: string | null;
  config: PvpDeviceConfig;
}
export interface PvpState {
  self: PvpSelf | null;
  serverTime: string;
  revision: number;
  worldRevision: number;
  peers: PvpPeer[];
  peerCount: number;
  onlineCount: number;
  page: number;
  leaderboard: PvpPeer[];
  events: PvpEvent[];
  links: PvpLinkState[];
}
export interface PvpJoinResult {
  self: PvpSelf;
  granted: boolean;
}
export interface PvpActionResult {
  outcome: "ok" | "blocked" | "hit" | "compromised";
  message: string;
  ports?: PvpPortObservation[];
  analysis?: PvpAnalysis;
}
