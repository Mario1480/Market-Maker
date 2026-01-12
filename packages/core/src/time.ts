export function nowMs(): number {
  return Date.now();
}

export function hhmmNow(): string {
  const d = new Date();
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

export function isWithinWindow(nowHHMM: string, from: string, to: string): boolean {
  // assumes same-day window, from <= to
  return nowHHMM >= from && nowHHMM <= to;
}