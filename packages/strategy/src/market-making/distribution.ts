export function linearDistribution(count: number) {
  return Array.from({ length: count }, (_, i) => i / count);
}
