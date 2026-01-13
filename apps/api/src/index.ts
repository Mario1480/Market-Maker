import "dotenv/config";
import crypto from "node:crypto";
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { prisma } from "@mm/db";
import { BitmartRestClient } from "@mm/exchange";
import { buildMmQuotes } from "@mm/strategy";
import { clamp } from "@mm/core";
import { z } from "zod";
import {
  createReauth,
  createSession,
  destroySession,
  getUserFromLocals,
  getWorkspaceId,
  hashPassword,
  requireAuth,
  requireReauth,
  verifyPassword
} from "./auth.js";
import { seedAdmin } from "./seed-admin.js";

const app = express();
const webOrigin = process.env.WEB_ORIGIN || "http://localhost:3000";
app.use(
  cors({
    origin: webOrigin,
    credentials: true
  })
);
app.use(express.json());
app.use(cookieParser());

const BotCreate = z.object({
  name: z.string(),
  symbol: z.string(),
  exchange: z.string()
});

const MMConfig = z.object({
  spreadPct: z.number(),
  maxSpreadPct: z.number(),
  levelsUp: z.number().int(),
  levelsDown: z.number().int(),
  budgetQuoteUsdt: z.number(),
  budgetBaseToken: z.number(),
  minOrderUsdt: z.number(),
  maxOrderUsdt: z.number(),
  distribution: z.enum(["LINEAR", "VALLEY", "RANDOM"]),
  jitterPct: z.number(),
  skewFactor: z.number(),
  maxSkew: z.number()
});

const VolConfig = z.object({
  dailyNotionalUsdt: z.number(),
  minTradeUsdt: z.number(),
  maxTradeUsdt: z.number(),
  activeFrom: z.string(),
  activeTo: z.string(),
  mode: z.enum(["PASSIVE", "MIXED"])
});

const RiskConfig = z.object({
  minUsdt: z.number(),
  maxDeviationPct: z.number(),
  maxOpenOrders: z.number().int(),
  maxDailyLoss: z.number()
});

const CexConfig = z.object({
  exchange: z.string(),
  apiKey: z.string(),
  apiSecret: z.string(),
  apiMemo: z.string().optional()
});

const AlertConfig = z.object({
  telegramBotToken: z.string().optional(),
  telegramChatId: z.string().optional()
});

const AuthPayload = z.object({
  email: z.string().email(),
  password: z.string().min(6)
});
const ReauthPayload = z.object({
  password: z.string().min(6)
});
const PasswordChange = z.object({
  currentPassword: z.string().min(6),
  newPassword: z.string().min(6)
});

