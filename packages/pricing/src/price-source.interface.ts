import type { MidPrice } from "@mm/core";

export interface PriceSource {
  getMid(symbol: string): Promise<MidPrice>;
}