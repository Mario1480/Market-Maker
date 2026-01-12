"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ApiError, apiGet, apiPost, apiPut } from "../../../lib/api";

export default function BotPage() {
  const params = useParams();
  const id = params.id as string; // ✅ korrekt für Next 15

  const [bot, setBot] = useState<any>(null);
  const [rt, setRt] = useState<any>(null);
  const [saving, setSaving] = useState("");

  const [mm, setMm] = useState<any>(null);
  const [vol, setVol] = useState<any>(null);
  const [risk, setRisk] = useState<any>(null);

  const [toast, setToast] = useState<{ type: "error" | "success"; msg: string } | null>(null);
  const [baseline, setBaseline] = useState<{ mm: any; vol: any; risk: any } | null>(null);

  function showToast(type: "error" | "success", msg: string) {
    setToast({ type, msg });
    window.setTimeout(() => setToast(null), 3000);
  }

  function errMsg(e: any): string {
    if (e instanceof ApiError) return `${e.message} (HTTP ${e.status})`;
    return e?.message ? String(e.message) : String(e);
  }

  async function loadAll() {
    try {
      const b = await apiGet<any>(`/bots/${id}`);
      setBot(b);
      setMm(b.mmConfig);
      setVol(b.volConfig);
      setRisk(b.riskConfig);
      setBaseline({ mm: b.mmConfig, vol: b.volConfig, risk: b.riskConfig });
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

  useEffect(() => {
    if (!id) return;
    loadAll();
    loadRuntime();
    const t = setInterval(loadRuntime, 1200);
    return () => clearInterval(t);
  }, [id]);

  const ready = useMemo(() => !!(mm && vol && risk && baseline), [mm, vol, risk, baseline]);
  const dirty = useMemo(() => {
    if (!baseline || !mm || !vol || !risk) return false;
    // simple deep compare via stable JSON stringify
    const a = JSON.stringify({ mm, vol, risk });
    const b = JSON.stringify(baseline);
    return a !== b;
  }, [baseline, mm, vol, risk]);

  const canSave = ready && dirty && saving !== "saving...";

  async function save() {
    if (!canSave) return;
    try {
      setSaving("saving...");
      await apiPut(`/bots/${id}/config`, { mm, vol, risk });
      setBaseline({ mm, vol, risk });
      setSaving("saved");
      showToast("success", "Config saved");
      setTimeout(() => setSaving(""), 1200);
    } catch (e) {
      setSaving("");
      showToast("error", errMsg(e));
    }
  }

  async function start() {
    try {
      await apiPost(`/bots/${id}/start`);
      showToast("success", "Bot started");
      await loadAll();
    } catch (e) {
      showToast("error", errMsg(e));
    }
  }
  async function pause() {
    try {
      await apiPost(`/bots/${id}/pause`);
      showToast("success", "Bot paused");
      await loadAll();
    } catch (e) {
      showToast("error", errMsg(e));
    }
  }
  async function stop() {
    try {
      await apiPost(`/bots/${id}/stop`);
      showToast("success", "Bot stopped");
      await loadAll();
    } catch (e) {
      showToast("error", errMsg(e));
    }
  }

  if (!bot || !mm || !vol || !risk) return <div>Loading…</div>;

  return (
    <div>
      <div style={{ marginBottom: 10 }}>
        <Link href="/" style={{ fontSize: 13 }}>
          ← Back to dashboard
        </Link>
      </div>
      {toast ? (
        <div
          style={{
            marginBottom: 12,
            padding: "10px 12px",
            borderRadius: 8,
            border: toast.type === "error" ? "1px solid #f5b5b5" : "1px solid #b7e1c1",
            background: toast.type === "error" ? "#fff5f5" : "#f4fff7",
            fontSize: 13
          }}
        >
          <b style={{ marginRight: 8 }}>{toast.type === "error" ? "Error" : "OK"}</b>
          {toast.msg}
        </div>
      ) : null}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
        <div>
          <h2 style={{ margin: 0 }}>{bot.name}</h2>
          <div style={{ fontSize: 12, opacity: 0.8 }}>
            {bot.exchange} · {bot.symbol}
            {dirty ? (
              <span style={{ marginLeft: 8, padding: "2px 6px", border: "1px solid #f0c36d", borderRadius: 999, fontSize: 11 }}>
                Unsaved changes
              </span>
            ) : null}
          </div>
        </div>
        <div style={{ fontSize: 12, opacity: 0.8 }}>
          <div>Bot status: <b>{bot.status}</b></div>
          <div>Runtime: <b>{rt?.status ?? "—"}</b>{rt?.reason ? ` — ${rt.reason}` : ""}</div>
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, margin: "12px 0", flexWrap: "wrap" }}>
        <button onClick={start} disabled={saving === "saving..."}>Start</button>
        <button onClick={pause} disabled={saving === "saving..."}>Pause</button>
        <button onClick={stop} disabled={saving === "saving..."}>Stop</button>
        <button onClick={save} disabled={!canSave} style={{ marginLeft: 12 }}>
          {dirty ? "Save Config" : "Saved"}
        </button>
        <span style={{ alignSelf: "center", fontSize: 12 }}>{saving}</span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <Section title="Market Making">
          <Field label="Spread (%)" value={mm.spreadPct} onChange={(v) => setMm({ ...mm, spreadPct: Number(v) })} />
          <Field label="Step (%)" value={mm.stepPct} onChange={(v) => setMm({ ...mm, stepPct: Number(v) })} />
          <Field label="Levels Up" value={mm.levelsUp} onChange={(v) => setMm({ ...mm, levelsUp: Number(v) })} />
          <Field label="Levels Down" value={mm.levelsDown} onChange={(v) => setMm({ ...mm, levelsDown: Number(v) })} />
          <Field label="Quote Budget (USDT)" value={mm.budgetQuoteUsdt} onChange={(v) => setMm({ ...mm, budgetQuoteUsdt: Number(v) })} />
          <Field label="Base Budget (Token)" value={mm.budgetBaseToken} onChange={(v) => setMm({ ...mm, budgetBaseToken: Number(v) })} />
          <SelectField
            label="Distribution"
            value={mm.distribution}
            options={[
              { label: "Linear", value: "LINEAR" },
              { label: "Valley", value: "VALLEY" },
              { label: "Random", value: "RANDOM" }
            ]}
            onChange={(v) => setMm({ ...mm, distribution: v })}
          />
          <Field label="Jitter (%)" value={mm.jitterPct} onChange={(v) => setMm({ ...mm, jitterPct: Number(v) })} />
          <Field label="Skew Factor" value={mm.skewFactor} onChange={(v) => setMm({ ...mm, skewFactor: Number(v) })} />
          <Field label="Max Skew" value={mm.maxSkew} onChange={(v) => setMm({ ...mm, maxSkew: Number(v) })} />
        </Section>

        <Section title="Volume Bot">
          <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 8 }}>
            Passive = post-only around mid. Mixed may place occasional market orders.
          </div>
          <Field label="Daily Notional (USDT)" value={vol.dailyNotionalUsdt} onChange={(v) => setVol({ ...vol, dailyNotionalUsdt: Number(v) })} />
          <Field label="Min Trade (USDT)" value={vol.minTradeUsdt} onChange={(v) => setVol({ ...vol, minTradeUsdt: Number(v) })} />
          <Field label="Max Trade (USDT)" value={vol.maxTradeUsdt} onChange={(v) => setVol({ ...vol, maxTradeUsdt: Number(v) })} />
          <Field label="Active From (HH:MM)" value={vol.activeFrom} onChange={(v) => setVol({ ...vol, activeFrom: v })} />
          <Field label="Active To (HH:MM)" value={vol.activeTo} onChange={(v) => setVol({ ...vol, activeTo: v })} />
          <SelectField
            label="Mode"
            value={vol.mode}
            options={[
              { label: "Passive", value: "PASSIVE" },
              { label: "Mixed", value: "MIXED" }
            ]}
            onChange={(v) => setVol({ ...vol, mode: v })}
          />
        </Section>

        <Section title="Risk">
          <Field label="Min Balance (USDT)" value={risk.minUsdt} onChange={(v) => setRisk({ ...risk, minUsdt: Number(v) })} />
          <Field label="Max Deviation (%)" value={risk.maxDeviationPct} onChange={(v) => setRisk({ ...risk, maxDeviationPct: Number(v) })} />
          <Field label="Max Open Orders" value={risk.maxOpenOrders} onChange={(v) => setRisk({ ...risk, maxOpenOrders: Number(v) })} />
          <Field label="Max Daily Loss (USDT)" value={risk.maxDailyLoss} onChange={(v) => setRisk({ ...risk, maxDailyLoss: Number(v) })} />
        </Section>

        <Section title="Live Snapshot">
          {!rt ? (
            <div style={{ fontSize: 12, opacity: 0.8 }}>No runtime yet (runner not started?)</div>
          ) : (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <Kv k="mid" v={rt.mid} />
                <Kv k="bid" v={rt.bid} />
                <Kv k="ask" v={rt.ask} />
                <Kv k="openOrders" v={rt.openOrders} />
                <Kv k="openOrdersMm" v={rt.openOrdersMm} />
                <Kv k="openOrdersVol" v={rt.openOrdersVol} />
                <Kv k="lastVolClientOrderId" v={rt.lastVolClientOrderId} />
                <Kv k="freeUsdt" v={rt.freeUsdt} />
                <Kv k="freeBase" v={rt.freeBase} />
                <Kv k="tradedNotionalToday" v={rt.tradedNotionalToday} />
                <Kv k="updatedAt" v={rt.updatedAt} />
              </div>

              <details style={{ marginTop: 10 }}>
                <summary style={{ cursor: "pointer" }}>Raw runtime JSON</summary>
                <pre style={{ marginTop: 8, whiteSpace: "pre-wrap" }}>{JSON.stringify(rt, null, 2)}</pre>
              </details>
            </>
          )}
        </Section>
      </div>
    </div>
  );
}