async function createBotAlert(params: {
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

async function sendTelegramAlert(text: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return false;

  return (await sendTelegramWithResult(token, chatId, text)).ok;
}

async function sendTelegramWithResult(token: string, chatId: string, text: string) {
  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        disable_web_page_preview: true
      })
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok || data?.ok === false) {
      const err = data?.description || data?.error || "telegram_error";
      return { ok: false, error: err, status: resp.status };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

async function sendTelegramWithFallback(text: string) {
  const envToken = process.env.TELEGRAM_BOT_TOKEN;
  const envChatId = process.env.TELEGRAM_CHAT_ID;
  if (envToken && envChatId) {
    return await sendTelegramWithResult(envToken, envChatId, text);
  }

  const cfg = await prisma.alertConfig.findUnique({ where: { key: "default" } });
  if (cfg?.telegramBotToken && cfg?.telegramChatId) {
    return await sendTelegramWithResult(cfg.telegramBotToken, cfg.telegramChatId, text);
  }

  return { ok: false, error: "telegram_not_configured" };
}

app.get("/health", (_req, res) => res.json({ ok: true }));

app.post("/auth/register", async (req, res) => {
  const allowRegister = (process.env.ALLOW_REGISTER ?? "false").toLowerCase() === "true";
  if (!allowRegister) return res.status(403).json({ error: "registration_disabled" });

  const data = AuthPayload.parse(req.body);
  const existing = await prisma.user.findUnique({ where: { email: data.email } });
  if (existing) return res.status(400).json({ error: "email_taken" });

  const passwordHash = await hashPassword(data.password);
  const user = await prisma.user.create({
    data: {
      email: data.email,
      passwordHash,
      workspaces: {
        create: {
          role: "owner",
          workspace: { create: { name: "Default" } }
        }
      }
    }
  });

  await createSession(res, user.id);
  res.json({ ok: true });
});

app.post("/auth/login", async (req, res) => {
  const data = AuthPayload.parse(req.body);
  const user = await prisma.user.findUnique({ where: { email: data.email } });
  if (!user) return res.status(401).json({ error: "invalid_credentials" });

  const ok = await verifyPassword(data.password, user.passwordHash);
  if (!ok) return res.status(401).json({ error: "invalid_credentials" });

  await createSession(res, user.id);
  res.json({ ok: true });
});

app.post("/auth/logout", requireAuth, async (req, res) => {
  const token = req.cookies?.mm_session ?? null;
  await destroySession(res, token);
  res.json({ ok: true });
});

app.get("/auth/me", requireAuth, async (_req, res) => {
  const user = getUserFromLocals(res);
  const workspaceId = getWorkspaceId(res);
  res.json({ id: user.id, email: user.email, workspaceId });
});

app.post("/auth/reauth", requireAuth, async (req, res) => {
  const data = ReauthPayload.parse(req.body);
  const user = getUserFromLocals(res);
  const dbUser = await prisma.user.findUnique({ where: { id: user.id } });
  if (!dbUser) return res.status(401).json({ error: "unauthorized" });

  const ok = await verifyPassword(data.password, dbUser.passwordHash);
  if (!ok) return res.status(401).json({ error: "invalid_credentials" });

  const session = await createReauth(res, user.id);
  res.json({ ok: true, expiresAt: session.expiresAt });
});

app.post("/auth/change-password", requireAuth, async (req, res) => {
  const data = PasswordChange.parse(req.body);
  const user = getUserFromLocals(res);
  const dbUser = await prisma.user.findUnique({ where: { id: user.id } });
  if (!dbUser) return res.status(401).json({ error: "unauthorized" });

  const ok = await verifyPassword(data.currentPassword, dbUser.passwordHash);
  if (!ok) return res.status(400).json({ error: "invalid_password" });

  const nextHash = await hashPassword(data.newPassword);
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: nextHash }
  });

  res.json({ ok: true });
});

app.get("/auth/reauth/status", requireAuth, async (req, res) => {
  const token = req.cookies?.mm_reauth;
  if (!token) return res.json({ ok: false });

  const hash = crypto.createHash("sha256").update(token).digest("hex");
  const session = await prisma.reauthSession.findUnique({ where: { tokenHash: hash } });
  if (!session || session.expiresAt.getTime() < Date.now()) {
    res.clearCookie("mm_reauth", { path: "/" });
    return res.json({ ok: false });
  }
  res.json({ ok: true, expiresAt: session.expiresAt });
});

app.post("/alerts/test", requireAuth, async (_req, res) => {
  const text = `Test alert ✅ ${new Date().toLocaleString()}`;
  const result = await sendTelegramWithFallback(text);

  if (!result || !result.ok) {
    return res.status(400).json({
      error: "telegram_not_configured_or_unreachable",
      details: result?.error ?? "unknown"
    });
  }

  res.json({ ok: true });
});

app.get("/bots", requireAuth, async (_req, res) => {
  const workspaceId = getWorkspaceId(res);
  const bots = await prisma.bot.findMany({
    where: { workspaceId },
    orderBy: { createdAt: "desc" }
  });
  res.json(bots);
});

app.get("/bots/:id", requireAuth, async (req, res) => {
  const workspaceId = getWorkspaceId(res);
  const bot = await prisma.bot.findFirst({
    where: { id: req.params.id, workspaceId },
    include: { mmConfig: true, volConfig: true, riskConfig: true, runtime: true } as any
  });
  if (!bot) return res.status(404).json({ error: "not_found" });
  res.json(bot);
});

app.get("/bots/:id/runtime", requireAuth, async (req, res) => {
  const workspaceId = getWorkspaceId(res);
  const bot = await prisma.bot.findFirst({ where: { id: req.params.id, workspaceId } });
  if (!bot) return res.status(404).json({ error: "not_found" });
  const rt = await prisma.botRuntime.findUnique({ where: { botId: req.params.id } });
  res.json(rt ?? null);
});

