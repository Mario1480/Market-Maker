import "dotenv/config";
import crypto from "node:crypto";
import express from "express";
import cors from "cors";
import { prisma } from "@mm/db";
import { z } from "zod";

const app = express();
app.use(cors());
app.use(express.json());

const BotCreate = z.object({
  id: z.string(),
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

app.get("/health", (_req, res) => res.json({ ok: true }));

app.get("/bots", async (_req, res) => {
  const bots = await prisma.bot.findMany({ orderBy: { createdAt: "desc" } });
  res.json(bots);
});

app.get("/bots/:id", async (req, res) => {
  const bot = await prisma.bot.findUnique({
    where: { id: req.params.id },
    include: { mmConfig: true, volConfig: true, riskConfig: true, runtime: true } as any
  });
  if (!bot) return res.status(404).json({ error: "not_found" });
  res.json(bot);
});

app.get("/bots/:id/runtime", async (req, res) => {
  const rt = await prisma.botRuntime.findUnique({ where: { botId: req.params.id } });
  res.json(rt ?? null);
});

app.get("/settings/cex/:exchange", async (req, res) => {
  const exchange = req.params.exchange;
  const cfg = await prisma.cexConfig.findUnique({ where: { exchange } });
  res.json(cfg ?? null);
});

app.get("/settings/cex", async (_req, res) => {
  const items = await prisma.cexConfig.findMany({ orderBy: { updatedAt: "desc" } });
  res.json(items);
});

app.delete("/settings/cex/:exchange", async (req, res) => {
  const exchange = req.params.exchange;
  await prisma.cexConfig.delete({ where: { exchange } });
  res.json({ ok: true });
});

app.post("/bots", async (req, res) => {
  const data = BotCreate.parse(req.body);

  const bot = await prisma.bot.create({
    data: {
      id: data.id,
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
          activeFrom: "08:00",
          activeTo: "22:00",
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

  res.json(bot);
});

app.put("/bots/:id/config", async (req, res) => {
  const botId = req.params.id;

  const payload = z.object({
    mm: MMConfig,
    vol: VolConfig,
    risk: RiskConfig
  }).parse(req.body);

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

app.post("/bots/:id/mm/start", async (req, res) => {
  const botId = req.params.id;
  await prisma.bot.update({ where: { id: botId }, data: { mmEnabled: true } });
  res.json({ ok: true });
});

app.post("/bots/:id/mm/stop", async (req, res) => {
  const botId = req.params.id;
  await prisma.bot.update({ where: { id: botId }, data: { mmEnabled: false } });
  res.json({ ok: true });
});

app.post("/bots/:id/vol/start", async (req, res) => {
  const botId = req.params.id;
  await prisma.bot.update({ where: { id: botId }, data: { volEnabled: true } });
  res.json({ ok: true });
});

app.post("/bots/:id/vol/stop", async (req, res) => {
  const botId = req.params.id;
  await prisma.bot.update({ where: { id: botId }, data: { volEnabled: false } });
  res.json({ ok: true });
});

app.put("/settings/cex", async (req, res) => {
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

app.post("/settings/cex/verify", async (req, res) => {
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

app.post("/bots/:id/start", async (req, res) => {
  const id = req.params.id;

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

  res.json({ ok: true });
});

app.post("/bots/:id/pause", async (req, res) => {
  const id = req.params.id;

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

  res.json({ ok: true });
});

app.post("/bots/:id/stop", async (req, res) => {
  const id = req.params.id;

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

  res.json({ ok: true });
});

const port = Number(process.env.API_PORT || "8080");
app.listen(port, () => console.log(`API listening on :${port}`));
