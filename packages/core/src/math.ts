export function clamp(x: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, x));
}

export function sum(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0);
}

export function normalizeWeights(ws: number[]): number[] {
  const s = sum(ws);
  if (s <= 0) return ws.map(() => 1 / ws.length);
  return ws.map((w) => w / s);
}

export function randBetween(min: number, max: number): number {
  return min + Math.random() * (max - min);
}