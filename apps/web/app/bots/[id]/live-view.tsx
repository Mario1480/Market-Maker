type LiveViewProps = {
  runtime: any;
  baseSymbol?: string;
};

export function LiveView({ runtime, baseSymbol }: LiveViewProps) {
  const baseLabel = baseSymbol ? `Free ${baseSymbol}` : "Free base";
  const hint = buildHint(runtime);
  return (
    <Section title="Live Snapshot">
      {!runtime ? (
        <div style={{ fontSize: 12, opacity: 0.8 }}>No runtime yet (runner not started?)</div>
      ) : (
        <>
          {hint ? (
            <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 8 }}>
              {hint}
            </div>
          ) : null}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <Kv k="Mid price" v={runtime.mid} />
            <Kv k="Best bid" v={runtime.bid} />
            <Kv k="Best ask" v={runtime.ask} />
            <Kv k="Open orders (total)" v={runtime.openOrders} />
            <Kv k="Open orders (MM)" v={runtime.openOrdersMm} />
            <Kv k="Open orders (Volume)" v={runtime.openOrdersVol} />
            <Kv k="Last volume order" v={runtime.lastVolClientOrderId} />
            <Kv k="Free USDT" v={runtime.freeUsdt} />
            <Kv k={baseLabel} v={runtime.freeBase} />
            <Kv k="Traded notional today" v={runtime.tradedNotionalToday} />
            <Kv k="Updated at" v={formatUpdated(runtime.updatedAt)} />
          </div>

          <details style={{ marginTop: 10 }}>
            <summary style={{ cursor: "pointer" }}>Raw runtime JSON</summary>
            <pre style={{ marginTop: 8, whiteSpace: "pre-wrap" }}>{JSON.stringify(runtime, null, 2)}</pre>
          </details>
        </>
      )}
    </Section>
  );
}

function Section(props: { title: string; children: React.ReactNode }) {
  return (
    <section className="card" style={{ padding: 12 }}>
      <h3 style={{ marginTop: 0 }}>{props.title}</h3>
      {props.children}
    </section>
  );
}

function Kv(props: { k: string; v: any }) {
  return (
    <div className="card" style={{ padding: "8px 10px" }}>
      <div style={{ fontSize: 11, opacity: 0.7 }}>{props.k}</div>
      <div style={{ fontSize: 13, fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" }}>
        {props.v === null || props.v === undefined ? "—" : String(props.v)}
      </div>
    </div>
  );
}

function formatUpdated(value: any) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString();
}

function buildHint(runtime: any): string | null {
  if (!runtime) return "Runner not started.";

  if (runtime.status === "PAUSED" && runtime.reason) {
    return `Paused: ${runtime.reason}`;
  }
  if (runtime.status === "STOPPED" && runtime.reason) {
    return `Stopped: ${runtime.reason}`;
  }
  if (runtime.status === "ERROR" && runtime.reason) {
    return `Error: ${runtime.reason}`;
  }

  if (!runtime.mid) {
    return "No market data yet. Check if the runner is running and the exchange provides bid/ask.";
  }
  return null;
}
