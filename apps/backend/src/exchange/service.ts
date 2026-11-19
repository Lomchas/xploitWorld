import { createHash } from "node:crypto";
import { Prisma, type PrismaClient, type PvpProfile } from "@prisma/client";
import {
  CATALOG,
  MISSIONS,
  campaignMission,
  STORY_EQUIPMENT,
  isSku,
  SATS_PER_BTC,
  type ExchangeAction,
  type ExchangeResult,
  type ExchangeState,
} from "@null-protocol/shared";
import { HttpError } from "../lib/http";
import type { RuntimeMode } from "../lib/mode";
import { isLinkedOperator } from "../lib/account";
import { executeTurn } from "../pvp/actions";
import { regionIdOf } from "../pvp/records";
import { lockRegion } from "../pvp/service";
import { economyTransaction, moveBalance, type Tx } from "./ledger";
import { closeListing, listItem, readMarket } from "./market";
import {
  claimReward,
  completedMissions,
  graduated,
  readRewards,
} from "./rewards";
import { operateService, readServices, settleDue } from "./services";
import { requireStock } from "./inventory";
import { readDuty, submitDuty } from "./duty";

const WORKSHOP = [
  "Taller de huellas digitales · Laboratorio de Vanta",
  "Ejercicio 1. Abre el capítulo 1 y calcula la huella de los dos espejos con sha256sum caso/norte.msg caso/sur.msg.",
  "Ejercicio 2. Verifica los manifiestos por separado con sha256sum -c. Registra qué archivo cambió y compara la evidencia con la bitácora.",
  "Una huella vincula un archivo con un contenido esperado. Para atribuir su origen, conserva también la fuente del manifiesto.",
].join("\n");

async function useItem(
  tx: Tx,
  userId: string,
  actor: PvpProfile | null,
  action: Extract<
    ExchangeAction,
    {
      type:
        | "inventory.equip"
        | "inventory.unequip"
        | "inventory.use"
        | "inventory.read";
    }
  >,
  now: Date,
  mode: RuntimeMode,
): Promise<ExchangeResult> {
  const item = await tx.inventoryItem.findFirst({
    where: { id: action.id, userId },
  });
  if (
    !item ||
    !isSku(item.sku) ||
    item.state === "RESERVED" ||
    item.state === "CONSUMED"
  )
    throw new HttpError(
      409,
      "El artículo no está disponible en tu inventario.",
    );
  const product = CATALOG[item.sku];
  switch (action.type) {
    case "inventory.read":
      if (product.use !== "read")
        throw new HttpError(400, "Selecciona un taller.");
      return { id: item.id, message: product.name, content: WORKSHOP };
    case "inventory.equip":
      if (product.use !== "equip" || item.state !== "READY")
        throw new HttpError(
          409,
          "Selecciona un artículo que se pueda equipar.",
        );
      await tx.inventoryItem.update({
        where: { id: item.id },
        data: { state: "EQUIPPED" },
      });
      return { id: item.id, message: product.name + " equipado." };
    case "inventory.unequip":
      if (item.state !== "EQUIPPED")
        throw new HttpError(409, "El artículo debe estar equipado.");
      await tx.inventoryItem.update({
        where: { id: item.id },
        data: { state: "READY" },
      });
      return {
        id: item.id,
        message: product.name + " devuelto al inventario.",
      };
    case "inventory.use": {
      if (product.use !== "consume" || item.state !== "READY")
        throw new HttpError(409, "Selecciona una carga disponible.");
      if (mode === "story") {
        await tx.inventoryItem.update({
          where: { id: item.id },
          data: { state: "CONSUMED" },
        });
        await moveBalance(
          tx,
          userId,
          BigInt(product.price) * SATS_PER_BTC,
          "retired-item-refund",
          "retired:" + item.id,
          now,
        );
        return {
          id: item.id,
          message: "Carga retirada. Se devolvieron 20 BTC de Historia.",
        };
      }
      if (!actor)
        throw new HttpError(
          409,
          "Despliega un dispositivo para usar una carga de recuperación.",
        );
      await lockRegion(tx, regionIdOf(actor));
      const current = await tx.pvpProfile.findUniqueOrThrow({
        where: { id: actor.id },
      });
      const result = await executeTurn(
        tx,
        current,
        { type: "repair" },
        now,
        "charge",
      );
      await tx.inventoryItem.update({
        where: { id: item.id },
        data: { state: "CONSUMED" },
      });
      return { id: item.id, message: result.message };
    }
  }
}

export class ExchangeService {
  constructor(
    private readonly db: PrismaClient,
    private readonly clock: () => Date = () => new Date(),
    private readonly mode: RuntimeMode = "legacy",
  ) {}