app.delete("/bots/:id", requireAuth, async (req, res) => {
  const workspaceId = getWorkspaceId(res);
  const botId = req.params.id;
  const bot = await prisma.bot.findFirst({ where: { id: botId, workspaceId } });
  if (!bot) return res.status(404).json({ error: "not_found" });

  await prisma.$transaction([
    prisma.botAlert.deleteMany({ where: { botId } }),
    prisma.botRuntime.deleteMany({ where: { botId } }),
    prisma.marketMakingConfig.deleteMany({ where: { botId } }),
    prisma.volumeConfig.deleteMany({ where: { botId } }),
    prisma.riskConfig.deleteMany({ where: { botId } }),
    prisma.bot.delete({ where: { id: botId } })
  ]);

  res.json({ ok: true });
});

app.get("/bots/:id/open-orders", requireAuth, async (req, res) => {
  const workspaceId = getWorkspaceId(res);
  const bot = await prisma.bot.findFirst({ where: { id: req.params.id, workspaceId } });
  if (!bot) return res.status(404).json({ error: "not_found" });
  if (bot.exchange.toLowerCase() !== "bitmart") {
    return res.status(400).json({ error: "unsupported_exchange" });
  }

  const cex = await prisma.cexConfig.findUnique({ where: { exchange: bot.exchange } });
  if (!cex?.apiKey || !cex?.apiSecret) {
    return res.status(400).json({ error: "cex_config_missing" });
  }

  const baseUrl = process.env.BITMART_BASE_URL || "https://api-cloud.bitmart.com";
  const rest = new BitmartRestClient(baseUrl, cex.apiKey, cex.apiSecret, cex.apiMemo ?? "");
  const orders = await rest.getOpenOrders(bot.symbol);

  const normalized = orders.map((o) => ({
    id: o.id,
    side: o.side,
    price: o.price,
    qty: o.qty,
    clientOrderId: o.clientOrderId ?? null,
    createdAt: null
  }));

  const isMm = (cid?: string | null) => {
    const c = cid ?? "";
    return c.startsWith("mm-") || c.startsWith("mmb") || c.startsWith("mms");
  };
  const isVol = (cid?: string | null) => {
    const c = cid ?? "";
    return c.startsWith("vol-") || c.startsWith("vol");
  };

  res.json({
    mm: normalized.filter((o) => isMm(o.clientOrderId)),
    vol: normalized.filter((o) => isVol(o.clientOrderId)),
    other: normalized.filter((o) => !isMm(o.clientOrderId) && !isVol(o.clientOrderId))
  });
});

app.get("/bots/:id/alerts", requireAuth, async (req, res) => {
  const workspaceId = getWorkspaceId(res);
  const bot = await prisma.bot.findFirst({ where: { id: req.params.id, workspaceId } });
  if (!bot) return res.status(404).json({ error: "not_found" });
  const limit = Math.min(Number(req.query.limit || "10"), 50);
  const items = await prisma.botAlert.findMany({
    where: { botId: req.params.id },
    orderBy: { createdAt: "desc" },
    take: limit
  });
  res.json(items);
});

app.delete("/bots/:id/alerts", requireAuth, async (req, res) => {
  const workspaceId = getWorkspaceId(res);
  const bot = await prisma.bot.findFirst({ where: { id: req.params.id, workspaceId } });
  if (!bot) return res.status(404).json({ error: "not_found" });
  const id = req.params.id;
  const r = await prisma.botAlert.deleteMany({ where: { botId: id } });
  res.json({ ok: true, deleted: r.count });
});

app.get("/bots/:id/exchange-keys", requireAuth, requireReauth, async (req, res) => {
  const workspaceId = getWorkspaceId(res);
  const bot = await prisma.bot.findFirst({ where: { id: req.params.id, workspaceId } });
  if (!bot) return res.status(404).json({ error: "not_found" });

  const cfg = await prisma.cexConfig.findUnique({ where: { exchange: bot.exchange } });
  res.json(cfg ?? null);
});

