type LiveViewProps = {
  runtime: any;
  baseSymbol?: string;
};

export function LiveView({ runtime, baseSymbol }: LiveViewProps) {
  const baseLabel = baseSymbol ? `Free ${baseSymbol}` : "Free base";
  const staleness = getStaleness(runtime);
  const hint = buildHint(runtime, staleness);
  const offline = !runtime || staleness.stale;
  return (
    <Section
      title="Live Runtime"
      right={
        offline ? (
          <span
            className="badge"
            style={{
              borderColor: "#ef4444",
              color: "#fca5a5"
            }}
          >
            <span className="badgeDot" style={{ background: "#ef4444" }} />
            Offline
          </span>
        ) : null
      }
    >
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

function Section(props: { title: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="card" style={{ padding: 12, marginBottom: 12 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <h3 style={{ margin: 0 }}>{props.title}</h3>
        {props.right}
      </div>
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

function getStaleness(runtime: any) {
  const updated = runtime?.updatedAt ? new Date(runtime.updatedAt).getTime() : NaN;
  if (!Number.isFinite(updated)) return { stale: false, ageMs: null as number | null };
  const ageMs = Date.now() - updated;
  return { stale: ageMs > 15_000, ageMs };
}

function buildHint(runtime: any, staleness: { stale: boolean; ageMs: number | null }): string | null {
  if (!runtime) return "Runner not started.";

  if (staleness.stale && staleness.ageMs !== null) {
    const secs = Math.round(staleness.ageMs / 1000);
    return `No fresh data (${secs}s). Runner may be stopped or stalled.`;
  }

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
