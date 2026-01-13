import type { Balance, MidPrice, Order, Quote, Trade } from "@mm/core";

export interface ExchangePublic {
  getMidPrice(symbol: string): Promise<MidPrice>;
  // Optional: WS streaming can be added later; runner can poll.
}

export interface ExchangePrivate {
  getBalances(): Promise<Balance[]>;
  getOpenOrders(symbol: string): Promise<Order[]>;
  placeOrder(q: Quote): Promise<Order>;
  cancelOrder(symbol: string, orderId: string): Promise<void>;
  cancelAll(symbol?: string, side?: "buy" | "sell"): Promise<void>;
  getMyTrades(symbol: string, since?: string | number): Promise<Trade[]>;
}

export interface Exchange extends ExchangePublic, ExchangePrivate {}