function Section(props: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ border: "1px solid #ddd", padding: 12, borderRadius: 8 }}>
      <h3 style={{ marginTop: 0 }}>{props.title}</h3>
      {props.children}
    </section>
  );
}

function Field(props: { label: string; value: any; onChange: (v: string) => void }) {
  return (
    <label style={{ display: "grid", gridTemplateColumns: "180px 1fr", gap: 8, marginBottom: 8, alignItems: "center" }}>
      <span style={{ fontSize: 13 }}>{props.label}</span>
      <input
        value={props.value ?? ""}
        onChange={(e) => props.onChange(e.target.value)}
        style={{ padding: 6, border: "1px solid #ccc", borderRadius: 6 }}
      />
    </label>
  );
}

function SelectField(props: {
  label: string;
  value: string;
  options: { label: string; value: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <label style={{ display: "grid", gridTemplateColumns: "180px 1fr", gap: 8, marginBottom: 8, alignItems: "center" }}>
      <span style={{ fontSize: 13 }}>{props.label}</span>
      <select
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        style={{ padding: 6, border: "1px solid #ccc", borderRadius: 6 }}
      >
        {props.options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function Kv(props: { k: string; v: any }) {
  return (
    <div style={{ border: "1px solid #eee", padding: "8px 10px", borderRadius: 8 }}>
      <div style={{ fontSize: 11, opacity: 0.7 }}>{props.k}</div>
      <div style={{ fontSize: 13, fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" }}>
        {props.v === null || props.v === undefined ? "—" : String(props.v)}
      </div>
    </div>
  );
}
