import WebSocket from "ws";
import { nowMs } from "@mm/core";
import { normalizeSymbol } from "./bitmart.mapper.js";

type DepthEvent = {
  type: "snapshot" | "update";
  ts: number;
  bids: [string, string][];
  asks: [string, string][];
};

export class BitmartPublicWs {
  private ws?: WebSocket;
  private isReady = false;

  constructor(private readonly wsUrl: string) {}

  connect(onDepth: (symbol: string, ev: DepthEvent) => void): void {
    this.ws = new WebSocket(this.wsUrl);

    this.ws.on("open", () => {
      this.isReady = true;
    });

    this.ws.on("message", (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        // Bitmart WS messages vary by channel; we keep it permissive.
        // Expected: { table: "...", data: { ... } } or { data: {...}, type: "snapshot" }
        const table = msg?.table || msg?.topic;
        const data = msg?.data || msg?.result?.data || msg?.result;

        if (table && String(table).includes("spot/depth")) {
          const symbol = data?.symbol || data?.symbolId || data?.s;
          if (!symbol) return;

          const bids = (data?.bids ?? []).map((x: any) => [String(x[0]), String(x[1])] as [string, string]);
          const asks = (data?.asks ?? []).map((x: any) => [String(x[0]), String(x[1])] as [string, string]);

          onDepth(symbol, {
            type: (msg?.type === "snapshot" ? "snapshot" : "update"),
            ts: nowMs(),
            bids,
            asks
          });
        }
      } catch {
        // ignore parse errors
      }
    });

    this.ws.on("close", () => {
      this.isReady = false;
      // simple reconnect
      setTimeout(() => this.connect(onDepth), 1500);
    });

    this.ws.on("error", () => {
      // handled by close -> reconnect
    });
  }

  subscribeDepth(symbol: string, depth: 5 | 20 | 50 = 20): void {
    if (!this.ws || !this.isReady) return;
    const s = normalizeSymbol(symbol);
    // per docs: args like "spot/depth20:BTC_USDT" or increase channel
    const channel = `spot/depth${depth}:${s}`;
    this.ws.send(JSON.stringify({ op: "subscribe", args: [channel] }));
    // optional request snapshot:
    this.ws.send(JSON.stringify({ op: "request", args: [channel] }));
  }

  close(): void {
    this.ws?.close();
  }
}