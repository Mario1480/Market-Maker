import { IncomingMessage, ServerResponse } from "http";
import { handleBots } from "./bots";
import { handleOrders } from "./orders";
import { handleBalances } from "./balances";
import { handleHealth } from "./health";

export function routeRequest(req: IncomingMessage, res: ServerResponse) {
  const url = req.url || "/";
  if (url.startsWith("/health")) {
    return sendJson(res, handleHealth());
  }
  if (url.startsWith("/bots")) {
    return sendJson(res, handleBots());
  }
  if (url.startsWith("/orders")) {
    return sendJson(res, handleOrders());
  }
  if (url.startsWith("/balances")) {
    return sendJson(res, handleBalances());
  }

  res.statusCode = 404;
  res.end("not found");
}

function sendJson(res: ServerResponse, payload: unknown) {
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify(payload));
}
