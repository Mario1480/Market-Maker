import "dotenv/config";
import { BitmartRestClient } from "@mm/exchange";
import type { Exchange } from "@mm/exchange";
import { BotStateMachine } from "./state-machine.js";
import { runLoop } from "./loop.js";
import { log } from "./logger.js";
import { loadBotAndConfigs } from "./db.js";

function mustEnv(k: string): string {
  const v = process.env[k];
  if (!v) throw new Error(`Missing env: ${k}`);
  return v;
}

async function main() {
  const botId = mustEnv("RUNNER_BOT_ID");
  const tickMs = Number(process.env.RUNNER_TICK_MS || "800");

  const { bot, mm, vol, risk } = await loadBotAndConfigs(botId);
  const symbol = bot.symbol;

  const rest = new BitmartRestClient(
    mustEnv("BITMART_BASE_URL"),
    mustEnv("BITMART_API_KEY"),
    mustEnv("BITMART_API_SECRET"),
    mustEnv("BITMART_API_MEMO")
  );

  const exchange: Exchange = {
    getMidPrice: (s) => rest.getTicker(s),
    getBalances: () => rest.getBalances(),
    getOpenOrders: (s) => rest.getOpenOrders(s),
    placeOrder: (q) => rest.placeOrder(q),
    cancelOrder: (s, id) => rest.cancelOrder(s, id),
    cancelAll: (s) => rest.cancelAll(s)
  };

  const sm = new BotStateMachine();
  log.info({ botId, symbol, tickMs }, "starting runner");
  await runLoop({ botId, symbol, exchange, mm, vol, risk, tickMs, sm });
}

main().catch((e) => {
  log.error({ err: String(e) }, "fatal");
  process.exit(1);
});