import type { MarketMakingConfig, Quote } from "@mm/core";
import { buildQuotes } from "./level-builder.js";

export class MarketMakingStrategy {
  constructor(private readonly cfg: MarketMakingConfig) {}

  build(symbol: string, mid: number, inventoryRatio: number): Quote[] {
    return buildQuotes({ symbol, mid, cfg: this.cfg, inventoryRatio });
  }
}