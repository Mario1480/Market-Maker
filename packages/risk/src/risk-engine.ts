import type { Balance, MidPrice, RiskConfig } from "@mm/core";

export type RiskDecision =
  | { ok: true }
  | { ok: false; action: "PAUSE" | "STOP" | "ERROR"; reason: string };

export interface RiskContext {
  balances: Balance[];
  mid: MidPrice;
  deviationPct?: number;     // master/slave later
  openOrdersCount: number;
  dailyPnl?: number;         // optional for now
}

export class RiskEngine {
  constructor(private readonly cfg: RiskConfig) {}

  evaluate(ctx: RiskContext): RiskDecision {
    const usdt = ctx.balances.find((b) => b.asset.toUpperCase() === "USDT")?.free ?? 0;

    if (usdt < this.cfg.minUsdt) {
      return { ok: false, action: "STOP", reason: `USDT below minimum: ${usdt} < ${this.cfg.minUsdt}` };
    }

    if (ctx.openOrdersCount > this.cfg.maxOpenOrders) {
      return { ok: false, action: "PAUSE", reason: `Too many open orders: ${ctx.openOrdersCount}` };
    }

    if (typeof ctx.deviationPct === "number" && ctx.deviationPct > this.cfg.maxDeviationPct) {
      return { ok: false, action: "PAUSE", reason: `Price deviation too high: ${ctx.deviationPct}%` };
    }

    if (typeof ctx.dailyPnl === "number" && ctx.dailyPnl < -Math.abs(this.cfg.maxDailyLoss)) {
      return { ok: false, action: "STOP", reason: `Daily loss limit reached: ${ctx.dailyPnl}` };
    }

    // Stale data guard (2s)
    if (Date.now() - ctx.mid.ts > 2000) {
      return { ok: false, action: "PAUSE", reason: "Stale market data" };
    }

    return { ok: true };
  }
}