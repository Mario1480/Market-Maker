import "dotenv/config";
import { BitmartRestClient } from "@mm/exchange";
import type { Exchange } from "@mm/exchange";
import { BotStateMachine } from "./state-machine.js";
import { runLoop } from "./loop.js";
import { log } from "./logger.js";
import { loadBotAndConfigs, loadCexConfig, loadLatestBotAndConfigs } from "./db.js";

function mustEnv(k: string): string {
  const v = process.env[k];
  if (!v) throw new Error(`Missing env: ${k}`);
  return v;
}

function optionalEnv(k: string): string | null {
  const v = process.env[k];
  return v && v.trim().length > 0 ? v : null;
}

async function main() {
  const requestedBotId = optionalEnv("RUNNER_BOT_ID");
  const tickMs = Number(process.env.RUNNER_TICK_MS || "800");

  const { bot, mm, vol, risk } = requestedBotId
    ? await loadBotAndConfigs(requestedBotId)
    : await loadLatestBotAndConfigs();
  const symbol = bot.symbol;

  if (bot.exchange !== "bitmart") {
    throw new Error(`Unsupported exchange: ${bot.exchange}`);
  }

  const cex = await loadCexConfig(bot.exchange);
  const rest = new BitmartRestClient(
    mustEnv("BITMART_BASE_URL"),
    cex.apiKey,
    cex.apiSecret,
    cex.apiMemo ?? ""
  );

  const exchange: Exchange = {
    getMidPrice: (s) => rest.getTicker(s),
    getBalances: () => rest.getBalances(),
    getOpenOrders: (s) => rest.getOpenOrders(s),
    getMyTrades: (s, since) => rest.getMyTrades(s, since),
    placeOrder: (q) => rest.placeOrder(q),
    cancelOrder: (s, id) => rest.cancelOrder(s, id),
    cancelAll: (s) => rest.cancelAll(s)
  };

  const sm = new BotStateMachine();
  log.info(
    { botId: bot.id, name: bot.name, symbol, tickMs },
    requestedBotId ? "starting runner (explicit bot id)" : "starting runner (latest bot)"
  );
  await runLoop({ botId: bot.id, symbol, exchange, mm, vol, risk, tickMs, sm });
}

main().catch((e) => {
  log.error({ err: String(e) }, "fatal");
  process.exit(1);
});
