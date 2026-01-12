import type { MarketMakingConfig, Quote } from "@mm/core";
import { clamp, randBetween } from "@mm/core";
import { weights } from "./distribution.js";

export function buildQuotes(params: {
  symbol: string;
  mid: number;
  cfg: MarketMakingConfig;
  inventoryRatio: number; // current_base / target_base
}): Quote[] {
  const { symbol, mid, cfg } = params;

  const skew = clamp((params.inventoryRatio - 1) * cfg.skewFactor, -cfg.maxSkew, cfg.maxSkew);
  const skewedMid = mid * (1 + skew);

  const buyN = cfg.levelsDown;
  const sellN = cfg.levelsUp;

  const buyW = weights(buyN, cfg.distribution);
  const sellW = weights(sellN, cfg.distribution);

  const quotes: Quote[] = [];

  // Buy levels
  for (let i = 0; i < buyN; i++) {
    const base = skewedMid * (1 - cfg.spreadPct / 2 - i * cfg.stepPct);
    const jitter = cfg.jitterPct > 0 ? (1 + randBetween(-cfg.jitterPct, cfg.jitterPct)) : 1;
    const price = base * jitter;

    const notional = cfg.budgetQuoteUsdt * buyW[i];
    const qty = notional / price;

    quotes.push({
      symbol,
      side: "buy",
      type: "limit",
      price,
      qty,
      postOnly: true,
      clientOrderId: `mm-b-${i}`
    });
  }

  // Sell levels
  for (let i = 0; i < sellN; i++) {
    const base = skewedMid * (1 + cfg.spreadPct / 2 + i * cfg.stepPct);
    const jitter = cfg.jitterPct > 0 ? (1 + randBetween(-cfg.jitterPct, cfg.jitterPct)) : 1;
    const price = base * jitter;

    const qty = cfg.budgetBaseToken * sellW[i];

    quotes.push({
      symbol,
      side: "sell",
      type: "limit",
      price,
      qty,
      postOnly: true,
      clientOrderId: `mm-s-${i}`
    });
  }

  return quotes;
}