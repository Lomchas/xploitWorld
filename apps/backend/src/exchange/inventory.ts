import {
  CATALOG,
  MAX_INVENTORY,
  MAX_PURCHASE_QUANTITY,
  type Sku,
} from "@null-protocol/shared";
import { HttpError } from "../lib/http";
import type { Tx } from "./ledger";

export async function requireStock(
  tx: Tx,
  userId: string,
  sku: Sku,
  quantity: number,
): Promise<void> {
  const product = CATALOG[sku];
  if (
    !Number.isSafeInteger(quantity) ||
    quantity < 1 ||
    quantity > Math.min(product.stock, MAX_PURCHASE_QUANTITY)
  )
    throw new HttpError(400, "Cantidad inválida para este artículo.");
  const items = await tx.inventoryItem.groupBy({
    by: ["sku"],
    where: { userId, state: { not: "CONSUMED" } },
    _count: { _all: true },
  });
  const owned = items.find((row) => row.sku === sku)?._count._all ?? 0;
  if (owned + quantity > product.stock)
    throw new HttpError(
      409,
      product.stock === 1
        ? "Ya tienes este artículo en tu inventario."
        : "Alcanzaste el límite de unidades de este artículo.",
    );
  if (
    items.reduce((sum, row) => sum + row._count._all, 0) + quantity >
    MAX_INVENTORY
  )
    throw new HttpError(
      409,
      "Inventario lleno. Libera un espacio antes de comprar.",
    );
}
