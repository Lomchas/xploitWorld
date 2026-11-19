import {
  Prisma,
  type PrismaClient,
  type PvpProfile,
  type ServiceContract,
} from "@prisma/client";
import {
  btcToSats,
  SERVICE_KINDS,
  SERVICE_FEE_PERCENT,
  SERVICE_REVIEW_HOURS,
  SATS_PER_BTC,
  type ServiceScope,
  type ExchangeAction,
  type ExchangeState,
  type ServiceKind,
} from "@null-protocol/shared";
import { HttpError } from "../lib/http";
import { eventData, regionIdOf } from "../pvp/records";
import { virtualAddress, virtualIpv4 } from "../pvp/network";
import { economyTransaction, moveBalance, type Tx } from "./ledger";
import { lockRegion } from "../pvp/service";
import { executeTurn } from "../pvp/actions";
import { readConfig } from "../pvp/validation";
import {
  contractScope,
  listServiceAssets,
  verifyFinding,
} from "./service-scope";

const OPEN_STATES = ["HIRED", "DELIVERED", "DISPUTED"] as const;
const PROOF_KINDS = {
  audit: "scan",
  analysis: "analysis",
  recovery: "repair",
  maintenance: "configuration",
} as const;
const HOUR = 3_600_000;

async function applyService(
  tx: Tx,
  contract: ServiceContract,
  now: Date,
): Promise<{ message: string; applied: boolean } | null> {
  const scope = contract.scope as ServiceScope | null;
  if (!scope || (scope.kind !== "recovery" && scope.kind !== "maintenance"))
    return null;
  const member = await tx.pvpProfile.findUniqueOrThrow({
    where: { id: contract.clientId },
  });
  await lockRegion(tx, regionIdOf(member));
  const client = await tx.pvpProfile.findUniqueOrThrow({
    where: { id: member.id },
  });
  if (scope.kind === "recovery" && client.integrity >= 100)
    return {
      message: "El equipo ya estaba recuperado. Se devolvió el pago.",
      applied: false,
    };
  if (
    scope.kind === "maintenance" &&
    readConfig(client.config).services[scope.service].patched
  )
    return {
      message: "El servicio ya estaba parcheado. Se devolvió el pago.",
      applied: false,
    };
  const result = await executeTurn(
    tx,
    client,
    scope.kind === "recovery"
      ? { type: "repair" }
      : { type: "patch", service: scope.service },
    now,
    "contract",
  );
  return { message: result.message, applied: true };
}

async function finish(
  tx: Tx,
  contract: ServiceContract,
  paid: boolean,
  now: Date,
  resolution: string,
  rating?: number,
): Promise<boolean> {
  const effect = paid ? await applyService(tx, contract, now) : null;
  const settle = paid && effect?.applied !== false;
  const profile = await tx.pvpProfile.findUniqueOrThrow({
    where: { id: settle ? contract.providerId : contract.clientId },
    select: { userId: true },
  });
  const kind = settle ? "service-pay" : "service-refund";
  await moveBalance(
    tx,
    profile.userId,
    contract.priceSats,
    kind,
    kind + ":" + contract.id,
    now,
  );
  if (settle && contract.feePercent)
    await moveBalance(
      tx,
      profile.userId,
      -((contract.priceSats * BigInt(contract.feePercent)) / 100n),
      "service-fee",
      "service-fee:" + contract.id,
      now,
    );
  await tx.serviceContract.update({
    where: { id: contract.id },
    data: {
      state: settle ? "PAID" : "REFUNDED",
      settledAt: now,
      resolution: effect?.applied === false ? effect.message : resolution,
      effect: settle ? effect?.message : null,
      rating: settle ? (rating ?? null) : null,
    },
  });
  return settle;
}

function dueFilter(now: Date) {
  return {
    OR: [
      { state: "HIRED" as const, dueAt: { lte: now } },
      {
        state: "DELIVERED" as const,
        scope: { not: Prisma.DbNull },
        deliveredAt: {
          lte: new Date(now.getTime() - SERVICE_REVIEW_HOURS * HOUR),
        },
      },
    ],
  };
}

