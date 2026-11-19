import {
  PVP_SERVICES,
  SERVICE_RECOVERY_COOLDOWN_MINUTES,
  type PvpServiceId,
  type ServiceFinding,
  type ServiceScope,
  type ServiceSeverity,
} from "@null-protocol/shared";
import type { PvpEvent, PvpProfile } from "@prisma/client";
import { HttpError } from "../lib/http";
import { eventData } from "../pvp/records";
import { readConfig } from "../pvp/validation";
import type { Tx } from "./ledger";

const services = Object.keys(PVP_SERVICES) as PvpServiceId[];
const INCIDENT_KINDS = ["alert", "integrity", "analysis"];
const INCIDENT_MS = 7 * 86_400_000;
const incidentWhere = (profileId: string, now: Date) => ({
  profileId,
  kind: { in: INCIDENT_KINDS },
  createdAt: { gte: new Date(now.getTime() - INCIDENT_MS), lte: now },
});

function evidence(
  event: PvpEvent,
): Extract<ServiceScope, { kind: "analysis" }>["incident"] {
  const data = eventData(event);
  return {
    id: event.id,
    at: event.createdAt.toISOString(),
    summary: data.message,
    severity: data.severity as ServiceSeverity,
    sha256: data.specimen?.sha256 ?? data.analysis?.sha256 ?? null,
  };
}

async function recoveryAvailableAt(tx: Tx, clientId: string, now: Date) {
  const wait = SERVICE_RECOVERY_COOLDOWN_MINUTES * 60_000;
  const latest = await tx.serviceContract.findFirst({
    where: {
      clientId,
      kind: "recovery",
      state: "PAID",
      feePercent: { gt: 0 },
      settledAt: { gt: new Date(now.getTime() - wait) },
    },
    orderBy: { settledAt: "desc" },
    select: { settledAt: true },
  });
  return latest?.settledAt
    ? new Date(latest.settledAt.getTime() + wait).toISOString()
    : null;
}

export async function listServiceAssets(tx: Tx, userId: string, now: Date) {
  const profile = await tx.pvpProfile.findUnique({ where: { userId } });
  if (!profile) return null;
  const config = readConfig(profile.config);
  return {
    integrity: profile.integrity,
    recoveryAvailableAt: await recoveryAvailableAt(tx, profile.id, now),
    services: services.filter((id) => !config.services[id].patched),
    incidents: (
      await tx.pvpEvent.findMany({
        where: incidentWhere(profile.id, now),
        orderBy: { ordinal: "desc" },
        take: 20,
      })
    )
      .map(evidence)
      .map(({ id, at, summary }) => ({ id, at, summary })),
  };
}

export async function contractScope(
  tx: Tx,
  client: PvpProfile,
  kind: ServiceScope["kind"],
  selection: { service?: PvpServiceId; incidentId?: string },
  now: Date,
): Promise<ServiceScope> {
  if (
    (selection.service && kind !== "maintenance") ||
    (selection.incidentId && kind !== "analysis")
  )
    throw new HttpError(400, "El activo no corresponde al tipo de servicio.");
  const config = readConfig(client.config);
  switch (kind) {
    case "audit":
      return {
        kind,
        services: services.map((id) => ({
          id,
          open: config.services[id].open,
          patched: config.services[id].patched,
        })),
        tls: config.tls,
        isolated: config.isolated,
      };
    case "analysis": {
      const event = selection.incidentId
        ? await tx.pvpEvent.findFirst({
            where: {
              ...incidentWhere(client.id, now),
              id: selection.incidentId,
            },
          })
        : null;
      if (!event)
        throw new HttpError(
          409,
          "Selecciona un incidente reciente de tu dispositivo.",
        );
      return { kind, incident: evidence(event) };
    }
    case "recovery":
      if (client.integrity >= 100)
        throw new HttpError(409, "Tu equipo ya tiene la integridad completa.");
      if (await recoveryAvailableAt(tx, client.id, now))
        throw new HttpError(
          409,
          "La recuperación de emergencia sigue en enfriamiento.",
        );
      return { kind, integrity: client.integrity };
    case "maintenance": {
      const service = selection.service;
      if (!service || config.services[service].patched)
        throw new HttpError(
          409,
          "Elige un servicio propio que aún necesite parche.",
        );
      return { kind, service, open: config.services[service].open };
    }
  }
}

export function verifyFinding(
  scope: ServiceScope,
  finding: ServiceFinding,
): void {
  const expected =
    scope.kind === "audit"
      ? scope.services.some(({ open }) => open)
        ? "listening"
        : "quiet"
      : scope.kind === "analysis"
        ? scope.incident.severity
        : scope.kind === "maintenance"
          ? scope.service
          : "repair";
  if (finding !== expected)
    throw new HttpError(
      409,
      "El hallazgo no coincide con la evidencia del cliente.",
    );
}