app.put("/bots/:id/exchange-keys", requireAuth, requireReauth, async (req, res) => {
  const workspaceId = getWorkspaceId(res);
  const bot = await prisma.bot.findFirst({ where: { id: req.params.id, workspaceId } });
  if (!bot) return res.status(404).json({ error: "not_found" });

  const data = CexConfig.parse(req.body);
  if (data.exchange !== bot.exchange) {
    return res.status(400).json({ error: "exchange_mismatch" });
  }

  const cfg = await prisma.cexConfig.upsert({
    where: { exchange: data.exchange },
    update: {
      apiKey: data.apiKey,
      apiSecret: data.apiSecret,
      apiMemo: data.apiMemo
    },
    create: {
      exchange: data.exchange,
      apiKey: data.apiKey,
      apiSecret: data.apiSecret,
      apiMemo: data.apiMemo
    }
  });
  res.json(cfg);
});

app.post("/bots/:id/preview/mm", requireAuth, async (req, res) => {
  const workspaceId = getWorkspaceId(res);
  const bot = await prisma.bot.findFirst({ where: { id: req.params.id, workspaceId } });
  if (!bot) return res.status(404).json({ error: "not_found" });
  const payload = z.object({
    mm: MMConfig,
    runtime: z
      .object({
        mid: z.number(),
        freeUsdt: z.number().optional(),
        freeBase: z.number().optional()
      })
      .optional(),
    options: z
      .object({
        includeJitter: z.boolean().optional(),
        seed: z.number().optional()
      })
      .optional()
  }).parse(req.body);

  const mid = payload.runtime?.mid;
  if (!Number.isFinite(mid) || (mid as number) <= 0) {
    return res.status(400).json({ error: "mid_missing" });
  }

  const freeBase = payload.runtime?.freeBase ?? 0;
  const targetBase = payload.mm.budgetBaseToken;
  const inventoryRatio = targetBase > 0 ? freeBase / targetBase : 1;
  const skew = clamp((inventoryRatio - 1) * payload.mm.skewFactor, -payload.mm.maxSkew, payload.mm.maxSkew);

  const quotes = buildMmQuotes({
    symbol: "PREVIEW",
    mid: mid as number,
    cfg: payload.mm,
    inventoryRatio,
    includeJitter: payload.options?.includeJitter ?? false,
    seed: payload.options?.seed
  });

  const bids = quotes
    .filter((q) => q.side === "buy")
    .map((q) => ({ price: q.price, qty: q.qty, notional: q.price * q.qty }))
    .sort((a, b) => a.price - b.price)
    .reverse();
  const asks = quotes
    .filter((q) => q.side === "sell")
    .map((q) => ({ price: q.price, qty: q.qty, notional: q.price * q.qty }))
    .sort((a, b) => a.price - b.price);

  res.json({ mid, bids, asks, inventoryRatio, skewPct: skew * 100, skewedMid: (mid as number) * (1 + skew) });
});

app.get("/exchanges/:exchange/symbols", requireAuth, async (req, res) => {
  const exchange = req.params.exchange.toLowerCase();
  if (exchange !== "bitmart") {
    return res.status(400).json({ error: "unsupported_exchange" });
  }

  const baseUrl = process.env.BITMART_BASE_URL || "https://api-cloud.bitmart.com";
  const url = new URL("/spot/v1/symbols", baseUrl);

  const resp = await fetch(url, { method: "GET" });
  const json = await resp.json().catch(() => ({}));

  if (!resp.ok || (json?.code && json.code !== 1000)) {
    const msg = json?.msg || json?.message || "symbols fetch failed";
    return res.status(400).json({ error: msg, details: json });
  }

  const symbols = Array.isArray(json?.data?.symbols)
    ? json.data.symbols
    : Array.isArray(json?.data)
      ? json.data
      : [];

  const mapped = symbols
    .map((s: any) => {
      if (typeof s === "string") {
        const parts = s.split(/[_/-]/);
        const base = parts[0];
        const quote = parts[1];
        return { symbol: s, base, quote };
      }

      const rawSymbol =
        s?.symbol ||
        s?.symbol_id ||
        s?.symbolId ||
        s?.trade_symbol ||
        s?.trading_pair;
      const symbol = rawSymbol ? String(rawSymbol) : "";
      let base = s?.base_currency || s?.baseCurrency || s?.base || s?.baseToken;
      let quote = s?.quote_currency || s?.quoteCurrency || s?.quote || s?.quoteToken;

      if ((!base || !quote) && symbol) {
        const parts = symbol.split(/[_/-]/);
        if (parts.length >= 2) {
          base = base || parts[0];
          quote = quote || parts[1];
        }
      }

      if (!symbol) return null;
      return { symbol, base: base ? String(base) : undefined, quote: quote ? String(quote) : undefined };
    })
    .filter(Boolean);

  if (mapped.length === 0) {
    return res.status(502).json({ error: "symbols_unavailable", details: json });
  }

  const unique = Array.from(new Map(mapped.map((s: any) => [s.symbol, s])).values());
  const usdtOnly = unique.filter((s: any) => String(s.quote || "").toUpperCase() === "USDT");
  res.json(usdtOnly.length > 0 ? usdtOnly : unique);
});

