import type { Exchange } from "@mm/exchange";
import type { MarketMakingConfig, RiskConfig, VolumeConfig, NotificationConfig, Balance } from "@mm/core";
import { splitSymbol } from "@mm/exchange";
import { SlavePriceSource } from "@mm/pricing";
import { buildMmQuotes, VolumeScheduler } from "@mm/strategy";
import type { VolumeState as VolState } from "@mm/strategy";
import { RiskEngine } from "@mm/risk";
import { BotStateMachine } from "./state-machine.js";
import { OrderManager } from "./order-manager.js";
import { inventoryRatio } from "./inventory.js";
import { log } from "./logger.js";
import { loadBotAndConfigs, updateBotFlags, writeAlert, writeRuntime, upsertOrderMap } from "./db.js";
import { alert } from "./alerts.js";
import { syncVolumeFills } from "./fills.js";

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
  notificationConfig: NotificationConfig;
  tickMs: number;
  sm: BotStateMachine;
}): Promise<void> {
  const { botId, symbol, exchange, tickMs, sm } = params;
  const debug = process.env.RUNNER_DEBUG === "1";

  let mm = params.mm;
  let vol = params.vol;
  let risk = params.risk;
  let notificationConfig = params.notificationConfig;
  let botName = params.botId;

  const priceSource = new SlavePriceSource(exchange);
  let volSched = new VolumeScheduler(vol);
  let riskEngine = new RiskEngine(risk);
  const priceEpsPct = Number(process.env.MM_PRICE_EPS_PCT || "0.005");
  const qtyEpsPct = Number(process.env.MM_QTY_EPS_PCT || "0.02");
  const minRepriceMs = Number(process.env.MM_REPRICE_MS || "10000");
  const minRepricePct = Number(process.env.MM_REPRICE_PCT || "0.01");
  const invAlpha = Number(process.env.MM_INV_ALPHA || "0.1");
  const volCooldownMs = Number(process.env.MM_VOL_COOLDOWN_MS || "15000");
  const volActiveTtlMs = Number(process.env.VOL_ACTIVE_TTL_MS || "8000");
  const volMmSafetyMult = Number(process.env.VOL_MM_SAFETY_MULT || "1.5");
  const volLastBandPct = Number(process.env.VOL_LAST_BAND_PCT || "0.0001");
  const volInsideSpreadPct = Number(process.env.VOL_INSIDE_SPREAD_PCT || "0.00005");
  const orderMgr = new OrderManager({ priceEpsPct, qtyEpsPct });
  let lastRepriceAt = 0;
  let lastRepriceMid = 0;
  let smoothedInvRatio: number | null = null;
  let lastVolTradeAt = 0;
  let fundsAlertSent = false;
  let fundsWarnSent = false;
  const volSideWindow: ("buy" | "sell")[] = [];
  const volSideWindowMax = 20;

  const volState = { dayKey: "init", tradedNotional: 0, lastActionMs: 0, dailyAlertSent: false } as VolState;
  const { base } = splitSymbol(symbol);
  const mmRunId = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

  const reloadEveryMs = 5_000;
  let lastReload = 0;
  const fillsEveryMs = 3_000;
  let lastFillSync = 0;

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
          fundsAlertSent = false;
          fundsWarnSent = false;
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
          fundsAlertSent = false;
          fundsWarnSent = false;
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
      notificationConfig = loaded.notificationConfig;
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

      if (t0 - lastFillSync > fillsEveryMs) {
        lastFillSync = t0;
        try {
          const fillRes = await syncVolumeFills({ botId, symbol, exchange });
          volState.tradedNotional = fillRes.tradedNotionalToday;
        } catch (e) {
          log.warn({ err: String(e) }, "fills sync failed");
        }
      }

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
      const VOL_TTL_MS = (vol.mode === "ACTIVE" || vol.mode === "MIXED")
        ? volActiveTtlMs
        : 90_000; // shorter in ACTIVE/MIXED
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
      if (smoothedInvRatio === null || !Number.isFinite(smoothedInvRatio)) {
        smoothedInvRatio = invRatio;
      } else {
        smoothedInvRatio = smoothedInvRatio + (invRatio - smoothedInvRatio) * invAlpha;
      }
      const mmMid = Number.isFinite(mid.last) && (mid.last as number) > 0 ? (mid.last as number) : mid.mid;
      const desiredQuotes = botRow.mmEnabled
        ? buildMmQuotes({
            symbol,
            mid: mmMid,
            cfg: mm,
            inventoryRatio: smoothedInvRatio,
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

      const mmFundsOk = !botRow.mmEnabled || (
        freeUsdt >= mm.budgetQuoteUsdt &&
        freeBase >= mm.budgetBaseToken
      );
      const volFundsOk = !botRow.volEnabled || (
        freeUsdt >= vol.minTradeUsdt ||
        freeBase * mid.mid >= vol.minTradeUsdt
      );
      const warnPct = Math.max(0, notificationConfig.fundsWarnPct ?? 0);
      const warnMult = 1 + warnPct;
      const mmWarn = notificationConfig.fundsWarnEnabled && botRow.mmEnabled && (
        freeUsdt < mm.budgetQuoteUsdt * warnMult ||
        freeBase < mm.budgetBaseToken * warnMult
      );
      const volWarn = notificationConfig.fundsWarnEnabled && botRow.volEnabled && (
        freeUsdt < vol.minTradeUsdt * warnMult &&
        freeBase * mid.mid < vol.minTradeUsdt * warnMult
      );

      if ((mmWarn || volWarn) && !fundsWarnSent && mmFundsOk && volFundsOk) {
        const warns: string[] = [];
        if (mmWarn) {
          warns.push(`MM reserve low (freeUsdt=${freeUsdt}, freeBase=${freeBase})`);
        }
        if (volWarn) {
          warns.push(`Volume reserve low (freeUsdt=${freeUsdt}, freeBase=${freeBase})`);
        }
        const warnMsg = `Funds nearing threshold: ${warns.join("; ")}`;
        fundsWarnSent = true;
        await writeAlert({
          botId,
          level: "warn",
          title: "Funds low (10% reserve)",
          message: `symbol=${symbol} ${warnMsg}`
        });
        await alert(
          "warn",
          `[FUNDS] ${botName} (${symbol})`,
          warnMsg
        );
      }

      if (!mmFundsOk || !volFundsOk) {
        const reasons: string[] = [];
        if (!mmFundsOk && botRow.mmEnabled) {
          reasons.push(`MM funds low (freeUsdt=${freeUsdt}, freeBase=${freeBase})`);
        }
        if (!volFundsOk && botRow.volEnabled) {
          reasons.push(`Volume funds low (freeUsdt=${freeUsdt}, freeBase=${freeBase})`);
        }
        const reason = `Insufficient funds: ${reasons.join("; ")}`;
        log.warn({ freeUsdt, freeBase, reason }, "insufficient funds");

        try {
          await exchange.cancelAll(symbol);
        } catch {}

        await updateBotFlags({ botId, status: "PAUSED" });
        sm.set("PAUSED", reason);

        await writeRuntime({
          botId,
          status: "PAUSED",
          reason,
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

        if (!fundsAlertSent) {
          fundsAlertSent = true;
          await writeAlert({
            botId,
            level: "warn",
            title: "Insufficient funds",
            message: `symbol=${symbol} ${reason}`
          });
          await alert(
            "warn",
            `[FUNDS] ${botName} (${symbol})`,
            reason
          );
        }

        const elapsed = Date.now() - t0;
        const sleep = Math.max(0, tickMs - elapsed);
        await new Promise((r) => setTimeout(r, sleep));
        continue;
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
      const allowReprice =
        openMm.length === 0 ||
        (t0 - lastRepriceAt >= minRepriceMs &&
          t0 - lastVolTradeAt >= volCooldownMs) ||
        (lastRepriceMid > 0 &&
          Math.abs(mid.mid - lastRepriceMid) / lastRepriceMid >= minRepricePct &&
          t0 - lastVolTradeAt >= volCooldownMs);

      const { cancel, place } = allowReprice ? orderMgr.diff(desiredFiltered, openMm) : { cancel: [], place: [] };
      const maxOpen = risk.maxOpenOrders ?? 0;
      const projectedOpen = maxOpen > 0
        ? Math.max(0, open.length - cancel.length) + place.length
        : open.length;

      for (const o of cancel) {
        try {
          await exchange.cancelOrder(symbol, o.id);
        } catch {}
      }

      if (allowReprice && cancel.length === 0) {
        for (const q of place) {
          try {
            await exchange.placeOrder(q);
          } catch (e) {
            log.warn({ err: String(e), q }, "place failed");
          }
        }
      } else if (cancel.length > 0) {
        log.debug({ cancel: cancel.length, place: place.length }, "skip place: cancel pending");
      } else if (!allowReprice) {
        log.debug({ minRepriceMs, minRepricePct, volCooldownMs }, "skip place: reprice cooldown");
      }
      if (allowReprice && (cancel.length > 0 || place.length > 0)) {
        lastRepriceAt = t0;
        lastRepriceMid = mid.mid;
      }


      // Volume bot (PASSIVE-first: post-only limit near mid; MIXED may use rare market)
      if (botRow.volEnabled) {
        const activeVol = vol.mode === "ACTIVE";
        const activeLikeVol = vol.mode === "ACTIVE" || vol.mode === "MIXED";
        if (maxOpen > 0 && projectedOpen >= maxOpen) {
          log.info(
            { openOrders: open.length, projectedOpen, maxOpen },
            "volume skipped: open order cap reached"
          );
        } else if (activeLikeVol && openVol.length > 0) {
          log.info({ openVol: openVol.length }, "volume skipped: active order pending");
        } else {
          const volOrder = volSched.maybeCreateTrade(symbol, mid.mid, volState);
          if (volOrder) {
            let skipVolume = false;
            const safeOrder = { ...volOrder };
            if (activeLikeVol) {
              const bid = mid.bid ?? mid.mid;
              const ask = mid.ask ?? mid.mid;
              const ref = Number.isFinite(mid.last) && (mid.last as number) > 0 ? (mid.last as number) : mid.mid;
              const notional = safeOrder.quoteQty ?? safeOrder.qty * mid.mid;
              const canSellBase = freeBase * bid >= vol.minTradeUsdt;
              const canBuyUsdt = freeUsdt >= vol.minTradeUsdt;
              if (!canSellBase && !canBuyUsdt) {
                log.info({ freeUsdt, freeBase }, "volume skipped: insufficient balances");
                skipVolume = true;
              }

              if (!skipVolume) {
              let nextSide = safeOrder.side;
              if (!canSellBase) nextSide = "buy";
              if (!canBuyUsdt) nextSide = "sell";

              const lastSide = volState.lastSide;
              let streak = volState.sideStreak ?? 0;
              const buyCount = volState.buyCount ?? 0;
              const sellCount = volState.sellCount ?? 0;

              if (canBuyUsdt && canSellBase) {
                const winBuy = volSideWindow.filter((s) => s === "buy").length;
                const winSell = volSideWindow.length - winBuy;
                if (Math.abs(winBuy - winSell) >= 2) {
                  nextSide = winBuy > winSell ? "sell" : "buy";
                } else if (buyCount === sellCount && lastSide) {
                  nextSide = lastSide === "buy" ? "sell" : "buy";
                } else {
                  nextSide = buyCount <= sellCount ? "buy" : "sell";
                }
                streak = nextSide === lastSide ? streak + 1 : 1;
              } else if (lastSide && nextSide === lastSide) {
                if (streak >= 5) {
                  nextSide = lastSide === "buy" ? "sell" : "buy";
                }
                streak = nextSide === lastSide ? streak + 1 : 1;
              } else {
                streak = 1;
              }
              volState.lastSide = nextSide;
              volState.sideStreak = streak;
              safeOrder.side = nextSide;
              log.info({ side: nextSide, streak }, "volume active side selection");

              const bandPct = Math.max(0.0001, volLastBandPct) * (0.5 + Math.random() * 0.5);
              let price = nextSide === "buy" ? ref * (1 - bandPct) : ref * (1 + bandPct);
              if (Number.isFinite(bid) && Number.isFinite(ask) && ask > bid) {
                const inside = Math.max(0.00005, volInsideSpreadPct) * volMmSafetyMult;
                const floor = bid * (1 + inside);
                const ceil = ask * (1 - inside);
                if (floor < ceil) {
                  price = Math.min(Math.max(price, floor), ceil);
                }
              }

              if (Number.isFinite(price) && price > 0 && Number.isFinite(notional)) {
                safeOrder.type = "limit";
                safeOrder.postOnly = true;
                safeOrder.price = price;
                safeOrder.qty = notional / price;
                safeOrder.quoteQty = undefined;
              }
              }
            } else if (safeOrder.type === "market" && botRow.mmEnabled) {
              const ref = Number.isFinite(mid.last) && (mid.last as number) > 0 ? (mid.last as number) : mid.mid;
              const halfMin = Math.max(0, volLastBandPct);
              const notional = (safeOrder.quoteQty ?? safeOrder.qty * mid.mid);
              const pct = halfMin > 0 ? halfMin * (0.15 + Math.random() * 0.7) : 0;
              const price = safeOrder.side === "buy"
                ? ref * (1 - pct)
                : ref * (1 + pct);
              if (Number.isFinite(price) && price > 0 && Number.isFinite(notional)) {
                safeOrder.type = "limit";
                safeOrder.postOnly = true;
                safeOrder.price = price;
                safeOrder.qty = notional / price;
                safeOrder.quoteQty = undefined;
              }
            }
            if (!skipVolume && safeOrder.type === "market") {
              if (safeOrder.side === "buy") {
                const quoteQty = Math.min(
                  safeOrder.quoteQty ?? safeOrder.qty * mid.mid,
                  freeUsdt
                );
                if (quoteQty < vol.minTradeUsdt) {
                  log.info({ quoteQty }, "volume skipped: insufficient USDT");
                  skipVolume = true;
                }
                safeOrder.quoteQty = quoteQty;
                safeOrder.qty = quoteQty / mid.mid;
              } else {
                const qty = Math.min(safeOrder.qty, freeBase);
                const notional = qty * mid.mid;
                if (notional < vol.minTradeUsdt) {
                  log.info({ notional }, "volume skipped: insufficient base");
                  skipVolume = true;
                }
                safeOrder.qty = qty;
              }
            }
            if (!skipVolume && safeOrder.type === "limit" && safeOrder.postOnly && botRow.mmEnabled) {
              const ref = Number.isFinite(mid.last) && (mid.last as number) > 0 ? (mid.last as number) : mid.mid;
              const halfMin = Math.max(0, volLastBandPct);
              if (halfMin > 0 && safeOrder.price && safeOrder.qty) {
                const notional = safeOrder.price * safeOrder.qty;
                const pct = halfMin * (0.15 + Math.random() * 0.7);
                const price = safeOrder.side === "buy"
                  ? ref * (1 - pct)
                  : ref * (1 + pct);
                if (Number.isFinite(price) && price > 0 && Number.isFinite(notional)) {
                  safeOrder.price = price;
                  safeOrder.qty = notional / price;
                }
              }
            }

            if (!skipVolume) {
              try {
              const placed = await exchange.placeOrder(safeOrder);
              if (placed?.id && safeOrder.clientOrderId) {
                await upsertOrderMap({
                  botId,
                  symbol,
                  orderId: placed.id,
                  clientOrderId: safeOrder.clientOrderId
                });
              }
              if (activeLikeVol) {
                if (safeOrder.side === "buy") {
                  volState.buyCount = (volState.buyCount ?? 0) + 1;
                } else {
                  volState.sellCount = (volState.sellCount ?? 0) + 1;
                }
                volSideWindow.push(safeOrder.side);
                if (volSideWindow.length > volSideWindowMax) volSideWindow.shift();
              }
              lastVolTradeAt = Date.now();
              log.info({ volOrder: safeOrder }, "volume trade submitted");

              const allowTaker = activeVol || (vol.mode === "MIXED" && Math.random() < 0.2);
              if (allowTaker && safeOrder.type === "limit" && safeOrder.price) {
                let skipTaker = false;
                const notional = safeOrder.price * safeOrder.qty;
                const taker = safeOrder.side === "buy"
                  ? {
                      symbol,
                      side: "sell" as const,
                      type: "market" as const,
                      qty: Math.min(safeOrder.qty, freeBase),
                      clientOrderId: `vol${Date.now()}t`
                    }
                  : {
                      symbol,
                      side: "buy" as const,
                      type: "market" as const,
                      qty: safeOrder.qty,
                      quoteQty: Math.min(notional, freeUsdt),
                      clientOrderId: `vol${Date.now()}t`
                    };
                if (taker.side === "sell") {
                  const sellNotional = taker.qty * safeOrder.price;
                  if (!Number.isFinite(taker.qty) || taker.qty <= 0 || sellNotional < vol.minTradeUsdt) {
                    log.info({ sellNotional }, "volume skipped: insufficient base for taker");
                    skipTaker = true;
                  }
                } else {
                  const buyNotional = taker.quoteQty ?? 0;
                  if (!Number.isFinite(buyNotional) || buyNotional < vol.minTradeUsdt) {
                    log.info({ buyNotional }, "volume skipped: insufficient USDT for taker");
                    skipTaker = true;
                  }
                  taker.qty = buyNotional / mid.mid;
                }
                if (!skipTaker) {
                  try {
                    const placedTaker = await exchange.placeOrder(taker);
                    if (placedTaker?.id && taker.clientOrderId) {
                      await upsertOrderMap({
                        botId,
                        symbol,
                        orderId: placedTaker.id,
                        clientOrderId: taker.clientOrderId
                      });
                    }
                    if (activeLikeVol) {
                      if (taker.side === "buy") {
                        volState.buyCount = (volState.buyCount ?? 0) + 1;
                      } else {
                        volState.sellCount = (volState.sellCount ?? 0) + 1;
                      }
                      volSideWindow.push(taker.side);
                      if (volSideWindow.length > volSideWindowMax) volSideWindow.shift();
                    }
                    log.info({ volOrder: taker }, "volume trade submitted (taker)");
                  } catch (e) {
                    log.warn({ err: String(e), volOrder: taker }, "volume trade failed (taker)");
                  }
                }
              }
              } catch (e) {
                log.warn({ err: String(e), volOrder: safeOrder }, "volume trade failed");
              }
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
        errStr.includes("ECONNREFUSED") ||
        errStr.includes("non-JSON response") ||
        errStr.includes("Bad Gateway") ||
        errStr.includes("Service Unavailable");

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
