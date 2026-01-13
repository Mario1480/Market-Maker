import crypto from "node:crypto";
import type { Balance, MidPrice, Order, Quote, Trade } from "@mm/core";
import { nowMs } from "@mm/core";
import { normalizeSymbol } from "./bitmart.mapper.js";
import { checkMins, normalizePrice, normalizeQty, type SymbolMeta } from "./bitmart.meta.js";

/**
 * Bitmart Spot docs: base url and signature:
 * X-BM-SIGN = HMAC_SHA256(secret, `${timestamp}#${memo}#${body}`)
 * Headers: X-BM-KEY, X-BM-TIMESTAMP, X-BM-SIGN
 */
export class BitmartRestClient {
  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string,
    private readonly apiSecret: string,
    private readonly apiMemo: string
  ) {}

  private readonly metaCache = new Map<string, { meta: SymbolMeta; ts: number }>();

  private async getSymbolMeta(symbol: string): Promise<SymbolMeta | undefined> {
    const s = normalizeSymbol(symbol);

    const cached = this.metaCache.get(s);
    if (cached && Date.now() - cached.ts < 10 * 60_000) return cached.meta;

    const candidates = [
      "/spot/v1/symbols/details",
      "/spot/v1/symbols"
    ];

    for (const path of candidates) {
      try {
        const url = new URL(path, this.baseUrl);
        const res = await fetch(url, { method: "GET" });
        const json: any = await res.json();

        if (!res.ok || (json?.code && json.code !== 1000)) continue;

        const list: any[] =
          json?.data?.symbols ??
          json?.data?.symbol_details ??
          json?.data ??
          [];

        const row = list.find((x) => (x.symbol ?? x.symbol_id ?? x.trading_pair) === s);
        if (!row) continue;

        const meta: SymbolMeta = {
          symbol: s,
          priceStep: Number(row.price_increment ?? row.price_min_increment ?? row.price_step ?? row.tick_size) || undefined,
          qtyStep: Number(row.base_increment ?? row.size_increment ?? row.qty_step ?? row.lot_size) || undefined,
          pricePrecision: Number(row.price_precision ?? row.pricePrecision) || undefined,
          qtyPrecision: Number(row.base_precision ?? row.basePrecision ?? row.size_precision ?? row.amount_precision) || undefined,
          minQty: Number(row.min_size ?? row.min_order_size ?? row.min_amount ?? row.minQty) || undefined,
          minNotional: Number(row.min_value ?? row.min_notional ?? row.minOrderValue ?? row.minBuyValue) || undefined
        };

        this.metaCache.set(s, { meta, ts: Date.now() });
        return meta;
      } catch {
        // try next endpoint
      }
    }

    return undefined;
  }

  private signBody(body: string, timestamp: number): string {
    const payload = `${timestamp}#${this.apiMemo}#${body}`;
    return crypto.createHmac("sha256", this.apiSecret).update(payload).digest("hex");
  }

  private async request<T>(
    method: "GET" | "POST",
    path: string,
    bodyObj?: any,
    auth: "NONE" | "KEYED" | "SIGNED" = "NONE"
  ): Promise<T> {
    const url = new URL(path, this.baseUrl);

    const headers: Record<string, string> = {
      "Content-Type": "application/json"
    };

    let body = "";
    if (bodyObj && (method === "POST")) {
      body = JSON.stringify(bodyObj);
    }

    if (auth === "KEYED" || auth === "SIGNED") {
      headers["X-BM-KEY"] = this.apiKey;
    }
    if (auth === "SIGNED") {
      const ts = nowMs();
      headers["X-BM-TIMESTAMP"] = String(ts);
      headers["X-BM-SIGN"] = this.signBody(body || "{}", ts);
      // Note: many Bitmart examples sign exact JSON string body. We keep "{}" if empty.
      if (!body) body = "{}";
    }

    const res = await fetch(url, {
      method,
      headers,
      body: method === "POST" ? body : undefined
    });

    const json = await res.json().catch(() => ({}));
    if (!res.ok || (json?.code && json.code !== 1000)) {
      const msg = json?.message || json?.msg || res.statusText;
      throw new Error(`Bitmart API error ${res.status}: ${msg} (${JSON.stringify(json)})`);
    }
    return json as T;
  }

  private async signedGet<T>(path: string, params?: Record<string, string | number | undefined>): Promise<T> {
    const url = new URL(path, this.baseUrl);
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        if (v === undefined) continue;
        url.searchParams.set(k, String(v));
      }
    }

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "X-BM-KEY": this.apiKey
    };
    const ts = nowMs();
    headers["X-BM-TIMESTAMP"] = String(ts);
    headers["X-BM-SIGN"] = this.signBody("{}", ts);

    const res = await fetch(url, { method: "GET", headers });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || (json?.code && json.code !== 1000)) {
      const msg = json?.message || json?.msg || res.statusText;
      throw new Error(`Bitmart API error ${res.status}: ${msg} (${JSON.stringify(json)})`);
    }
    return json as T;
  }

  // ---------- Public ----------

  async getTicker(symbol: string): Promise<MidPrice> {
    const s = normalizeSymbol(symbol);
    // /spot/quotation/v3/ticker?symbol=BTC_USDT
    const url = new URL("/spot/quotation/v3/ticker", this.baseUrl);
    url.searchParams.set("symbol", s);

    const res = await fetch(url, { method: "GET" });
    const json: any = await res.json();
    if (process.env.BITMART_DEBUG === "1") {
      const shape = Array.isArray(json?.data) ? "array" : typeof json?.data;
      console.log("[bitmart] ticker raw", JSON.stringify(json));
      console.log("[bitmart] ticker data shape", shape);
    }
    if (!res.ok || json?.code !== 1000) {
      throw new Error(`Ticker failed: ${json?.message || res.statusText}`);
    }
    const data = Array.isArray(json.data) ? json.data[0] ?? {} : json.data ?? {};
    let bid = Number(
      data.best_bid ??
        data.bestBid ??
        data.bid ??
        data.bid_price ??
        data.bidPrice ??
        0
    );
    let ask = Number(
      data.best_ask ??
        data.bestAsk ??
        data.ask ??
        data.ask_price ??
        data.askPrice ??
        0
    );
    const last = Number(
      data.last_price ??
        data.lastPrice ??
        data.last ??
        data.close ??
        data.price ??
        0
    );
    const mid =
      bid > 0 && ask > 0
        ? (bid + ask) / 2
        : last > 0
          ? last
          : NaN;

    if ((bid <= 0 || ask <= 0) && last > 0) {
      bid = last;
      ask = last;
      if (process.env.BITMART_DEBUG === "1") {
        console.log("[bitmart] bid/ask missing, fallback to last", { bid, ask, last, symbol: s });
      }
    }

    if (!Number.isFinite(mid) || mid <= 0) {
      throw new Error(`Ticker missing prices for ${s}`);
    }
    return { bid, ask, mid, ts: nowMs() };
  }

  // ---------- Private ----------

  async getBalances(): Promise<Balance[]> {
    const endpoints = [
      "/account/v1/wallet",
      "/account/v2/wallet",
      "/spot/v1/wallet"
    ];

    let lastErr: unknown = null;
    for (const path of endpoints) {
      try {
        const json: any = await this.request("GET", path, undefined, "KEYED");
        const arr: any[] =
          json?.data?.wallet ??
          json?.data?.list ??
          json?.data?.balances ??
          json?.data?.result ??
          json?.data ??
          [];

        if (!Array.isArray(arr) || arr.length === 0) continue;

        return arr.map((x) => ({
          asset: String(x.id || x.currency || x.coin_name || x.symbol || x.asset || x.coin),
          free: Number(
            x.available ??
              x.available_balance ??
              x.available_amount ??
              x.availableBalance ??
              x.free ??
              0
          ),
          locked: Number(
            x.frozen ??
              x.frozen_balance ??
              x.frozen_amount ??
              x.locked ??
              0
          )
        }));
      } catch (e) {
        lastErr = e;
      }
    }

    if (lastErr) throw lastErr;
    return [];
  }

  async placeOrder(q: Quote): Promise<Order> {
    const symbol = normalizeSymbol(q.symbol);
    const meta = await this.getSymbolMeta(symbol);
    if (q.type !== "limit" && q.type !== "market") {
      throw new Error("Unsupported order type");
    }

    // Bitmart spot: /spot/v2/submit_order (SIGNED)
    // body fields (typical): symbol, side, type, price, size
    const body: any = {
      symbol,
      side: q.side,
      type: q.type
    };
    if (q.type === "limit") {
      if (!q.price) throw new Error("limit order requires price");

      const price0 = q.price;
      const qty0 = q.qty;

      const price = normalizePrice(price0, meta);
      const qty = normalizeQty(qty0, meta);

      if (meta && (price !== price0 || qty !== qty0)) {
        console.warn(`[bitmart] normalized ${symbol} ${q.side} price ${price0}→${price}, qty ${qty0}→${qty}`);
      }

      const mins = checkMins({ price, qty, meta });
      if (!mins.ok) {
        throw new Error(`[bitmart] order below minimums: ${mins.reason}`);
      }

      body.price = String(price);
      body.size = String(qty);
    } else {
      const qty0 = q.qty;
      const qty = normalizeQty(qty0, meta);

      if (meta && qty !== qty0) {
        console.warn(`[bitmart] normalized ${symbol} market ${q.side} qty ${qty0}→${qty}`);
      }

      if (meta?.minQty && qty < meta.minQty) {
        throw new Error(`[bitmart] market order below minQty: ${qty} < ${meta.minQty}`);
      }

      body.size = String(qty);
    }

    // Post-only: Bitmart uses `post_only` or `postOnly` depending on version.
    // We'll include both defensively (server ignores unknown).
    if (q.postOnly) {
      body.post_only = true;
      body.postOnly = true;
    }
    if (q.clientOrderId) body.client_order_id = q.clientOrderId;

    const json: any = await this.request("POST", "/spot/v2/submit_order", body, "SIGNED");
    const orderId = String(json.data?.order_id ?? json.data?.orderId ?? "");
    return {
      id: orderId,
      symbol,
      side: q.side,
      price: q.price ?? 0,
      qty: q.qty,
      status: "open",
      clientOrderId: q.clientOrderId
    };
  }

  async cancelOrder(symbol: string, orderId: string): Promise<void> {
    const s = normalizeSymbol(symbol);
    // Bitmart cancel v3: /spot/v3/cancel_order (SIGNED)
    await this.request("POST", "/spot/v3/cancel_order", { symbol: s, order_id: orderId }, "SIGNED");
  }

  async cancelAll(symbol?: string, side?: "buy" | "sell"): Promise<void> {
    // /spot/v4/cancel_all (SIGNED)
    const body: any = {};
    if (symbol) body.symbol = normalizeSymbol(symbol);
    if (side) body.side = side;
    await this.request("POST", "/spot/v4/cancel_all", body, "SIGNED");
  }

  async getOpenOrders(symbol: string): Promise<Order[]> {
    const s = normalizeSymbol(symbol);
    // v4 open orders: POST /spot/v4/query/open-orders (SIGNED)
    const now = nowMs();
    const json: any = await this.request(
      "POST",
      "/spot/v4/query/open-orders",
      {
        symbol: s,
        orderMode: "spot",
        // Use a wider window so open orders don't disappear from results after 60s.
        startTime: now - 24 * 60 * 60 * 1000,
        endTime: now + 5_000,
        limit: 100,
        recvWindow: 5000
      },
      "SIGNED"
    );

    const list: any[] = json.data?.orders ?? json.data ?? [];
    return list.map((x) => ({
      id: String(x.orderId ?? x.order_id ?? x.id),
      symbol: s,
      side: (String(x.side).toLowerCase() === "buy" ? "buy" : "sell"),
      price: Number(x.price),
      qty: Number(x.size ?? x.qty ?? x.amount ?? 0),
      status: "open",
      clientOrderId: x.clientOrderId
    }));
  }

  async getMyTrades(symbol: string, since?: string | number): Promise<Trade[]> {
    const s = normalizeSymbol(symbol);
    const startTime =
      typeof since === "number" && Number.isFinite(since) ? Math.floor(since) : undefined;
    const attempts = [
      {
        kind: "POST" as const,
        path: "/spot/v4/query/user-trades",
        body: { symbol: s, limit: 50, start_time: startTime }
      },
      {
        kind: "GET" as const,
        path: "/spot/v1/trades",
        params: { symbol: s, limit: 50, start_time: startTime }
      }
    ];

    let lastErr: unknown = null;

    for (const attempt of attempts) {
      try {
        const json: any =
          attempt.kind === "POST"
            ? await this.request("POST", attempt.path, attempt.body, "SIGNED")
            : await this.signedGet(attempt.path, attempt.params);

        const list: any[] =
          json?.data?.trades ??
          json?.data?.rows ??
          json?.data?.records ??
          json?.data ??
          [];

        if (!Array.isArray(list)) return [];

        return list
          .map((t) => {
            const id = String(t.trade_id ?? t.tradeId ?? t.id ?? "");
            if (!id) return null;
            const orderId = t.order_id ?? t.orderId ?? t.order_id;
            const clientOrderId = t.client_order_id ?? t.clientOrderId ?? t.clientOrderID ?? undefined;
            const side = (t.side ?? t.order_side ?? "").toLowerCase();
            const price = Number(t.price ?? t.order_price ?? t.fill_price);
            const qty = Number(t.size ?? t.qty ?? t.amount ?? t.fill_size);
            const quoteQty = Number(t.notional ?? t.quote_qty ?? t.quoteQty ?? t.filled_notional);
            const ts = Number(t.create_time ?? t.createTime ?? t.timestamp ?? t.time ?? t.ts);
            return {
              id,
              orderId: orderId ? String(orderId) : undefined,
              clientOrderId: clientOrderId ? String(clientOrderId) : undefined,
              side: side === "buy" ? "buy" : "sell",
              price,
              qty,
              quoteQty: Number.isFinite(quoteQty) ? quoteQty : undefined,
              timestamp: Number.isFinite(ts) ? ts : Date.now()
            } as Trade;
          })
          .filter(Boolean) as Trade[];
      } catch (e) {
        lastErr = e;
        if (String(e).includes("404")) {
          continue;
        }
        throw e;
      }
    }

    if (lastErr) {
      return [];
    }

    return [];
  }
}