app.get("/settings/cex/:exchange", requireAuth, requireReauth, async (req, res) => {
  const exchange = req.params.exchange;
  const cfg = await prisma.cexConfig.findUnique({ where: { exchange } });
  res.json(cfg ?? null);
});

app.get("/settings/cex", requireAuth, async (_req, res) => {
  const items = await prisma.cexConfig.findMany({ orderBy: { updatedAt: "desc" } });
  const masked = items.map((cfg) => ({
    exchange: cfg.exchange,
    apiKey: cfg.apiKey ? `${cfg.apiKey.slice(0, 4)}...${cfg.apiKey.slice(-4)}` : "",
    apiSecret: cfg.apiSecret ? "********" : "",
    apiMemo: cfg.apiMemo ?? null,
    updatedAt: cfg.updatedAt
  }));
  res.json(masked);
});

app.get("/settings/alerts", requireAuth, async (_req, res) => {
  const cfg = await prisma.alertConfig.findUnique({ where: { key: "default" } });
  res.json(cfg ?? { telegramBotToken: null, telegramChatId: null });
});

app.delete("/settings/cex/:exchange", requireAuth, requireReauth, async (req, res) => {
  const exchange = req.params.exchange;
  await prisma.cexConfig.delete({ where: { exchange } });
  res.json({ ok: true });
});

app.post("/bots", requireAuth, async (req, res) => {
  const workspaceId = getWorkspaceId(res);
  const data = BotCreate.parse(req.body);
  const id = crypto.randomUUID();

  const bot = await prisma.bot.create({
    data: {
      id,
      workspaceId,
      name: data.name,
      symbol: data.symbol,
      exchange: data.exchange,
      status: "STOPPED",
      mmEnabled: true,
      volEnabled: true,
      mmConfig: {
        create: {
          spreadPct: 0.004,
          maxSpreadPct: 0.0015,
          levelsUp: 5,
          levelsDown: 5,
          budgetQuoteUsdt: 2000,
          budgetBaseToken: 2000,
          minOrderUsdt: 5,
          maxOrderUsdt: 0,
          distribution: "VALLEY",
          jitterPct: 0.0002,
          skewFactor: 0.25,
          maxSkew: 0.006
        }
      },
      volConfig: {
        create: {
          dailyNotionalUsdt: 5000,
          minTradeUsdt: 10,
          maxTradeUsdt: 40,
          activeFrom: "00:00",
          activeTo: "23:59",
          mode: "MIXED"
        }
      },
      riskConfig: {
        create: {
          minUsdt: 200,
          maxDeviationPct: 0.8,
          maxOpenOrders: 30,
          maxDailyLoss: 200
        }
      }
    }
  });

  await prisma.botRuntime.upsert({
    where: { botId: bot.id },
    create: {
      botId: bot.id,
      status: "STOPPED",
      reason: "Created"
    },
    update: {
      status: "STOPPED",
      reason: "Created"
    }
  });

  res.json(bot);
});

