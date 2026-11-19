import {
  btcToSats,
  CATALOG,
  SATS_PER_BTC,
  isSku,
  MARKET_FEE_PERCENT,
  type MarketOffer,
} from "@null-protocol/shared";
import type { Prisma } from "@prisma/client";
import { HttpError } from "../lib/http";
import { moveBalance, type Tx } from "./ledger";
import { requireStock } from "./inventory";

export async function listItem(
  tx: Tx,
  seller: { id: string; userId: string },
  itemId: string,
  price: string,
) {
  const sellerId = seller.id;
  const count = await tx.marketListing.count({
    where: { sellerId, state: "OPEN" },
  });
  if (count >= 12)
    throw new HttpError(409, "Puedes mantener hasta 12 ofertas activas.");
  const item = await tx.inventoryItem.findFirst({
    where: { id: itemId, userId: seller.userId, state: "READY" },
  });
  if (!item || !isSku(item.sku))
    throw new HttpError(
      409,
      "Selecciona un artículo disponible de tu inventario.",
    );
  const priceSats = btcToSats(price);
  if (
    priceSats === null ||
    priceSats > BigInt(CATALOG[item.sku].price) * SATS_PER_BTC
  )
    throw new HttpError(
      400,
      "El precio del mercado debe estar entre 1 BTC y el precio de tienda.",
    );
  await tx.inventoryItem.update({
    where: { id: item.id },
    data: { state: "RESERVED" },
  });
  const listing = await tx.marketListing.create({
    data: { itemId, sellerId, priceSats },
  });
  return {
    id: listing.id,
    message: "Oferta publicada. El artículo está reservado.",
  };
}

export async function closeListing(
  tx: Tx,
  actor: { id: string; userId: string },
  id: string,
  buy: boolean,
  now: Date,
) {
  const listing = await tx.marketListing.findFirst({
    where: { id, state: "OPEN" },
    include: { item: true, seller: { select: { userId: true } } },
  });
  if (!listing) throw new HttpError(409, "Esta oferta ya no está disponible.");
  if (buy ? listing.sellerId === actor.id : listing.sellerId !== actor.id)
    throw new HttpError(403, "Esta operación no corresponde a tu operador.");
  if (
    listing.item.userId !== listing.seller.userId ||
    listing.item.state !== "RESERVED"
  )
    throw new HttpError(409, "La reserva del artículo ya no es válida.");
  if (buy) {
    if (!isSku(listing.item.sku))
      throw new HttpError(409, "Esta oferta ya no está disponible.");
    if (
      listing.priceSats >
      BigInt(CATALOG[listing.item.sku].price) * SATS_PER_BTC
    )
      throw new HttpError(
        409,
        "El vendedor debe actualizar el precio de esta oferta.",
      );
    await requireStock(tx, actor.userId, listing.item.sku, 1);
    const fee = (listing.priceSats * BigInt(MARKET_FEE_PERCENT)) / 100n;
    await moveBalance(
      tx,
      actor.userId,
      -listing.priceSats,
      "market-buy",
      "market-buy:" + id,
      now,
    );
    await moveBalance(
      tx,
      listing.seller.userId,
      listing.priceSats,
      "market-sale",
      "market-sale:" + id,
      now,
    );
    await moveBalance(
      tx,
      listing.seller.userId,
      -fee,
      "market-fee",
      "market-fee:" + id,
      now,
    );
  }
  await tx.inventoryItem.update({
    where: { id: listing.itemId },
    data: { state: "READY", ...(buy ? { userId: actor.userId } : {}) },
  });
  await tx.marketListing.update({
    where: { id },
    data: {
      state: buy ? "SOLD" : "CANCELED",
      buyerId: buy ? actor.id : null,
      closedAt: now,
    },
  });
  return {
    id,
    message: buy
      ? "Compra liquidada. El artículo está en tu inventario."
      : "Oferta cancelada. El artículo volvió al inventario.",
  };
}

const listingRelations = {
  item: { select: { sku: true } },
  seller: { select: { alias: true } },
} as const;
type Listing = Prisma.MarketListingGetPayload<{
  include: typeof listingRelations;
}>;
const publicListing = (
  item: Listing,
  profileId: string | undefined,
): MarketOffer[] =>
  isSku(item.item.sku)
    ? [
        {
          id: item.id,
          sku: item.item.sku,
          seller: item.seller.alias,
          priceSats: item.priceSats.toString(),
          state: item.state,
          own: item.sellerId === profileId,
        },
      ]
    : [];

export async function readMarket(tx: Tx, profileId?: string) {
  const open = await tx.marketListing.findMany({
    where: { state: "OPEN" },
    orderBy: [{ createdAt: "desc" }, { id: "asc" }],
    take: 80,
    include: listingRelations,
  });
  const history = profileId
    ? await tx.marketListing.findMany({
        where: { OR: [{ sellerId: profileId }, { buyerId: profileId }] },
        orderBy: [{ createdAt: "desc" }, { id: "asc" }],
        take: 50,
        include: listingRelations,
      })
    : [];
  const own = profileId
    ? await tx.marketListing.findMany({
        where: { sellerId: profileId, state: "OPEN" },
        include: listingRelations,
      })
    : [];
  const visible = [
    ...new Map([...own, ...open].map((row) => [row.id, row])).values(),
  ];
  return {
    market: visible.flatMap((item) => publicListing(item, profileId)),
    marketHistory: history.flatMap((item) => publicListing(item, profileId)),
  };
}
