// Bitmart uses symbols like BTC_USDT (underscore).
export function normalizeSymbol(symbol: string): string {
  // accept USHARK/USDT or USHARK_USDT
  return symbol.includes("/") ? symbol.replace("/", "_") : symbol;
}

// naive asset split for spot pairs BASE_QUOTE
export function splitSymbol(symbolUnderscore: string): { base: string; quote: string } {
  const [base, quote] = symbolUnderscore.split("_");
  return { base, quote };
}