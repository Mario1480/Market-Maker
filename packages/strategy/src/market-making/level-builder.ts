export function buildLevels(count: number) {
  return Array.from({ length: count }, (_, i) => i + 1);
}