app.put("/bots/:id/config", requireAuth, async (req, res) => {
  const workspaceId = getWorkspaceId(res);
  const botId = req.params.id;

  const payload = z.object({
    mm: MMConfig,
    vol: VolConfig,
    risk: RiskConfig
  }).parse(req.body);

  const errors: Record<string, string> = {};
  const minQuoteUsdt = 100;

  if (payload.mm.budgetQuoteUsdt < minQuoteUsdt) {
    errors.budgetQuoteUsdt = `Minimum ${minQuoteUsdt} USDT`;
  }

  const bot = await prisma.bot.findFirst({ where: { id: botId, workspaceId } });
  if (!bot) return res.status(404).json({ error: "not_found" });
  const rt = await prisma.botRuntime.findUnique({ where: { botId } });
  const mid = rt?.mid ?? null;

  if (mid && mid > 0) {
    const minBaseToken = minQuoteUsdt / mid;
    if (payload.mm.budgetBaseToken < minBaseToken) {
      const base = bot?.symbol?.split("_")[0] || "Token";
      errors.budgetBaseToken = `Minimum ~${minBaseToken.toFixed(6)} ${base}`;
    }
  }

  if (Object.keys(errors).length > 0) {
    return res.status(400).json({ error: "min_budget", details: { errors } });
  }

  await prisma.marketMakingConfig.update({
    where: { botId },
    data: payload.mm
  });

  await prisma.volumeConfig.update({
    where: { botId },
    data: payload.vol
  });

  await prisma.riskConfig.update({
    where: { botId },
    data: payload.risk
  });

  res.json({ ok: true });
});

app.post("/bots/:id/mm/start", requireAuth, async (req, res) => {
  const workspaceId = getWorkspaceId(res);
  const botId = req.params.id;
  const bot = await prisma.bot.findFirst({ where: { id: botId, workspaceId } });
  if (!bot) return res.status(404).json({ error: "bot_not_found" });
  await prisma.bot.update({ where: { id: botId }, data: { mmEnabled: true } });
  await sendTelegramWithFallback(`✅ MM started\n${bot.name} (${bot.symbol})`);
  res.json({ ok: true });
});

app.post("/bots/:id/mm/stop", requireAuth, async (req, res) => {
  const workspaceId = getWorkspaceId(res);
  const botId = req.params.id;
  const bot = await prisma.bot.findFirst({ where: { id: botId, workspaceId } });
  if (!bot) return res.status(404).json({ error: "bot_not_found" });
  await prisma.bot.update({ where: { id: botId }, data: { mmEnabled: false } });
  await sendTelegramWithFallback(`🛑 MM stopped\n${bot.name} (${bot.symbol})`);
  res.json({ ok: true });
});

app.post("/bots/:id/vol/start", requireAuth, async (req, res) => {
  const workspaceId = getWorkspaceId(res);
  const botId = req.params.id;
  const bot = await prisma.bot.findFirst({ where: { id: botId, workspaceId } });
  if (!bot) return res.status(404).json({ error: "bot_not_found" });
  await prisma.bot.update({ where: { id: botId }, data: { volEnabled: true } });
  await sendTelegramWithFallback(`✅ Volume bot started\n${bot.name} (${bot.symbol})`);
  res.json({ ok: true });
});

app.post("/bots/:id/vol/stop", requireAuth, async (req, res) => {
  const workspaceId = getWorkspaceId(res);
  const botId = req.params.id;
  const bot = await prisma.bot.findFirst({ where: { id: botId, workspaceId } });
  if (!bot) return res.status(404).json({ error: "bot_not_found" });
  await prisma.bot.update({ where: { id: botId }, data: { volEnabled: false } });
  await sendTelegramWithFallback(`🛑 Volume bot stopped\n${bot.name} (${bot.symbol})`);
  res.json({ ok: true });
});

app.put("/settings/cex", requireAuth, requireReauth, async (req, res) => {
  const data = CexConfig.parse(req.body);
  const cfg = await prisma.cexConfig.upsert({
    where: { exchange: data.exchange },
    update: {
      apiKey: data.apiKey,
      apiSecret: data.apiSecret,
      apiMemo: data.apiMemo
    },
    create: {
      exchange: data.exchange,
      apiKey: data.apiKey,
      apiSecret: data.apiSecret,
      apiMemo: data.apiMemo
    }
  });
  res.json(cfg);
});

app.put("/settings/alerts", requireAuth, async (req, res) => {
  const data = AlertConfig.parse(req.body);
  const cfg = await prisma.alertConfig.upsert({
    where: { key: "default" },
    update: {
      telegramBotToken: data.telegramBotToken ?? null,
      telegramChatId: data.telegramChatId ?? null
    },
    create: {
      key: "default",
      telegramBotToken: data.telegramBotToken ?? null,
      telegramChatId: data.telegramChatId ?? null
    }
  });
  res.json(cfg);
});

