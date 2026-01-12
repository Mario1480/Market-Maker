import { PriceSource } from "./price-source.interface";

export class SlavePriceSource implements PriceSource {
  async getPrice(_symbol: string) {
    return 0;
  }
}
