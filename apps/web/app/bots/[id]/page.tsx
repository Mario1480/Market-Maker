"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ApiError, apiDel, apiGet, apiPost } from "../../../lib/api";

type Order = {
  id: string;
  side: string;
  price: number;
  qty: number;
  clientOrderId?: string | null;
  createdAt?: string | null;
};

type AlertItem = {
  id: string;
  level: string;
  title: string;
  message?: string | null;
  createdAt: string;
};

export default function BotOverviewPage() {
  const params = useParams();
  const id = params.id as string;

  const [bot, setBot] = useState<any>(null);
  const [rt, setRt] = useState<any>(null);
  const [orders, setOrders] = useState<{ mm: Order[]; vol: Order[]; other: Order[] } | null>(null);
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [toast, setToast] = useState<{ type: "error" | "success"; msg: string } | null>(null);

  function showToast(type: "error" | "success", msg: string) {
    setToast({ type, msg });
    window.setTimeout(() => setToast(null), 3000);
  }

  function errMsg(e: any): string {
    if (e instanceof ApiError) return `${e.message} (HTTP ${e.status})`;
    return e?.message ? String(e.message) : String(e);
  }

  async function loadBot() {
    try {
      const b = await apiGet<any>(`/bots/${id}`);
      setBot(b);
    } catch (e) {
      showToast("error", errMsg(e));
    }
  }

  async function loadRuntime() {
    try {
      const r = await apiGet<any>(`/bots/${id}/runtime`);
      setRt(r);
    } catch (e) {
      if (!rt) showToast("error", errMsg(e));
    }
  }

  async function loadOrders() {
    try {
      const o = await apiGet<any>(`/bots/${id}/open-orders`);
      setOrders(o);
    } catch (e) {
      showToast("error", errMsg(e));
    }
  }

  async function loadAlerts() {
    try {
      const a = await apiGet<AlertItem[]>(`/bots/${id}/alerts?limit=10`);
      setAlerts(a);
    } catch (e) {
      showToast("error", errMsg(e));
    }
  }

  async function clearAlerts() {
    try {
      await apiDel(`/bots/${id}/alerts`);
      showToast("success", "Alerts cleared");
      await loadAlerts();
    } catch (e) {
      showToast("error", errMsg(e));
    }
  }

  useEffect(() => {
    if (!id) return;
    loadBot();
    loadRuntime();
    loadOrders();
    loadAlerts();
    const t1 = setInterval(loadRuntime, 1200);
    const t2 = setInterval(loadOrders, 4000);
    const t3 = setInterval(loadAlerts, 5000);
    return () => {
      clearInterval(t1);
      clearInterval(t2);
      clearInterval(t3);
    };
  }, [id]);

  async function startMm() {
    try {
      await apiPost(`/bots/${id}/mm/start`);
      showToast("success", "Market Making started");
      await loadBot();
    } catch (e) {
      showToast("error", errMsg(e));
    }
  }

  async function stopMm() {
    try {
      await apiPost(`/bots/${id}/mm/stop`);
      showToast("success", "Market Making stopped");
      await loadBot();
    } catch (e) {
      showToast("error", errMsg(e));
    }
  }

  async function startVol() {
    try {
      await apiPost(`/bots/${id}/vol/start`);
      showToast("success", "Volume bot started");
      await loadBot();
    } catch (e) {
      showToast("error", errMsg(e));
    }
  }

  async function stopVol() {
    try {
      await apiPost(`/bots/${id}/vol/stop`);
      showToast("success", "Volume bot stopped");
      await loadBot();
    } catch (e) {
      showToast("error", errMsg(e));
    }
  }

  const openAll = useMemo(() => {
    if (!orders) return [];
    return [...orders.mm, ...orders.vol, ...orders.other];
  }, [orders]);

  const baseSymbol = useMemo(() => {
    const raw = bot?.symbol ? String(bot.symbol) : "";
    return raw.split("_")[0] || "Base";
  }, [bot]);

  const asks = useMemo(() => {
    return openAll
      .filter((o) => o.side === "sell")
      .sort((a, b) => Number(a.price) - Number(b.price));
  }, [openAll]);

  const bids = useMemo(() => {
    return openAll
      .filter((o) => o.side === "buy")
      .sort((a, b) => Number(b.price) - Number(a.price));
  }, [openAll]);

  if (!bot) return <div>Loading…</div>;

  return (
    <div>
      <h2 style={{ margin: 0, textAlign: "center" }}>Overview</h2>
      <div style={{ marginBottom: 10, marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
        <Link href="/" className="btn">
          ← Back to dashboard
        </Link>
        <Link href={`/bots/${id}/settings`} className="btn">
          Settings →
        </Link>
      </div>

      {toast ? (
        <div
          style={{
            marginBottom: 12,
            padding: "10px 12px",
            borderRadius: 8,
            border: toast.type === "error" ? "1px solid #ef4444" : "1px solid var(--brand)",
            background: toast.type === "error" ? "rgba(239,68,68,0.12)" : "rgba(20,129,192,0.16)",
            color: "#e8eef7",
            fontSize: 13
          }}
        >
          <b style={{ marginRight: 8 }}>{toast.type === "error" ? "Error" : "OK"}</b>
          {toast.msg}
        </div>
      ) : null}

      <div className="adminHeader" style={{ marginBottom: 12 }}>
        <div>
          <h2 style={{ margin: 0 }}>{bot.name}</h2>
          <div style={{ fontSize: 12, color: "var(--muted)" }}>
            {bot.exchange} · {bot.symbol}
          </div>
          <div style={{ fontSize: 12, marginTop: 6 }}>
            Bot status: <b>{bot.status}</b>
            {rt?.status ? (
              <>
                {" "}
                · Runtime: <b>{rt.status}</b>
                {rt.reason ? <span style={{ color: "var(--muted)" }}> — {rt.reason}</span> : null}
              </>
            ) : null}
          </div>
        </div>
        <div className="card" style={{ padding: 10, minWidth: 260 }}>
          <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 8 }}>
            Strategy controls (MM and Volume run independently)
          </div>
          <div style={{ display: "grid", gap: 8 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
              <span style={{ fontSize: 12 }}>Market Making</span>
              <div style={{ display: "flex", gap: 6 }}>
                <button
                  className={`btn btnStart ${bot.mmEnabled ? "btnDisabled" : ""}`}
                  onClick={startMm}
                  disabled={bot.mmEnabled}
                >
                  Start
                </button>
                <button
                  className={`btn btnStop ${!bot.mmEnabled ? "btnDisabled" : ""}`}
                  onClick={stopMm}
                  disabled={!bot.mmEnabled}
                >
                  Stop
                </button>
              </div>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
              <span style={{ fontSize: 12 }}>Volume Bot</span>
              <div style={{ display: "flex", gap: 6 }}>
                <button
                  className={`btn btnStart ${bot.volEnabled ? "btnDisabled" : ""}`}
                  onClick={startVol}
                  disabled={bot.volEnabled}
                >
                  Start
                </button>
                <button
                  className={`btn btnStop ${!bot.volEnabled ? "btnDisabled" : ""}`}
                  onClick={stopVol}
                  disabled={!bot.volEnabled}
                >
                  Stop
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="overviewGrid">
        <section className="card" style={{ padding: 12, overflow: "hidden" }}>
          <h3 style={{ marginTop: 0 }}>Budget</h3>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div className="card" style={{ padding: 10 }}>
              <div className="adminMeta">Free {baseSymbol}</div>
              <div style={{ fontSize: 18, fontWeight: 700 }}>{rt?.freeBase ?? "—"}</div>
              <div className="adminMeta" style={{ marginTop: 6 }}>Required {baseSymbol}</div>
              <div style={{ fontSize: 14, fontWeight: 700 }}>{bot.mmConfig?.budgetBaseToken ?? "—"}</div>
            </div>
            <div className="card" style={{ padding: 10 }}>
              <div className="adminMeta">Free USDT</div>
              <div style={{ fontSize: 18, fontWeight: 700 }}>{rt?.freeUsdt ?? "—"}</div>
              <div className="adminMeta" style={{ marginTop: 6 }}>Required USDT</div>
              <div style={{ fontSize: 14, fontWeight: 700 }}>{bot.mmConfig?.budgetQuoteUsdt ?? "—"}</div>
            </div>
          </div>
        </section>

        <section className="card" style={{ padding: 12 }}>
          <h3 style={{ marginTop: 0 }}>Live Runtime</h3>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <Kv k="Mid price" v={rt?.mid} />
            <Kv k="Best bid" v={rt?.bid} />
            <Kv k="Best ask" v={rt?.ask} />
            <Kv k="Open orders (total)" v={rt?.openOrders} />
            <Kv k="Open orders (MM)" v={rt?.openOrdersMm} />
            <Kv k="Open orders (Volume)" v={rt?.openOrdersVol} />
            <Kv k="Traded notional today" v={rt?.tradedNotionalToday} />
            <Kv k="Updated at" v={formatUpdated(rt?.updatedAt)} />
          </div>
          {rt ? (
            <details style={{ marginTop: 10 }}>
              <summary style={{ cursor: "pointer" }}>Raw runtime JSON</summary>
              <pre style={{ marginTop: 8, whiteSpace: "pre-wrap" }}>{JSON.stringify(rt, null, 2)}</pre>
            </details>
          ) : null}
        </section>
      </div>

      <div className="overviewGrid" style={{ marginTop: 16 }}>
        <section className="card" style={{ padding: 12 }}>
          <h3 style={{ marginTop: 0 }}>Live Orders</h3>
          <div style={{ textAlign: "center", fontSize: 12, color: "var(--muted)", marginBottom: 6 }}>
            Mid: {rt?.mid ?? "—"}
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 12,
              alignItems: "start"
            }}
          >
            <OrderTable title="Asks" rows={asks} accent="#ef4444" />
            <OrderTable title="Bids" rows={bids} accent="#22c55e" />
          </div>
        </section>

        <section className="card" style={{ padding: 12 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
            <h3 style={{ marginTop: 0 }}>Recent Alerts</h3>
            <button className="btn" onClick={clearAlerts} disabled={alerts.length === 0}>
              Clear alerts
            </button>
          </div>
          {alerts.length === 0 ? (
            <div style={{ fontSize: 12, color: "var(--muted)" }}>No alerts yet.</div>
          ) : (
            <div style={{ display: "grid", gap: 8 }}>
              {alerts.slice(0, 10).map((a) => (
                <div key={a.id} className="card" style={{ padding: 8 }}>
                  <div style={{ fontSize: 12, color: "var(--muted)" }}>{formatUpdated(a.createdAt)}</div>
                  <div style={{ fontWeight: 700 }}>{a.title}</div>
                  {a.message ? <div style={{ fontSize: 12, color: "var(--muted)" }}>{a.message}</div> : null}
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
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

function OrderTable({ title, rows, accent }: { title: string; rows: Order[]; accent: string }) {
  return (
    <div className="card" style={{ padding: 10, borderColor: accent, minWidth: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <span style={{ width: 8, height: 8, borderRadius: 999, background: accent }} />
        <div style={{ fontSize: 12, fontWeight: 700 }}>{title}</div>
        <div style={{ marginLeft: "auto", fontSize: 11, color: "var(--muted)" }}>
          {rows.length} open
        </div>
      </div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, tableLayout: "fixed" }}>
          <thead>
            <tr>
              <th style={{ textAlign: "left", color: "var(--muted)", fontWeight: 600, width: "38%" }}>
                Price (USDT)
              </th>
              <th style={{ textAlign: "right", color: "var(--muted)", fontWeight: 600, width: "32%" }}>
                Amount
              </th>
              <th style={{ textAlign: "right", color: "var(--muted)", fontWeight: 600, width: "30%" }}>
                Total
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={3} style={{ color: "var(--muted)", paddingTop: 8 }}>No open orders</td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id} style={{ borderTop: "1px solid rgba(255,255,255,.06)" }}>
                  <td style={{ paddingTop: 6, paddingBottom: 6, overflow: "hidden", textOverflow: "ellipsis" }}>
                    {formatNum(r.price)}
                  </td>
                  <td style={{ textAlign: "right", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {formatNum(r.qty)}
                  </td>
                  <td style={{ textAlign: "right", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {formatNum(r.price * r.qty, 3)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function formatNum(v: any, maxDecimals = 8) {
  if (v === null || v === undefined || Number.isNaN(Number(v))) return "—";
  return Number(v).toFixed(maxDecimals).replace(/\.?0+$/, "");
}

function formatUpdated(value: any) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString();
}
