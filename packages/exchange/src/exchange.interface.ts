export type ExchangeOrder = {
  id: string;
  price: number;
  size: number;
};

export interface ExchangeClient {
  placeOrder(order: ExchangeOrder): Promise<string>;
}
