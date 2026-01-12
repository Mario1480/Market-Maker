export interface PriceSource {
  getPrice(symbol: string): Promise<number>;
}
