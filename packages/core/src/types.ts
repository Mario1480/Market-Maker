import type { Distribution, Side, OrderType, VolumeMode } from "./enums.js";

export type Money = number;

export interface MarketMakingConfig {
  spreadPct: number;
  stepPct: number;
  levelsUp: number;
  levelsDown: number;
  budgetQuoteUsdt: Money;
  budgetBaseToken: Money;
  distribution: Distribution;
  jitterPct: number;
  skewFactor: number;
  maxSkew: number;
}

export interface VolumeConfig {
  dailyNotionalUsdt: Money;
  minTradeUsdt: Money;
  maxTradeUsdt: Money;
  activeFrom: string; // "HH:mm"
  activeTo: string;   // "HH:mm"
  mode: VolumeMode;
}

export interface RiskConfig {
  minUsdt: Money;
  maxDeviationPct: number;
  maxOpenOrders: number;
  maxDailyLoss: Money;
}

export interface Quote {
  symbol: string;
  side: Side;
  type: OrderType;
  price?: number;
  qty: number;
  postOnly?: boolean;
  clientOrderId?: string;
}

export interface Order {
  id: string;
  symbol: string;
  side: Side;
  price: number;
  qty: number;
  status: "open" | "filled" | "canceled" | "rejected" | "unknown";
  clientOrderId?: string;
}

export interface Balance {
  asset: string;
  free: number;
  locked?: number;
}

export interface MidPrice {
  mid: number;
  bid?: number;
  ask?: number;
  ts: number;
}