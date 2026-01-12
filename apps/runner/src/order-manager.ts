import type { Order, Quote } from "@mm/core";
import { log } from "./logger.js";

function key(q: Quote): string {
  // stable key per level via clientOrderId
  return q.clientOrderId ?? `${q.side}-${q.price?.toFixed(8)}-${q.qty.toFixed(8)}`;
}

export class OrderManager {
  constructor(
    private readonly opts: {
      priceEpsPct: number; // replace if price changed more than eps
      qtyEpsPct: number;
    }
  ) {}

  diff(desired: Quote[], open: Order[]): { cancel: Order[]; place: Quote[] } {
    const openManaged = open.filter((o) => (o.clientOrderId ?? "").startsWith("mm-"));

    const openByClient = new Map<string, Order>();
    for (const o of openManaged) {
      if (o.clientOrderId) openByClient.set(o.clientOrderId, o);
    }

    const place: Quote[] = [];

    for (const q of desired) {
      const existing = q.clientOrderId ? openByClient.get(q.clientOrderId) : undefined;
      if (!existing) {
        place.push(q);
        continue;
      }

      // replace if price/qty drifted materially
      const priceChanged =
        q.price && existing.price
          ? Math.abs(q.price - existing.price) / existing.price > this.opts.priceEpsPct
          : false;

      const qtyChanged = Math.abs(q.qty - existing.qty) / (existing.qty || 1) > this.opts.qtyEpsPct;

      if (priceChanged || qtyChanged) {
        // cancel old, place new
        // We will cancel by orderId in loop (not here)
        place.push(q);
      }
    }

    const cancel: Order[] = [];
    for (const o of openManaged) {
      // cancel any open not in desired set of clientOrderId keys
      if (o.clientOrderId && desired.some((q) => q.clientOrderId === o.clientOrderId)) {
        // might still be replaced: loop will cancel if needed based on place list
        continue;
      }
      // else: if not desired, cancel
      if (o.clientOrderId && !desired.some((q) => q.clientOrderId === o.clientOrderId)) cancel.push(o);
    }

    log.debug({ cancel: cancel.length, place: place.length }, "order diff computed");
    return { cancel, place };
  }
}