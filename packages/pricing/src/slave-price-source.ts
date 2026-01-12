import type { PriceSource } from "./price-source.interface.js";
import type { Exchange } from "@mm/exchange";
import type { MidPrice } from "@mm/core";

export class SlavePriceSource implements PriceSource {
  constructor(private readonly exchange: Exchange) {}
  getMid(symbol: string): Promise<MidPrice> {
    return this.exchange.getMidPrice(symbol);
  }
}