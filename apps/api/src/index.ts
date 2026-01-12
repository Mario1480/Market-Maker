import "dotenv/config";
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
  stepPct: z.number(),
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

app.get("/health", (_req, res) => res.json({ ok: true }));

app.get("/bots", async (_req, res) => {
  const bots = await prisma.bot.findMany({ orderBy: { createdAt: "desc" } });
  res.json(bots);
});

app.get("/bots/:id", async (req, res) => {
  const bot = await prisma.bot.findUnique({
    where: { id: req.params.id },
    include: { mmConfig: true, volConfig: true, riskConfig: true, BotRuntime: true } as any
  });
  if (!bot) return res.status(404).json({ error: "not_found" });
  res.json(bot);
});

app.get("/bots/:id/runtime", async (req, res) => {
  const rt = await prisma.botRuntime.findUnique({ where: { botId: req.params.id } });
  res.json(rt ?? null);
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
      mmConfig: {
        create: {
          spreadPct: 0.004,
          stepPct: 0.0015,
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

app.post("/bots/:id/start", async (req, res) => {
  await prisma.bot.update({ where: { id: req.params.id }, data: { status: "RUNNING" } });
  res.json({ ok: true });
});

app.post("/bots/:id/pause", async (req, res) => {
  await prisma.bot.update({ where: { id: req.params.id }, data: { status: "PAUSED" } });
  res.json({ ok: true });
});

app.post("/bots/:id/stop", async (req, res) => {
  await prisma.bot.update({ where: { id: req.params.id }, data: { status: "STOPPED" } });
  res.json({ ok: true });
});

const port = Number(process.env.API_PORT || "8080");
app.listen(port, () => console.log(`API listening on :${port}`));