async function closeDue(tx: Tx, contract: ServiceContract, now: Date) {
  return finish(
    tx,
    contract,
    contract.state === "DELIVERED",
    now,
    contract.state === "DELIVERED"
      ? "Plazo de revisión cumplido. Entrega liquidada automáticamente."
      : "Plazo de entrega vencido.",
  );
}

export async function settleDue(
  db: PrismaClient,
  now: Date,
  userId?: string,
): Promise<void> {
  const due = dueFilter(now);
  const where = userId
    ? { AND: [due, { OR: [{ client: { userId } }, { provider: { userId } }] }] }
    : due;
  if (
    !(await db.serviceContract.findFirst({
      where,
      select: { id: true },
    }))
  )
    return;
  await economyTransaction(db, async (tx) => {
    const contracts = await tx.serviceContract.findMany({
      where,
      orderBy: [{ dueAt: "asc" }, { id: "asc" }],
      take: 24,
    });
    for (const contract of contracts) await closeDue(tx, contract, now);
  });
}

type ServiceAction = Extract<
  ExchangeAction,
  {
    type:
      | "merchant.save"
      | "service.offer"
      | "service.pause"
      | "service.hire"
      | "service.deliver"
      | "service.report"
      | "service.accept"
      | "service.dispute"
      | "service.refund";
  }
>;

