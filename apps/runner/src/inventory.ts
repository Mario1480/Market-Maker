export type Inventory = {
  base: number;
  quote: number;
};

export function emptyInventory(): Inventory {
  return { base: 0, quote: 0 };
}
