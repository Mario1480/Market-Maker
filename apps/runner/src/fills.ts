import type { Trade } from "@mm/core";
import type { Exchange } from "@mm/exchange";
import { prisma } from "@mm/db";

export function dayKeyUtc(ts = Date.now()): string {
  return new Date(ts).toISOString().slice(0, 10);
}

export async function syncFills(params: {
  botId: string;
  symbol: string;
  exchange: Exchange;
}): Promise<{ tradedNotionalToday: number; lastTradeId?: string; dayKey: string }> {
  const { botId, symbol, exchange } = params;
  const dayKey = dayKeyUtc();

  const cursor = await prisma.botFillCursor.upsert({
    where: { botId_symbol_dayKey: { botId, symbol, dayKey } },
    create: { botId, symbol, dayKey, tradedNotionalToday: 0, lastTradeId: null },
    update: {}
  });

  const trades = await exchange.getMyTrades(symbol);
  const dayTrades = trades.filter((t) => dayKeyUtc(t.timestamp) === dayKey);

  if (dayTrades.length === 0) {
    return { tradedNotionalToday: cursor.tradedNotionalToday, lastTradeId: cursor.lastTradeId ?? undefined, dayKey };
  }

  const orderIds = Array.from(
    new Set(dayTrades.map((t) => t.orderId).filter(Boolean) as string[])
  );

  const orderMaps = orderIds.length
    ? await prisma.botOrderMap.findMany({
        where: { botId, symbol, orderId: { in: orderIds } }
      })
    : [];
  const orderIdToClient = new Map(orderMaps.map((m) => [m.orderId, m.clientOrderId]));

  let addedNotional = 0;
  let newest: Trade | null = null;

  for (const t of dayTrades) {
    const cid = t.clientOrderId || (t.orderId ? orderIdToClient.get(t.orderId) : undefined);
    if (!cid || !cid.startsWith("vol")) continue;

    try {
      await prisma.botFillSeen.create({
        data: { botId, symbol, tradeId: t.id }
      });
    } catch {
      continue;
    }

    const notional = Number.isFinite(t.quoteQty as number)
      ? (t.quoteQty as number)
      : t.price * t.qty;
    if (Number.isFinite(notional)) {
      addedNotional += notional;
    }

    if (!newest || t.timestamp > newest.timestamp) newest = t;
  }

  if (addedNotional > 0 || newest) {
    const nextTotal = cursor.tradedNotionalToday + addedNotional;
    await prisma.botFillCursor.update({
      where: { botId_symbol_dayKey: { botId, symbol, dayKey } },
      data: {
        tradedNotionalToday: nextTotal,
        lastTradeId: newest?.id ?? cursor.lastTradeId
      }
    });
    return { tradedNotionalToday: nextTotal, lastTradeId: newest?.id, dayKey };
  }

  return { tradedNotionalToday: cursor.tradedNotionalToday, lastTradeId: cursor.lastTradeId ?? undefined, dayKey };
}