export async function operateService(
  tx: Tx,
  actor: PvpProfile,
  action: ServiceAction,
  now: Date,
) {
  if (action.type === "merchant.save") {
    await tx.merchant.upsert({
      where: { profileId: actor.id },
      create: { profileId: actor.id, description: action.description },
      update: { description: action.description },
    });
    return { message: "Perfil de comerciante guardado." };
  }
  if (action.type === "service.offer") {
    if (!(await tx.merchant.findUnique({ where: { profileId: actor.id } })))
      throw new HttpError(409, "Crea primero tu perfil de comerciante.");
    const rate = SERVICE_KINDS[action.kind];
    const priceSats = btcToSats(action.price);
    if (
      priceSats === null ||
      priceSats < BigInt(rate.min) * SATS_PER_BTC ||
      priceSats > BigInt(rate.max) * SATS_PER_BTC
    )
      throw new HttpError(
        400,
        `Este servicio admite precios entre ${rate.min} y ${rate.max} BTC.`,
      );
    const terms = {
      title: action.title,
      description: action.description,
      priceSats,
      hours: action.hours,
      active: true,
    };
    const key = { merchantId: actor.id, kind: action.kind };
    const offer = await tx.serviceOffer.upsert({
      where: { merchantId_kind: key },
      create: { ...key, ...terms },
      update: { ...terms, revision: { increment: 1 } },
    });
    return { id: offer.id, message: "Servicio publicado." };
  }
  if (action.type === "service.pause") {
    const paused = await tx.serviceOffer.updateMany({
      where: { id: action.id, merchantId: actor.id, active: true },
      data: { active: false, revision: { increment: 1 } },
    });
    if (paused.count !== 1)
      throw new HttpError(404, "Oferta activa no encontrada.");
    return {
      id: action.id,
      message: "Oferta pausada. Los contratos abiertos siguen vigentes.",
    };
  }
  if (action.type === "service.hire") {
    const offer = await tx.serviceOffer.findFirst({
      where: { id: action.id, active: true },
    });
    if (!offer)
      throw new HttpError(409, "Este servicio ya no está disponible.");
    if (offer.revision !== action.revision)
      throw new HttpError(
        409,
        "Las condiciones del servicio cambiaron. Revisa la oferta actualizada.",
      );
    if (offer.merchantId === actor.id)
      throw new HttpError(400, "Elige el servicio de otro comerciante.");
    if (!Object.hasOwn(SERVICE_KINDS, offer.kind))
      throw new HttpError(409, "Este servicio ya no está disponible.");
    const kind = offer.kind as ServiceKind;
    const rate = SERVICE_KINDS[kind];
    if (
      offer.priceSats < BigInt(rate.min) * SATS_PER_BTC ||
      offer.priceSats > BigInt(rate.max) * SATS_PER_BTC
    )
      throw new HttpError(
        409,
        "El proveedor debe actualizar el precio de esta oferta.",
      );
    const due = await tx.serviceContract.findMany({
      where: {
        AND: [
          dueFilter(now),
          { OR: [{ clientId: actor.id }, { providerId: offer.merchantId }] },
        ],
      },
      orderBy: { id: "asc" },
      take: 24,
    });
    for (const row of due) await closeDue(tx, row, now);
    const member = await tx.pvpProfile.findUniqueOrThrow({
      where: { id: actor.id },
    });
    const scope = await contractScope(tx, member, kind, action, now);
    const open = await tx.serviceContract.findMany({
      where: {
        state: { in: [...OPEN_STATES] },
        OR: [{ clientId: actor.id }, { providerId: offer.merchantId }],
      },
      select: {
        clientId: true,
        providerId: true,
        offerId: true,
        kind: true,
        scope: true,
      },
    });
    if (
      open.some((row) => {
        if (row.clientId !== actor.id) return false;
        if (
          row.offerId === offer.id ||
          (kind === "recovery" && row.kind === kind)
        )
          return true;
        const previous = row.scope as ServiceScope | null;
        return (
          (scope.kind === "maintenance" &&
            previous?.kind === "maintenance" &&
            previous.service === scope.service) ||
          (scope.kind === "analysis" &&
            previous?.kind === "analysis" &&
            previous.incident.id === scope.incident.id)
        );
      })
    )
      throw new HttpError(
        409,
        "Ya tienes un contrato abierto para este servicio.",
      );
    if (
      open.filter((row) => row.clientId === actor.id).length >= 6 ||
      open.filter((row) => row.providerId === offer.merchantId).length >= 6
    )
      throw new HttpError(409, "Se alcanzó el límite de contratos activos.");
    const contract = await tx.serviceContract.create({
      data: {
        offerId: offer.id,
        clientId: actor.id,
        providerId: offer.merchantId,
        kind: offer.kind,
        title: offer.title,
        description: offer.description,
        scope: scope as unknown as Prisma.InputJsonValue,
        feePercent: SERVICE_FEE_PERCENT,
        priceSats: offer.priceSats,
        hiredAt: now,
        dueAt: new Date(now.getTime() + offer.hours * HOUR),
      },
    });
    await moveBalance(
      tx,
      actor.userId,
      -offer.priceSats,
      "service-hold",
      "service-hold:" + contract.id,
      now,
    );
    return {
      id: contract.id,
      message: "Contrato abierto. El pago quedó reservado.",
    };
  }

  const contract = await tx.serviceContract.findFirst({
    where: {
      id: action.id,
      OR: [{ clientId: actor.id }, { providerId: actor.id }],
    },
  });
  if (!contract) throw new HttpError(404, "Contrato no encontrado.");
  const client = contract.clientId === actor.id;
  switch (action.type) {
    case "service.report": {
      if (
        client ||
        !contract.scope ||
        contract.state !== "HIRED" ||
        contract.dueAt <= now
      )
        throw new HttpError(
          409,
          "La entrega requiere un contrato vigente del comerciante.",
        );
      verifyFinding(contract.scope as unknown as ServiceScope, action.finding);
      await tx.serviceContract.update({
        where: { id: contract.id },
        data: {
          state: "DELIVERED",
          deliveredAt: now,
          report: action.report,
          evidence: action.finding,
        },
      });
      return {
        id: contract.id,
        message: "Diagnóstico validado y enviado al cliente.",
      };
    }
    case "service.deliver": {
      if (
        client ||
        contract.scope ||
        contract.state !== "HIRED" ||
        contract.dueAt <= now
      )
        throw new HttpError(
          409,
          "La entrega requiere un contrato vigente del comerciante.",
        );
      const kind = PROOF_KINDS[contract.kind as ServiceKind];
      const evidence = await tx.pvpEvent.findFirst({
        where: {
          id: action.evidenceId,
          profileId: actor.id,
          kind,
          createdAt: { gt: contract.hiredAt, lte: now },
          ...(contract.kind === "audit" ? { peerId: contract.clientId } : {}),
        },
      });
      if (
        !kind ||
        !evidence ||
        (await tx.serviceContract.findUnique({
          where: { evidenceId: evidence.id },
        }))
      )
        throw new HttpError(
          409,
          "Usa una evidencia propia, posterior al contrato, del tipo solicitado y aún sin entregar.",
        );
      const proof = eventData(evidence);
      const description =
        contract.kind === "audit"
          ? "Reconocimiento del cliente · " +
            (proof.ports ?? [])
              .map(
                (port) =>
                  port.protocol.toUpperCase() +
                  "/" +
                  port.port +
                  " " +
                  port.state,
              )
              .join(", ")
          : proof.message;
      await tx.serviceContract.update({
        where: { id: contract.id },
        data: {
          state: "DELIVERED",
          deliveredAt: now,
          evidenceId: evidence.id,
          evidence: description,
        },
      });
      return {
        id: contract.id,
        message: "Evidencia verificada y entregada al cliente.",
      };
    }
    case "service.accept": {
      if (
        !client ||
        (contract.state !== "DELIVERED" && contract.state !== "DISPUTED")
      )
        throw new HttpError(
          409,
          "Solo el cliente puede liberar el pago de una entrega.",
        );
      const paid = await finish(
        tx,
        contract,
        true,
        now,
        "Entrega aceptada por el cliente.",
        action.rating,
      );
      return {
        id: contract.id,
        message: paid
          ? "Pago liberado y reputación registrada."
          : "Pago devuelto a la billetera del cliente.",
      };
    }
    case "service.dispute":
      if (
        contract.state !== "DELIVERED" ||
        (contract.scope
          ? !client ||
            now.getTime() - contract.deliveredAt!.getTime() >=
              SERVICE_REVIEW_HOURS * HOUR
          : !client &&
            now.getTime() - contract.deliveredAt!.getTime() <
              SERVICE_REVIEW_HOURS * HOUR)
      )
        throw new HttpError(
          409,
          "El plazo para disputar esta entrega no está disponible.",
        );
      await tx.serviceContract.update({
        where: { id: contract.id },
        data: { state: "DISPUTED", disputedAt: now, dispute: action.reason },
      });
      return {
        id: contract.id,
        message: "Disputa abierta. El pago sigue reservado.",
      };
    case "service.refund":
      if (
        !OPEN_STATES.some((state) => state === contract.state) ||
        (client && (contract.state !== "HIRED" || now < contract.dueAt))
      )
        throw new HttpError(
          409,
          "El reembolso requiere renuncia del comerciante o un plazo de entrega vencido.",
        );
      await finish(
        tx,
        contract,
        false,
        now,
        client
          ? "Plazo de entrega vencido."
          : "Reembolso autorizado por el comerciante.",
      );
      return {
        id: contract.id,
        message: "Pago devuelto a la billetera del cliente.",
      };
  }
}

