import type { Balance } from "@mm/core";

export function inventoryRatio(balances: Balance[], baseAsset: string, targetBase: number): number {
  const base = balances.find((b) => b.asset.toUpperCase() === baseAsset.toUpperCase())?.free ?? 0;
  if (targetBase <= 0) return 1;
  return base / targetBase;
}