import type { Quote, VolumeConfig } from "@mm/core";
import { hhmmNow, isWithinWindow, randBetween } from "@mm/core";

export interface VolumeState {
  dayKey: string;          // YYYY-MM-DD
  tradedNotional: number;  // USDT
  lastActionMs: number;
}

export class VolumeScheduler {
  constructor(private readonly cfg: VolumeConfig) {}

  resetIfNewDay(state: VolumeState): void {
    const dayKey = new Date().toISOString().slice(0, 10);
    if (state.dayKey !== dayKey) {
      state.dayKey = dayKey;
      state.tradedNotional = 0;
    }
  }

  maybeCreateTrade(symbol: string, mid: number, state: VolumeState): Quote | null {
    this.resetIfNewDay(state);

    const now = Date.now();
    const nowHHMM = hhmmNow();
    if (!isWithinWindow(nowHHMM, this.cfg.activeFrom, this.cfg.activeTo)) return null;

    const remaining = this.cfg.dailyNotionalUsdt - state.tradedNotional;
    if (remaining <= 0) return null;

    // probabilistic pacing: don’t fire every tick
    const cooldown = 2_000; // minimum spacing between attempts
    if (now - state.lastActionMs < cooldown) return null;

    const p = 0.12; // baseline chance per attempt (tune later)
    if (Math.random() > p) return null;

    const notional = Math.min(remaining, randBetween(this.cfg.minTradeUsdt, this.cfg.maxTradeUsdt));
    const side = Math.random() < 0.5 ? "buy" : "sell";

    state.lastActionMs = now;
    state.tradedNotional += notional;

    // MVP: place small MARKET order (simple), later prefer passive fills.
    return {
      symbol,
      side,
      type: "market",
      qty: notional / mid,
      clientOrderId: `vol-${now}`
    };
  }
}