export async function resolveDispute(
  db: PrismaClient,
  id: string,
  paid: boolean,
  reason: string,
): Promise<void> {
  await economyTransaction(db, async (tx) => {
    const contract = await tx.serviceContract.findFirst({
      where: { id, state: "DISPUTED" },
    });
    if (!contract)
      throw new HttpError(404, "No se encontró una disputa activa.");
    await finish(tx, contract, paid, new Date(), "Arbitraje · " + reason);
  });
}

const offerRelations = {
  merchant: { include: { profile: { select: { alias: true } } } },
} as const;
type Offer = Prisma.ServiceOfferGetPayload<{ include: typeof offerRelations }>;
const contractRelations = {
  client: { select: { alias: true, regionId: true, addressNumber: true } },
  provider: { select: { alias: true } },
} as const;

export async function readServices(
  tx: Tx,
  now: Date,
  profileId?: string,
  userId?: string,
): Promise<
  Pick<ExchangeState, "merchant" | "services" | "contracts" | "serviceAssets">
> {
  const orderBy = [{ updatedAt: "desc" }, { id: "asc" }] as const;
  const publicOffers = await tx.serviceOffer.findMany({
    where: { active: true },
    orderBy: [...orderBy],
    take: 60,
    include: offerRelations,
  });
  const ownOffers = profileId
    ? await tx.serviceOffer.findMany({
        where: { merchantId: profileId },
        include: offerRelations,
      })
    : [];
  const offers = [
    ...new Map<string, Offer>(
      [...ownOffers, ...publicOffers].map((row) => [row.id, row]),
    ).values(),
  ];
  const ratings = await tx.serviceContract.groupBy({
    by: ["providerId"],
    where: {
      providerId: { in: offers.map((row) => row.merchantId) },
      state: "PAID",
    },
    _count: { _all: true },
    _avg: { rating: true },
  });
  const reputation = new Map(ratings.map((row) => [row.providerId, row]));
  const involved = profileId
    ? { OR: [{ clientId: profileId }, { providerId: profileId }] }
    : undefined;
  const contracts = involved
    ? await tx.serviceContract.findMany({
        where: involved,
        orderBy: [{ hiredAt: "desc" }, { id: "asc" }],
        take: 80,
        include: contractRelations,
      })
    : [];
  const active = involved
    ? await tx.serviceContract.findMany({
        where: { ...involved, state: { in: [...OPEN_STATES] } },
        orderBy: { hiredAt: "desc" },
        include: contractRelations,
      })
    : [];
  const history = [
    ...new Map([...active, ...contracts].map((row) => [row.id, row])).values(),
  ];
  const proofs = active.some(
    (row) =>
      row.providerId === profileId && row.state === "HIRED" && !row.scope,
  )
    ? await tx.pvpEvent.findMany({
        where: { profileId, kind: { in: Object.values(PROOF_KINDS) } },
        orderBy: { ordinal: "desc" },
        take: 100,
      })
    : [];
  const used = proofs.length
    ? new Set(
        (
          await tx.serviceContract.findMany({
            where: { evidenceId: { in: proofs.map((row) => row.id) } },
            select: { evidenceId: true },
          })
        ).map((row) => row.evidenceId),
      )
    : new Set<string>();
  const merchant = profileId
    ? await tx.merchant.findUnique({
        where: { profileId },
        select: { description: true },
      })
    : null;
  return {
    merchant,
    serviceAssets: userId ? await listServiceAssets(tx, userId, now) : null,
    services: offers
      .filter((row) => Object.hasOwn(SERVICE_KINDS, row.kind))
      .map((row) => ({
        id: row.id,
        kind: row.kind as ServiceKind,
        title: row.title,
        description: row.description,
        merchant: row.merchant.profile.alias,
        biography: row.merchant.description,
        priceSats: row.priceSats.toString(),
        hours: row.hours,
        active: row.active,
        revision: row.revision,
        own: row.merchantId === profileId,
        delivered: reputation.get(row.merchantId)?._count._all ?? 0,
        reputation: reputation.get(row.merchantId)?._avg.rating ?? null,
      })),
    contracts: history.map((row) => ({
      id: row.id,
      kind: row.kind as ServiceKind,
      title: row.title,
      description: row.description,
      priceSats: row.priceSats.toString(),
      feePercent: row.feePercent,
      scope: row.scope as ServiceScope | null,
      report: row.report,
      effect: row.effect,
      reviewAt:
        row.scope && row.deliveredAt
          ? new Date(
              row.deliveredAt.getTime() + SERVICE_REVIEW_HOURS * HOUR,
            ).toISOString()
          : null,
      state: row.state,
      client: row.client.alias,
      provider: row.provider.alias,
      side: row.clientId === profileId ? "client" : "provider",
      target:
        row.providerId === profileId &&
        !row.scope &&
        row.kind === "audit" &&
        row.state === "HIRED"
          ? {
              ipv4: virtualIpv4(row.client.addressNumber),
              ipv6: virtualAddress(
                regionIdOf(row.client),
                row.client.addressNumber,
              ),
            }
          : null,
      evidenceChoices:
        row.providerId === profileId && row.state === "HIRED" && !row.scope
          ? proofs
              .filter(
                (proof) =>
                  !used.has(proof.id) &&
                  proof.kind === PROOF_KINDS[row.kind as ServiceKind] &&
                  proof.createdAt > row.hiredAt &&
                  (row.kind !== "audit" || proof.peerId === row.clientId),
              )
              .slice(0, 12)
              .map((proof) => ({
                id: proof.id,
                at: proof.createdAt.toISOString(),
                summary: eventData(proof).message,
              }))
          : [],
      hiredAt: row.hiredAt.toISOString(),
      dueAt: row.dueAt.toISOString(),
      deliveredAt: row.deliveredAt?.toISOString() ?? null,
      evidence: row.evidence,
      disputedAt: row.disputedAt?.toISOString() ?? null,
      dispute: row.dispute,
      settledAt: row.settledAt?.toISOString() ?? null,
      resolution: row.resolution,
      rating: row.rating,
    })),
  };
}