app.post("/settings/cex/verify", requireAuth, requireReauth, async (req, res) => {
  const data = CexConfig.parse(req.body);

  // Minimal auth-protected call: balances requires signed headers.
  const baseUrl = process.env.BITMART_BASE_URL || "https://api-cloud.bitmart.com";
  const url = new URL("/spot/v1/wallet", baseUrl);
  const timestamp = Date.now().toString();
  const body = "{}";
  const payload = `${timestamp}#${data.apiMemo ?? ""}#${body}`;
  const sign = crypto
    .createHmac("sha256", data.apiSecret)
    .update(payload)
    .digest("hex");

  const resp = await fetch(url, {
    method: "GET",
    headers: {
      "X-BM-KEY": data.apiKey,
      "X-BM-SIGN": sign,
      "X-BM-TIMESTAMP": timestamp,
      "Content-Type": "application/json"
    }
  });

  const json = await resp.json().catch(() => ({}));

  if (!resp.ok || (json?.code && json.code !== 1000)) {
    const msg = json?.msg || json?.message || "verify failed";
    return res.status(400).json({ ok: false, error: msg, details: json });
  }

  res.json({ ok: true });
});

app.post("/bots/:id/start", requireAuth, async (req, res) => {
  const workspaceId = getWorkspaceId(res);
  const id = req.params.id;

  const bot = await prisma.bot.findFirst({ where: { id, workspaceId } });
  if (!bot) return res.status(404).json({ error: "bot_not_found" });

  await prisma.bot.update({
    where: { id },
    data: { status: "RUNNING" }
  });

  await prisma.botRuntime.upsert({
    where: { botId: id },
    create: {
      botId: id,
      status: "RUNNING",
      reason: null
    },
    update: {
      status: "RUNNING",
      reason: null
    }
  });

  await createBotAlert({
    botId: id,
    level: "info",
    title: "Bot started",
    message: "Start command received"
  });

  await sendTelegramWithFallback(`✅ Bot started\n${bot.name} (${bot.symbol})`);

  res.json({ ok: true });
});

app.post("/bots/:id/pause", requireAuth, async (req, res) => {
  const workspaceId = getWorkspaceId(res);
  const id = req.params.id;

  const bot = await prisma.bot.findFirst({ where: { id, workspaceId } });
  if (!bot) return res.status(404).json({ error: "bot_not_found" });

  await prisma.bot.update({
    where: { id },
    data: { status: "PAUSED" }
  });

  await prisma.botRuntime.upsert({
    where: { botId: id },
    create: {
      botId: id,
      status: "PAUSED",
      reason: "Paused from UI"
    },
    update: {
      status: "PAUSED",
      reason: "Paused from UI"
    }
  });

  await createBotAlert({
    botId: id,
    level: "warn",
    title: "Bot paused",
    message: "Pause command received"
  });

  res.json({ ok: true });
});

app.post("/bots/:id/stop", requireAuth, async (req, res) => {
  const workspaceId = getWorkspaceId(res);
  const id = req.params.id;

  const bot = await prisma.bot.findFirst({ where: { id, workspaceId } });
  if (!bot) return res.status(404).json({ error: "bot_not_found" });

  await prisma.bot.update({
    where: { id },
    data: { status: "STOPPED" }
  });

  await prisma.botRuntime.upsert({
    where: { botId: id },
    create: {
      botId: id,
      status: "STOPPED",
      reason: "Stopped from UI"
    },
    update: {
      status: "STOPPED",
      reason: "Stopped from UI"
    }
  });

  await createBotAlert({
    botId: id,
    level: "warn",
    title: "Bot stopped",
    message: "Stop command received"
  });

  await sendTelegramWithFallback(`🛑 Bot stopped\n${bot.name} (${bot.symbol})`);

  res.json({ ok: true });
});

const port = Number(process.env.API_PORT || "8080");

async function start() {
  const seed = await seedAdmin();
  if (!seed.seeded) {
    console.log(`[seed] admin not created (${seed.reason})`);
  }
  app.listen(port, () => console.log(`API listening on :${port}`));
}

start().catch((err) => {
  console.error("API startup failed", err);
  process.exit(1);
});
