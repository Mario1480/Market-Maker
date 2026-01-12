import type { Distribution } from "@mm/core";
import { normalizeWeights, randBetween } from "@mm/core";

export function weights(n: number, dist: Distribution): number[] {
  if (n <= 0) return [];
  if (dist === "LINEAR") return Array.from({ length: n }, () => 1 / n);

  if (dist === "VALLEY") {
    const k = 0.7; // more near mid
    const ws = Array.from({ length: n }, (_, i) => Math.exp(-k * i));
    return normalizeWeights(ws);
  }

  // RANDOM
  const ws = Array.from({ length: n }, () => randBetween(0.5, 1.5));
  return normalizeWeights(ws);
}