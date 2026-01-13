import { prisma } from "@mm/db";
import type { MarketMakingConfig, RiskConfig, VolumeConfig } from "@mm/core";

export async function loadBotAndConfigs(botId: string) {
  const bot = await prisma.bot.findUnique({
    where: { id: botId },
    include: { mmConfig: true, volConfig: true, riskConfig: true }
  });

  if (!bot) throw new Error(`Bot not found in DB: ${botId}`);

  if (!bot.mmConfig || !bot.volConfig || !bot.riskConfig) {
    throw new Error(`Bot missing configs (mm/vol/risk): ${botId}`);
  }

  const mm: MarketMakingConfig = {
    spreadPct: bot.mmConfig.spreadPct,
    maxSpreadPct: bot.mmConfig.maxSpreadPct,
    levelsUp: bot.mmConfig.levelsUp,
    levelsDown: bot.mmConfig.levelsDown,
    budgetQuoteUsdt: bot.mmConfig.budgetQuoteUsdt,
    budgetBaseToken: bot.mmConfig.budgetBaseToken,
    minOrderUsdt: bot.mmConfig.minOrderUsdt ?? 0,
    maxOrderUsdt: bot.mmConfig.maxOrderUsdt ?? 0,
    distribution: bot.mmConfig.distribution as any,
    jitterPct: bot.mmConfig.jitterPct,
    skewFactor: bot.mmConfig.skewFactor,
    maxSkew: bot.mmConfig.maxSkew
  };

  const vol: VolumeConfig = {
    dailyNotionalUsdt: bot.volConfig.dailyNotionalUsdt,
    minTradeUsdt: bot.volConfig.minTradeUsdt,
    maxTradeUsdt: bot.volConfig.maxTradeUsdt,
    activeFrom: "00:00",
    activeTo: "23:59",
    mode: bot.volConfig.mode as any
  };

  const risk: RiskConfig = {
    minUsdt: bot.riskConfig.minUsdt,
    maxDeviationPct: bot.riskConfig.maxDeviationPct,
    maxOpenOrders: bot.riskConfig.maxOpenOrders,
    maxDailyLoss: bot.riskConfig.maxDailyLoss
  };

  return { bot, mm, vol, risk };
}

export async function loadLatestBotAndConfigs() {
  const bot = await prisma.bot.findFirst({
    orderBy: { createdAt: "desc" },
    include: { mmConfig: true, volConfig: true, riskConfig: true }
  });

  if (!bot) throw new Error("No bots found in DB");
  if (!bot.mmConfig || !bot.volConfig || !bot.riskConfig) {
    throw new Error(`Bot missing configs (mm/vol/risk): ${bot.id}`);
  }

  const mm: MarketMakingConfig = {
    spreadPct: bot.mmConfig.spreadPct,
    maxSpreadPct: bot.mmConfig.maxSpreadPct,
    levelsUp: bot.mmConfig.levelsUp,
    levelsDown: bot.mmConfig.levelsDown,
    budgetQuoteUsdt: bot.mmConfig.budgetQuoteUsdt,
    budgetBaseToken: bot.mmConfig.budgetBaseToken,
    minOrderUsdt: bot.mmConfig.minOrderUsdt ?? 0,
    maxOrderUsdt: bot.mmConfig.maxOrderUsdt ?? 0,
    distribution: bot.mmConfig.distribution as any,
    jitterPct: bot.mmConfig.jitterPct,
    skewFactor: bot.mmConfig.skewFactor,
    maxSkew: bot.mmConfig.maxSkew
  };

  const vol: VolumeConfig = {
    dailyNotionalUsdt: bot.volConfig.dailyNotionalUsdt,
    minTradeUsdt: bot.volConfig.minTradeUsdt,
    maxTradeUsdt: bot.volConfig.maxTradeUsdt,
    activeFrom: "00:00",
    activeTo: "23:59",
    mode: bot.volConfig.mode as any
  };

  const risk: RiskConfig = {
    minUsdt: bot.riskConfig.minUsdt,
    maxDeviationPct: bot.riskConfig.maxDeviationPct,
    maxOpenOrders: bot.riskConfig.maxOpenOrders,
    maxDailyLoss: bot.riskConfig.maxDailyLoss
  };

  return { bot, mm, vol, risk };
}

export async function loadCexConfig(exchange: string) {
  const cfg = await prisma.cexConfig.findUnique({ where: { exchange } });

  if (!cfg) throw new Error(`CEX config not found for exchange: ${exchange}`);
  if (!cfg.apiKey || !cfg.apiSecret) {
    throw new Error(`CEX config incomplete for exchange: ${exchange}`);
  }

  return cfg;
}

export async function writeRuntime(params: {
  botId: string;
  status: string;
  reason?: string | null;
  mid?: number | null;
  bid?: number | null;
  ask?: number | null;
  openOrders?: number | null;
  openOrdersMm?: number | null;
  openOrdersVol?: number | null;
  lastVolClientOrderId?: string | null;
  freeUsdt?: number | null;
  freeBase?: number | null;
  tradedNotionalToday?: number | null;
}) {
  await prisma.botRuntime.upsert({
    where: { botId: params.botId },
    create: {
      botId: params.botId,
      status: params.status,
      reason: params.reason ?? null,
      mid: params.mid ?? null,
      bid: params.bid ?? null,
      ask: params.ask ?? null,
      openOrders: params.openOrders ?? null,
      openOrdersMm: params.openOrdersMm ?? null,
      openOrdersVol: params.openOrdersVol ?? null,
      lastVolClientOrderId: params.lastVolClientOrderId ?? null,
      freeUsdt: params.freeUsdt ?? null,
      freeBase: params.freeBase ?? null,
      tradedNotionalToday: params.tradedNotionalToday ?? null
    },
    update: {
      status: params.status,
      reason: params.reason ?? null,
      mid: params.mid ?? null,
      bid: params.bid ?? null,
      ask: params.ask ?? null,
      openOrders: params.openOrders ?? null,
      openOrdersMm: params.openOrdersMm ?? null,
      openOrdersVol: params.openOrdersVol ?? null,
      lastVolClientOrderId: params.lastVolClientOrderId ?? null,
      freeUsdt: params.freeUsdt ?? null,
      freeBase: params.freeBase ?? null,
      tradedNotionalToday: params.tradedNotionalToday ?? null
    }
  });
}

export async function writeAlert(params: {
  botId: string;
  level: "info" | "warn" | "error";
  title: string;
  message?: string | null;
}) {
  await prisma.botAlert.create({
    data: {
      botId: params.botId,
      level: params.level,
      title: params.title,
      message: params.message ?? null
    }
  });
}

export async function updateBotFlags(params: {
  botId: string;
  status?: string;
  mmEnabled?: boolean;
  volEnabled?: boolean;
}) {
  const data: Record<string, any> = {};
  if (params.status !== undefined) data.status = params.status;
  if (params.mmEnabled !== undefined) data.mmEnabled = params.mmEnabled;
  if (params.volEnabled !== undefined) data.volEnabled = params.volEnabled;
  if (Object.keys(data).length === 0) return;
  await prisma.bot.update({ where: { id: params.botId }, data });
}
