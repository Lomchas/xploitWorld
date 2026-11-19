import type { Sku } from "@null-protocol/shared";
import type { Tx } from "./ledger";

export async function equipped(
  tx: Tx,
  userId: string,
  sku: Sku,
): Promise<boolean> {
  return (
    (await tx.inventoryItem.count({
      where: { userId, sku, state: "EQUIPPED" },
    })) > 0
  );
}
