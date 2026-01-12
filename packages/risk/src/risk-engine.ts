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

    if (this.cfg.minUsdt > 0 && usdt < this.cfg.minUsdt) {
      return { ok: false, action: "STOP", reason: `USDT below minimum: ${usdt} < ${this.cfg.minUsdt}` };
    }

    if (this.cfg.maxOpenOrders > 0 && ctx.openOrdersCount > this.cfg.maxOpenOrders) {
      return { ok: false, action: "PAUSE", reason: `Too many open orders: ${ctx.openOrdersCount}` };
    }

    if (
      this.cfg.maxDeviationPct > 0 &&
      typeof ctx.deviationPct === "number" &&
      ctx.deviationPct > this.cfg.maxDeviationPct
    ) {
      return { ok: false, action: "PAUSE", reason: `Price deviation too high: ${ctx.deviationPct}%` };
    }

    if (
      this.cfg.maxDailyLoss > 0 &&
      typeof ctx.dailyPnl === "number" &&
      ctx.dailyPnl < -Math.abs(this.cfg.maxDailyLoss)
    ) {
      return { ok: false, action: "STOP", reason: `Daily loss limit reached: ${ctx.dailyPnl}` };
    }

    // Stale data guard (10s)
    if (Date.now() - ctx.mid.ts > 10_000) {
      return { ok: false, action: "PAUSE", reason: "Stale market data" };
    }

    return { ok: true };
  }
}
