import type { PrismaClient } from "@prisma/client";
import type { ArenaDrillResult } from "@null-protocol/shared";
import { HttpError } from "../lib/http";
import { freshDevice, inspectPort, type VirtualHost } from "./network";
import { virtualHost } from "./records";

const DRILL_ID = "portal-v1";

export function evaluatePortal(
  target: VirtualHost,
  now: Date,
): ArenaDrillResult["checks"] {
  const visitor: VirtualHost = {
    id: "drill-visitor",
    address: "2001:db8::1",
    integrity: 100,
    config: freshDevice(),
  };
  const view = (protocol: "tcp" | "udp", port: number) =>
    inspectPort(visitor, target, protocol, port, now);
  const https = view("tcp", 443);
  const http = view("tcp", 80);
  const admin = view("tcp", 22);
  const dns = view("udp", 53);
  const portalOpen =
    https.service === "web" && https.observation.state === "open";
  return [
    {
      id: "portal",
      passed:
        portalOpen &&
        https.encryption === "tls" &&
        http.observation.state !== "open",
    },
    {
      id: "patch",
      passed:
        target.config.services.web.patched &&
        (portalOpen ||
          (http.service === "web" && http.observation.state === "open")),
    },
    {
      id: "admin",
      passed: admin.observation.state !== "open" && !admin.reason,
    },
    {
      id: "dns",
      passed: dns.service === "dns" && dns.observation.state === "open",
    },
  ];
}

export async function portalDrill(
  db: PrismaClient,
  userId: string,
  submit: boolean,
): Promise<ArenaDrillResult> {
  return db.$transaction(async (tx) => {
    if (submit)
      await tx.$queryRaw`SELECT id FROM pvp_profiles WHERE "userId" = ${userId} FOR UPDATE`;
    const profile = await tx.pvpProfile.findUnique({ where: { userId } });
    if (!profile)
      throw new HttpError(
        409,
        "Crea tu computadora de Arena para iniciar el desafío.",
      );
    const now = new Date();
    const checks = evaluatePortal(virtualHost(profile), now);
    const key = { profileId: profile.id, drillId: DRILL_ID };
    if (submit && checks.every((check) => check.passed)) {
      await tx.arenaDrillCompletion.createMany({
        data: [{ ...key, completedAt: now }],
        skipDuplicates: true,
      });
    }
    const result = await tx.arenaDrillCompletion.findUnique({
      where: { profileId_drillId: key },
      select: { completedAt: true },
    });
    return { checks, completedAt: result?.completedAt.toISOString() ?? null };
  });
}