  async state(userId: string): Promise<ExchangeState> {
    const now = this.clock();
    if (this.mode !== "story") await settleDue(this.db, now, userId);
    return this.db.$transaction(
      async (tx) => {
        const user = await tx.user.findUniqueOrThrow({
          where: { id: userId },
          select: {
            role: true,
            password: true,
            balanceSats: true,
            pvpProfile:
              this.mode !== "story" ? { select: { id: true } } : false,
          },
        });
        const profileId = user.pvpProfile?.id;
        const linked = isLinkedOperator(user);
        const slugs =
          this.mode === "pvp"
            ? new Set<string>()
            : await completedMissions(tx, userId);
        const items =
          this.mode === "pvp"
            ? []
            : await tx.inventoryItem.findMany({
                where: { userId, state: { not: "CONSUMED" } },
                orderBy: [{ acquiredAt: "desc" }, { id: "asc" }],
              });
        const next =
          this.mode === "pvp"
            ? undefined
            : MISSIONS.find(({ slug }) => !slugs.has(slug));
        const code = next && campaignMission(next.slug)?.code;
        const sku = code && STORY_EQUIPMENT[code];
        const storyRequirement =
          code &&
          sku &&
          !items.some((item) => item.sku === sku && item.state !== "RESERVED")
            ? { code, sku }
            : null;
        return {
          deployed: !!profileId,
          linked,
          canTrade:
            !!profileId && linked && (this.mode === "pvp" || graduated(slugs)),
          balanceSats: user.balanceSats.toString(),
          storyRequirement,
          duty:
            this.mode === "pvp"
              ? {
                  day: "",
                  earned: 0,
                  reserveReached: false,
                  next: null,
                  retryAt: null,
                }
              : await readDuty(tx, userId, now, this.mode === "legacy"),
          inventory: items.flatMap((item) =>
            isSku(item.sku)
              ? [
                  {
                    id: item.id,
                    sku: item.sku,
                    state: item.state,
                    acquiredAt: item.acquiredAt.toISOString(),
                  },
                ]
              : [],
          ),
          rewards: await readRewards(
            tx,
            userId,
            profileId,
            linked,
            slugs,
            now,
            this.mode,
          ),
          ...(this.mode === "legacy"
            ? await readMarket(tx, profileId)
            : { market: [], marketHistory: [] }),
          ...(this.mode !== "story"
            ? await readServices(tx, now, profileId, userId)
            : {
                services: [],
                contracts: [],
                merchant: null,
                serviceAssets: null,
              }),
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  async execute(
    userId: string,
    requestId: string,
    action: ExchangeAction,
  ): Promise<ExchangeResult> {
    const arenaAction =
      action.type.startsWith("service.") ||
      action.type === "merchant.save" ||
      (action.type === "reward.claim" && action.reward === "rival");
    const storyAction =
      action.type === "shop.buy" ||
      action.type === "duty.submit" ||
      action.type.startsWith("inventory.") ||
      (action.type === "reward.claim" && action.reward !== "rival");
    if (
      (this.mode === "story" && !storyAction) ||
      (this.mode === "pvp" && !arenaAction)
    )
      throw new HttpError(404, "Esta operación pertenece a otro modo.");
    return economyTransaction(this.db, async (tx) => {
      const user = await tx.user.findUniqueOrThrow({
        where: { id: userId },
        include: { pvpProfile: this.mode !== "story" },
      });
      const linked = isLinkedOperator(user);
      const actor = user.pvpProfile ?? null;
      const key = { userId, requestId };
      const fingerprint = createHash("sha256")
        .update(JSON.stringify(action))
        .digest("hex");
      const receipt = await tx.economyReceipt.findUnique({
        where: { userId_requestId: key },
      });
      if (receipt) {
        if (receipt.fingerprint !== fingerprint)
          throw new HttpError(
            409,
            "El identificador ya corresponde a otra acción.",
          );
        return receipt.result as unknown as ExchangeResult;
      }
      const now = this.clock();
      const result = await this.dispatch(
        tx,
        userId,
        actor,
        linked,
        requestId,
        action,
        now,
      );
      await tx.economyReceipt.create({
        data: { ...key, fingerprint, result: { ...result }, createdAt: now },
      });
      return result;
    });
  }

  private async dispatch(
    tx: Tx,
    userId: string,
    actor: PvpProfile | null,
    linked: boolean,
    requestId: string,
    action: ExchangeAction,
    now: Date,
  ): Promise<ExchangeResult> {
    switch (action.type) {
      case "shop.buy": {
        const product = CATALOG[action.sku];
        if (this.mode === "story" && action.sku === "recovery")
          throw new HttpError(409, "Esta carga ya no se vende en Historia.");
        const quantity = action.quantity ?? 1;
        await requireStock(tx, userId, action.sku, quantity);
        await moveBalance(
          tx,
          userId,
          -BigInt(product.price * quantity) * SATS_PER_BTC,
          "shop-buy",
          "shop:" + requestId,
          now,
        );
        const items = await tx.inventoryItem.createManyAndReturn({
          data: Array.from({ length: quantity }, () => ({
            userId,
            sku: action.sku,
            acquiredAt: now,
          })),
          select: { id: true },
        });
        return {
          id: items[0]!.id,
          message:
            quantity === 1
              ? product.name + " añadido a tu inventario."
              : `${quantity} unidades de ${product.name} añadidas al inventario.`,
        };
      }
      case "duty.submit":
        return submitDuty(
          tx,
          userId,
          action.id,
          action.answers,
          now,
          this.mode === "legacy",
        );
      case "inventory.equip":
      case "inventory.unequip":
      case "inventory.use":
      case "inventory.read":
        return useItem(tx, userId, actor, action, now, this.mode);
      case "reward.claim":
        return claimReward(
          tx,
          userId,
          actor?.id,
          linked,
          action.reward,
          now,
          this.mode,
        );
      default:
        if (!actor || !linked)
          throw new HttpError(
            403,
            "Vincula tu cuenta y despliega tu dispositivo para operar en Exchange.",
          );
        if (
          this.mode === "legacy" &&
          !graduated(await completedMissions(tx, userId))
        )
          throw new HttpError(
            403,
            "Completa los seis retos para comerciar con otros operadores.",
          );
        if (action.type === "market.list")
          return listItem(tx, actor, action.id, action.price);
        if (action.type === "market.buy" || action.type === "market.cancel")
          return closeListing(
            tx,
            actor,
            action.id,
            action.type === "market.buy",
            now,
          );
        return operateService(tx, actor, action, now);
    }
  }
}
