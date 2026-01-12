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
    const openByClient = new Map<string, Order>();
    for (const o of open) {
      if (o.clientOrderId) openByClient.set(o.clientOrderId, o);
    }

    const place: Quote[] = [];
    const keepIds = new Set<string>();

    for (const q of desired) {
      const k = key(q);
      const existing = q.clientOrderId ? openByClient.get(q.clientOrderId) : undefined;
      if (!existing) {
        place.push(q);
        continue;
      }

      keepIds.add(existing.id);

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
    for (const o of open) {
      // cancel any open not in desired set of clientOrderId keys
      if (o.clientOrderId && desired.some((q) => q.clientOrderId === o.clientOrderId)) {
        // might still be replaced: loop will cancel if needed based on place list
        continue;
      }
      // if no clientOrderId, we can be strict and cancel (keeps system clean)
      if (!o.clientOrderId) cancel.push(o);
      // else: if not desired, cancel
      if (o.clientOrderId && !desired.some((q) => q.clientOrderId === o.clientOrderId)) cancel.push(o);
    }

    log.debug({ cancel: cancel.length, place: place.length }, "order diff computed");
    return { cancel, place };
  }
}