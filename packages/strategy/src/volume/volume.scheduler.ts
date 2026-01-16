import type { Quote, VolumeConfig } from "@mm/core";
import { clamp, hhmmNow, isWithinWindow, randBetween } from "@mm/core";

export interface VolumeState {
  dayKey: string;          // YYYY-MM-DD
  tradedNotional: number;  // USDT
  lastActionMs: number;
  pendingClientOrderId?: string;
  lastSide?: "buy" | "sell";
  sideStreak?: number;
  buyCount?: number;
  sellCount?: number;
  dailyAlertSent?: boolean;
}

function passivePrice(mid: number, side: "buy" | "sell"): number {
  // place slightly away from mid so it's maker more often
  const baseBps = randBetween(3, 12); // 0.03% .. 0.12%
  const jitterBps = randBetween(-2, 2);
  const bps = baseBps + jitterBps;
  const mul = 1 + (side === "buy" ? -bps : bps) / 10_000;
  return mid * mul;
}

export class VolumeScheduler {
  constructor(private readonly cfg: VolumeConfig) {}

  resetIfNewDay(state: VolumeState): void {
    const dayKey = new Date().toISOString().slice(0, 10);
    if (state.dayKey !== dayKey) {
      state.dayKey = dayKey;
      state.tradedNotional = 0;
      state.dailyAlertSent = false;
      state.buyCount = 0;
      state.sellCount = 0;
    }
  }

  maybeCreateTrade(symbol: string, mid: number, state: VolumeState): Quote | null {
    this.resetIfNewDay(state);

    const now = Date.now();
    const nowHHMM = hhmmNow();
    if (!isWithinWindow(nowHHMM, this.cfg.activeFrom, this.cfg.activeTo)) return null;

    const remaining = this.cfg.dailyNotionalUsdt - state.tradedNotional;
    if (remaining <= 0) return null;

    const isActiveMode = this.cfg.mode === "ACTIVE";
    if (!isActiveMode) {
      // avoid spamming while a previous volume order is likely still open
      if (state.pendingClientOrderId) {
        const m = state.pendingClientOrderId.match(/^vol(\d+)/);
        if (m) {
          const ts = Number(m[1]);
          if (Number.isFinite(ts) && now - ts < 60_000) return null;
        }
      }
    }

    // probabilistic pacing: don’t fire every tick
    const cooldown = 2_000; // minimum spacing between attempts
    if (now - state.lastActionMs < cooldown) return null;

    let deficit = remaining;
    if (isActiveMode) {
      const dayStartMs = Date.parse(`${state.dayKey}T00:00:00.000Z`);
      const elapsedMs = Number.isFinite(dayStartMs) ? Math.max(0, now - dayStartMs) : 0;
      const progress = clamp(elapsedMs / (24 * 60 * 60 * 1000), 0, 1);
      const targetSoFar = this.cfg.dailyNotionalUsdt * progress;
      deficit = targetSoFar - state.tradedNotional;
      if (deficit <= 0) return null;
    }

    if (!isActiveMode) {
      // Scale probability lightly with remaining so we don't underfill the daily target.
      const fillPressure = clamp(remaining / Math.max(1, this.cfg.dailyNotionalUsdt), 0, 1);
      const p = 0.06 + 0.18 * fillPressure; // 6%..24%
      if (Math.random() > p) return null;
    }

    const targetNotional = isActiveMode
      ? clamp(deficit, this.cfg.minTradeUsdt, this.cfg.maxTradeUsdt)
      : randBetween(this.cfg.minTradeUsdt, this.cfg.maxTradeUsdt);
    const notional = Math.min(remaining, targetNotional);
    const side = Math.random() < 0.5 ? "buy" : "sell";

    const clientOrderId = `vol${now}`;

    // PASSIVE-first: post-only limit close to mid
    const price = passivePrice(mid, side);
    const qty = notional / price;

    // Optional taker fallback in MIXED mode (rare).
    const takerChance = this.cfg.mode === "MIXED" ? 0.10 : 0;
    const useMarket = takerChance > 0 && Math.random() < takerChance;

    state.lastActionMs = now;
    state.pendingClientOrderId = useMarket ? undefined : clientOrderId;

    if (useMarket) {
      return {
        symbol,
        side,
        type: "market",
        qty: notional / mid,
        quoteQty: notional,
        clientOrderId
      };
    }

    return {
      symbol,
      side,
      type: "limit",
      price,
      qty,
      postOnly: true,
      clientOrderId
    };
  }
}
