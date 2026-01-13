import type { Exchange } from "@mm/exchange";
import type { MarketMakingConfig, RiskConfig, VolumeConfig, Balance } from "@mm/core";
import { splitSymbol } from "@mm/exchange";
import { SlavePriceSource } from "@mm/pricing";
import { buildMmQuotes, VolumeScheduler } from "@mm/strategy";
import { RiskEngine } from "@mm/risk";
import { BotStateMachine } from "./state-machine.js";
import { OrderManager } from "./order-manager.js";
import { inventoryRatio } from "./inventory.js";
import { log } from "./logger.js";
import { loadBotAndConfigs, updateBotFlags, writeAlert, writeRuntime } from "./db.js";
import { alert } from "./alerts.js";

function normalizeAsset(a: string): string {
  return a.toUpperCase().split("-")[0];
}

function findFree(balances: Balance[], asset: string): number {
  const target = normalizeAsset(asset);
  const direct = balances.find((b) => normalizeAsset(b.asset) === target);
  return direct?.free ?? 0;
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
  const debug = process.env.RUNNER_DEBUG === "1";

  let mm = params.mm;
  let vol = params.vol;
  let risk = params.risk;
  let botName = params.botId;

  const priceSource = new SlavePriceSource(exchange);
  let volSched = new VolumeScheduler(vol);
  let riskEngine = new RiskEngine(risk);
  const orderMgr = new OrderManager({ priceEpsPct: 0.0005, qtyEpsPct: 0.02 });

  const volState = { dayKey: "init", tradedNotional: 0, lastActionMs: 0, dailyAlertSent: false };
  const { base } = splitSymbol(symbol);
  const mmRunId = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

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
    botName = botRow.name || botName;
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
      // Keep the runner alive and wait until it is started again.
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
        if (b.status === "PAUSED") {
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
          break;
        }
      }
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
      volSched = new VolumeScheduler(vol);
      riskEngine = new RiskEngine(risk);
    }

    try {
      const mid = await priceSource.getMid(symbol);
      const balances = await exchange.getBalances();
      const open = await exchange.getOpenOrders(symbol);
      const midValid =
        Number.isFinite(mid.mid) &&
        mid.mid > 0 &&
        Number.isFinite(mid.bid) &&
        (mid.bid as number) > 0 &&
        Number.isFinite(mid.ask) &&
        (mid.ask as number) > 0;
      if (debug) {
        log.info(
          {
            mid: mid.mid,
            bid: mid.bid ?? null,
            ask: mid.ask ?? null,
            balancesCount: balances.length,
            openOrders: open.length
          },
          "tick snapshot"
        );
      }
      const openMm = open.filter((o) => {
        const cid = o.clientOrderId ?? "";
        return cid.startsWith("mmb") || cid.startsWith("mms");
      });
      const openOther = open.filter((o) => {
        const cid = o.clientOrderId ?? "";
        return !(cid.startsWith("mmb") || cid.startsWith("mms"));
      });
      log.debug({ openTotal: open.length, openMm: openMm.length, openOther: openOther.length }, "open orders split");

      const openVol = openOther.filter((o) => (o.clientOrderId ?? "").startsWith("vol"));

      let lastVolClientOrderId: string | null = null;
      let lastVolTs = -1;
      for (const o of openVol) {
        const cid = o.clientOrderId ?? "";
        const m = cid.match(/^vol(\d+)/);
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

      if (!botRow.mmEnabled && openMm.length) {
        for (const o of openMm) {
          try {
            await exchange.cancelOrder(symbol, o.id);
          } catch {}
        }
      }

      if (!botRow.volEnabled && openVol.length) {
        for (const o of openVol) {
          try {
            await exchange.cancelOrder(symbol, o.id);
          } catch {}
        }
      }

      if (!midValid) {
        log.warn({ mid }, "market data invalid (bid/ask/mid)");
        await writeRuntime({
          botId,
          status: "RUNNING",
          reason: "Market data unavailable",
          mid: Number.isFinite(mid.mid) ? mid.mid : null,
          bid: Number.isFinite(mid.bid) ? mid.bid : null,
          ask: Number.isFinite(mid.ask) ? mid.ask : null,
          openOrders: open.length,
          openOrdersMm: openMm.length,
          openOrdersVol: openVol.length,
          lastVolClientOrderId,
          freeUsdt: findFree(balances, "USDT"),
          freeBase: findFree(balances, base),
          tradedNotionalToday: volState.tradedNotional
        });
        const elapsed = Date.now() - t0;
        const sleep = Math.max(0, tickMs - elapsed);
        await new Promise((r) => setTimeout(r, sleep));
        continue;
      }

      // Volume order TTL cleanup (cancel stale vol-* orders)
      const VOL_TTL_MS = 90_000; // 90 seconds
      const nowTs = Date.now();

      for (const o of openOther) {
        const cid = o.clientOrderId ?? "";
        if (!cid.startsWith("vol")) continue;

        const m = cid.match(/^vol(\d+)/);
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
      const desiredQuotes = botRow.mmEnabled
        ? buildMmQuotes({
            symbol,
            mid: mid.mid,
            cfg: mm,
            inventoryRatio: invRatio,
            includeJitter: true
          })
        : [];
      const desiredWithIds = desiredQuotes.map((q) => {
        const cid = q.clientOrderId ?? "";
        const m = cid.match(/^(mmb|mms)(\d+)/);
        if (!m) return q;
        return { ...q, clientOrderId: `${m[1]}${m[2]}${mmRunId}` };
      });
      const desiredFiltered = desiredWithIds.filter((q) => {
        if (q.type !== "limit" || !q.price) return true;
        return q.price * q.qty >= 5;
      });

      const decision = riskEngine.evaluate({
        balances,
        mid,
        openOrdersCount: open.length
      });

      const freeUsdt = findFree(balances, "USDT");
      const freeBase = findFree(balances, base);
      if (debug) {
        const sample = balances.slice(0, 8).map((b) => ({ asset: b.asset, free: b.free, locked: b.locked }));
        log.info({ freeUsdt, freeBase, base, sample }, "balances snapshot");
      }

      if (!decision.ok) {
        log.warn({ decision }, "risk triggered");
        await exchange.cancelAll(symbol);

        const nextStatus = "RUNNING";
        sm.set(nextStatus as any, `Risk triggered: ${decision.reason}`);

        const shouldDisable = botRow.mmEnabled || botRow.volEnabled;
        if (shouldDisable) {
          await updateBotFlags({ botId, mmEnabled: false, volEnabled: false });
        }

        await writeRuntime({
          botId,
          status: sm.getStatus(),
          reason: `Risk triggered: ${decision.reason}. Strategies disabled.`,
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

        if (shouldDisable) {
          await writeAlert({
            botId,
            level: "warn",
            title: "Risk triggered",
            message: `reason=${decision.reason} symbol=${symbol} mid=${mid.mid} openOrders=${open.length}`
          });

          await alert(
            "warn",
            `[RISK] ${botName} (${symbol})`,
            `reason=${decision.reason}\nmid=${mid.mid}\nopenOrders=${open.length}`
          );
        }

        const elapsed = Date.now() - t0;
        const sleep = Math.max(0, tickMs - elapsed);
        await new Promise((r) => setTimeout(r, sleep));
        continue;
      }

      // MM sync (only manage mm-* orders so we don't cancel volume orders)
      const { cancel, place } = orderMgr.diff(desiredFiltered, openMm);

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
      if (botRow.volEnabled) {
        const maxOpen = risk.maxOpenOrders ?? 0;
        if (maxOpen > 0 && open.length >= maxOpen) {
          log.info({ openOrders: open.length, maxOpen }, "volume skipped: open order cap reached");
        } else {
        const volOrder = volSched.maybeCreateTrade(symbol, mid.mid, volState);
        if (volOrder) {
          try {
            await exchange.placeOrder(volOrder);
            log.info({ volOrder }, "volume trade submitted");
          } catch (e) {
            log.warn({ err: String(e), volOrder }, "volume trade failed");
          }
        }
        }
      }

      if (
        botRow.volEnabled &&
        !volState.dailyAlertSent &&
        volState.tradedNotional >= vol.dailyNotionalUsdt
      ) {
        volState.dailyAlertSent = true;
        await writeAlert({
          botId,
          level: "info",
          title: "Daily volume target reached",
          message: `symbol=${symbol} notional=${volState.tradedNotional}`
        });
        await alert(
          "info",
          `[VOLUME] ${botName} (${symbol})`,
          `dailyTargetReached notional=${volState.tradedNotional}`
        );
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
      const errStr = String(e);
      const isTransient =
        errStr.includes("fetch failed") ||
        errStr.includes("ECONNRESET") ||
        errStr.includes("ENOTFOUND") ||
        errStr.includes("ETIMEDOUT") ||
        errStr.includes("ECONNREFUSED");

      if (isTransient) {
        log.warn({ err: errStr }, "transient loop error");
        await writeRuntime({
          botId,
          status: "RUNNING",
          reason: `Network error: ${errStr}`,
          openOrders: null,
          openOrdersMm: null,
          openOrdersVol: null,
          lastVolClientOrderId: null
        });
        const elapsed = Date.now() - t0;
        const sleep = Math.max(0, tickMs - elapsed);
        await new Promise((r) => setTimeout(r, sleep));
        continue;
      }

      log.error({ err: errStr }, "loop error");
      try {
        await exchange.cancelAll(symbol);
      } catch {}
      sm.set("ERROR", errStr);
      await writeRuntime({
        botId,
        status: "ERROR",
        reason: sm.getReason(),
        openOrders: 0,
        openOrdersMm: 0,
        openOrdersVol: 0,
        lastVolClientOrderId: null
      });

      await writeAlert({
        botId,
        level: "error",
        title: "Runner error",
        message: `symbol=${symbol} err=${errStr}`
      });

      await alert(
        "error",
        `[ERROR] ${botName} (${symbol})`,
        `err=${errStr}`
      );
      break;
    }
  }

  log.info({ status: sm.getStatus(), reason: sm.getReason() }, "runner stopped");
}
