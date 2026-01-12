import type { Exchange } from "@mm/exchange";
import type { MarketMakingConfig, RiskConfig, VolumeConfig, Balance } from "@mm/core";
import { splitSymbol } from "@mm/exchange";
import { SlavePriceSource } from "@mm/pricing";
import { MarketMakingStrategy, VolumeScheduler } from "@mm/strategy";
import { RiskEngine } from "@mm/risk";
import { BotStateMachine } from "./state-machine.js";
import { OrderManager } from "./order-manager.js";
import { inventoryRatio } from "./inventory.js";
import { log } from "./logger.js";
import { loadBotAndConfigs, writeRuntime } from "./db.js";

function findFree(balances: Balance[], asset: string): number {
  return balances.find((b) => b.asset.toUpperCase() === asset.toUpperCase())?.free ?? 0;
}

export async function runLoop(params: {
  botId: string;
  symbol: string;
  exchange: Exchange;
  mm: MarketMakingConfig;
  vol: VolumeConfig;
  risk: RiskConfig;
  tickMs: number;
  sm: BotStateMachine;
}): Promise<void> {
  const { botId, symbol, exchange, tickMs, sm } = params;

  let mm = params.mm;
  let vol = params.vol;
  let risk = params.risk;

  const priceSource = new SlavePriceSource(exchange);
  let mmStrat = new MarketMakingStrategy(mm);
  let volSched = new VolumeScheduler(vol);
  let riskEngine = new RiskEngine(risk);
  const orderMgr = new OrderManager({ priceEpsPct: 0.0005, qtyEpsPct: 0.02 });

  const volState = { dayKey: "init", tradedNotional: 0, lastActionMs: 0 };
  const { base } = splitSymbol(symbol);

  const reloadEveryMs = 5_000;
  let lastReload = 0;

  sm.set("RUNNING");
  await writeRuntime({
    botId,
    status: "RUNNING",
    reason: null,
    openOrders: 0,
    openOrdersMm: 0,
    openOrdersVol: 0,
    lastVolClientOrderId: null
  });

  while (true) {
    // Bot status from DB (start/stop/pause)
    const botRow = (await loadBotAndConfigs(botId)).bot;
    if (botRow.status === "STOPPED") {
      await exchange.cancelAll(symbol);
      sm.set("STOPPED", "Stopped from UI/API");
      await writeRuntime({
        botId,
        status: "STOPPED",
        reason: sm.getReason(),
        openOrders: 0,
        openOrdersMm: 0,
        openOrdersVol: 0,
        lastVolClientOrderId: null
      });
      break;
    }
    if (botRow.status === "PAUSED") {
      await exchange.cancelAll(symbol);
      sm.set("PAUSED", "Paused from UI/API");
      await writeRuntime({
        botId,
        status: "PAUSED",
        reason: sm.getReason(),
        openOrders: 0,
        openOrdersMm: 0,
        openOrdersVol: 0,
        lastVolClientOrderId: null
      });
      // wait until RUNNING
      while (true) {
        await new Promise((r) => setTimeout(r, 1500));
        const b = (await loadBotAndConfigs(botId)).bot;
        if (b.status === "RUNNING") {
          sm.set("RUNNING", "");
          await writeRuntime({
            botId,
            status: "RUNNING",
            reason: null,
            openOrders: 0,
            openOrdersMm: 0,
            openOrdersVol: 0,
            lastVolClientOrderId: null
          });
          break;
        }
        if (b.status === "STOPPED") {
          sm.set("STOPPED", "Stopped while paused");
          await writeRuntime({
            botId,
            status: "STOPPED",
            reason: sm.getReason(),
            openOrders: 0,
            openOrdersMm: 0,
            openOrdersVol: 0,
            lastVolClientOrderId: null
          });
          return;
        }
      }
    }

    const t0 = Date.now();

    // reload configs periodically (hot apply)
    if (t0 - lastReload > reloadEveryMs) {
      lastReload = t0;
      const loaded = await loadBotAndConfigs(botId);
      mm = loaded.mm;
      vol = loaded.vol;
      risk = loaded.risk;
      mmStrat = new MarketMakingStrategy(mm);
      volSched = new VolumeScheduler(vol);
      riskEngine = new RiskEngine(risk);
    }

    try {
      const mid = await priceSource.getMid(symbol);
      const balances = await exchange.getBalances();
      const open = await exchange.getOpenOrders(symbol);
      const openMm = open.filter((o) => (o.clientOrderId ?? "").startsWith("mm-"));
      const openOther = open.filter((o) => !(o.clientOrderId ?? "").startsWith("mm-"));
      log.debug({ openTotal: open.length, openMm: openMm.length, openOther: openOther.length }, "open orders split");

      const openVol = openOther.filter((o) => (o.clientOrderId ?? "").startsWith("vol-"));

      let lastVolClientOrderId: string | null = null;
      let lastVolTs = -1;
      for (const o of openVol) {
        const cid = o.clientOrderId ?? "";
        const m = cid.match(/^vol-(\d+)/);
        if (!m) continue;
        const ts = Number(m[1]);
        if (!Number.isFinite(ts)) continue;
        if (ts > lastVolTs) {
          lastVolTs = ts;
          lastVolClientOrderId = cid;
        }
      }

      log.debug(
        { openTotal: open.length, openMm: openMm.length, openVol: openVol.length, lastVolClientOrderId },
        "open orders breakdown"
      );

      // Volume order TTL cleanup (cancel stale vol-* orders)
      const VOL_TTL_MS = 90_000; // 90 seconds
      const nowTs = Date.now();

      for (const o of openOther) {
        const cid = o.clientOrderId ?? "";
        if (!cid.startsWith("vol-")) continue;

        const m = cid.match(/^vol-(\d+)/);
        if (!m) continue;

        const ts = Number(m[1]);
        if (!Number.isFinite(ts)) continue;

        if (nowTs - ts > VOL_TTL_MS) {
          try {
            await exchange.cancelOrder(symbol, o.id);
            log.info({ orderId: o.id, clientOrderId: cid }, "stale volume order cancelled");
          } catch (e) {
            log.warn({ err: String(e), orderId: o.id }, "failed to cancel stale volume order");
          }
        }
      }

      const invRatio = inventoryRatio(balances, base, mm.budgetBaseToken);
      const desiredQuotes = mmStrat.build(symbol, mid.mid, invRatio);

      const decision = riskEngine.evaluate({
        balances,
        mid,
        openOrdersCount: open.length
      });

      const freeUsdt = findFree(balances, "USDT");
      const freeBase = findFree(balances, base);

      if (!decision.ok) {
        log.warn({ decision }, "risk triggered");
        await exchange.cancelAll(symbol);

        const nextStatus = decision.action === "STOP" ? "STOPPED" : decision.action === "PAUSE" ? "PAUSED" : "ERROR";
        sm.set(nextStatus as any, decision.reason);

        await writeRuntime({
          botId,
          status: sm.getStatus(),
          reason: sm.getReason(),
          mid: mid.mid,
          bid: mid.bid ?? null,
          ask: mid.ask ?? null,
          openOrders: open.length,
          openOrdersMm: openMm.length,
          openOrdersVol: openVol.length,
          lastVolClientOrderId,
          freeUsdt,
          freeBase,
          tradedNotionalToday: volState.tradedNotional
        });

        break;
      }

      // MM sync (only manage mm-* orders so we don't cancel volume orders)
      const { cancel, place } = orderMgr.diff(desiredQuotes, openMm);

      for (const o of cancel) {
        try {
          await exchange.cancelOrder(symbol, o.id);
        } catch {}
      }

      for (const q of place) {
        try {
          await exchange.placeOrder(q);
        } catch (e) {
          log.warn({ err: String(e), q }, "place failed");
        }
      }

      // Volume bot (PASSIVE-first: post-only limit near mid; MIXED may use rare market)
      const volOrder = volSched.maybeCreateTrade(symbol, mid.mid, volState);
      if (volOrder) {
        try {
          await exchange.placeOrder(volOrder);
          log.info({ volOrder }, "volume trade submitted");
        } catch (e) {
          log.warn({ err: String(e), volOrder }, "volume trade failed");
        }
      }

      await writeRuntime({
        botId,
        status: "RUNNING",
        reason: null,
        mid: mid.mid,
        bid: mid.bid ?? null,
        ask: mid.ask ?? null,
        openOrders: open.length,
        openOrdersMm: openMm.length,
        openOrdersVol: openVol.length,
        lastVolClientOrderId,
        freeUsdt,
        freeBase,
        tradedNotionalToday: volState.tradedNotional
      });

      const elapsed = Date.now() - t0;
      const sleep = Math.max(0, tickMs - elapsed);
      await new Promise((r) => setTimeout(r, sleep));
    } catch (e) {
      log.error({ err: String(e) }, "loop error");
      try {
        await exchange.cancelAll(symbol);
      } catch {}
      sm.set("ERROR", String(e));
      await writeRuntime({
        botId,
        status: "ERROR",
        reason: sm.getReason(),
        openOrders: 0,
        openOrdersMm: 0,
        openOrdersVol: 0,
        lastVolClientOrderId: null
      });
      break;
    }
  }

  log.info({ status: sm.getStatus(), reason: sm.getReason() }, "runner stopped");
}