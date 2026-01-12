"use client";

import { useEffect, useMemo, useState } from "react";
import { apiGet, apiPost, apiPut } from "../../../lib/api";

export default function BotPage({ params }: { params: { id: string } }) {
  const id = params.id;

  const [bot, setBot] = useState<any>(null);
  const [rt, setRt] = useState<any>(null);
  const [saving, setSaving] = useState("");

  const [mm, setMm] = useState<any>(null);
  const [vol, setVol] = useState<any>(null);
  const [risk, setRisk] = useState<any>(null);

  async function loadAll() {
    const b = await apiGet<any>(`/bots/${id}`);
    setBot(b);
    setMm(b.mmConfig);
    setVol(b.volConfig);
    setRisk(b.riskConfig);
  }

  async function loadRuntime() {
    const r = await apiGet<any>(`/bots/${id}/runtime`);
    setRt(r);
  }

  useEffect(() => {
    loadAll();
    loadRuntime();
    const t = setInterval(loadRuntime, 1200);
    return () => clearInterval(t);
  }, [id]);

  const canSave = useMemo(() => mm && vol && risk, [mm, vol, risk]);

  async function save() {
    if (!canSave) return;
    setSaving("saving...");
    await apiPut(`/bots/${id}/config`, { mm, vol, risk });
    setSaving("saved");
    setTimeout(() => setSaving(""), 1200);
  }

  async function start() {
    await apiPost(`/bots/${id}/start`);
    await loadAll();
  }
  async function pause() {
    await apiPost(`/bots/${id}/pause`);
    await loadAll();
  }
  async function stop() {
    await apiPost(`/bots/${id}/stop`);
    await loadAll();
  }

  if (!bot || !mm || !vol || !risk) return <div>Loading…</div>;

  return (
    <div>
      <h2>{bot.name}</h2>
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <button onClick={start}>Start</button>
        <button onClick={pause}>Pause</button>
        <button onClick={stop}>Stop</button>
        <span style={{ marginLeft: 8 }}>Status: <b>{bot.status}</b></span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <section style={{ border: "1px solid #ddd", padding: 12 }}>
          <h3>Market Making</h3>
          <Field label="spreadPct" value={mm.spreadPct} onChange={(v) => setMm({ ...mm, spreadPct: Number(v) })} />
          <Field label="maxSpreadPct" value={mm.maxSpreadPct} onChange={(v) => setMm({ ...mm, maxSpreadPct: Number(v) })} />
          <Field label="levelsUp" value={mm.levelsUp} onChange={(v) => setMm({ ...mm, levelsUp: Number(v) })} />
          <Field label="levelsDown" value={mm.levelsDown} onChange={(v) => setMm({ ...mm, levelsDown: Number(v) })} />
          <Field label="budgetQuoteUsdt" value={mm.budgetQuoteUsdt} onChange={(v) => setMm({ ...mm, budgetQuoteUsdt: Number(v) })} />
          <Field label="budgetBaseToken" value={mm.budgetBaseToken} onChange={(v) => setMm({ ...mm, budgetBaseToken: Number(v) })} />
          <Field label="distribution" value={mm.distribution} onChange={(v) => setMm({ ...mm, distribution: v })} />
          <Field label="jitterPct" value={mm.jitterPct} onChange={(v) => setMm({ ...mm, jitterPct: Number(v) })} />
          <Field label="skewFactor" value={mm.skewFactor} onChange={(v) => setMm({ ...mm, skewFactor: Number(v) })} />
          <Field label="maxSkew" value={mm.maxSkew} onChange={(v) => setMm({ ...mm, maxSkew: Number(v) })} />
        </section>

        <section style={{ border: "1px solid #ddd", padding: 12 }}>
          <h3>Volume Bot</h3>
          <Field label="dailyNotionalUsdt" value={vol.dailyNotionalUsdt} onChange={(v) => setVol({ ...vol, dailyNotionalUsdt: Number(v) })} />
          <Field label="minTradeUsdt" value={vol.minTradeUsdt} onChange={(v) => setVol({ ...vol, minTradeUsdt: Number(v) })} />
          <Field label="maxTradeUsdt" value={vol.maxTradeUsdt} onChange={(v) => setVol({ ...vol, maxTradeUsdt: Number(v) })} />
          <Field label="activeFrom" value={vol.activeFrom} onChange={(v) => setVol({ ...vol, activeFrom: v })} />
          <Field label="activeTo" value={vol.activeTo} onChange={(v) => setVol({ ...vol, activeTo: v })} />
          <Field label="mode" value={vol.mode} onChange={(v) => setVol({ ...vol, mode: v })} />
        </section>

        <section style={{ border: "1px solid #ddd", padding: 12 }}>
          <h3>Risk</h3>
          <Field label="minUsdt" value={risk.minUsdt} onChange={(v) => setRisk({ ...risk, minUsdt: Number(v) })} />
          <Field label="maxDeviationPct" value={risk.maxDeviationPct} onChange={(v) => setRisk({ ...risk, maxDeviationPct: Number(v) })} />
          <Field label="maxOpenOrders" value={risk.maxOpenOrders} onChange={(v) => setRisk({ ...risk, maxOpenOrders: Number(v) })} />
          <Field label="maxDailyLoss" value={risk.maxDailyLoss} onChange={(v) => setRisk({ ...risk, maxDailyLoss: Number(v) })} />
        </section>

        <section style={{ border: "1px solid #ddd", padding: 12 }}>
          <h3>Live</h3>
          {!rt ? (
            <div>No runtime yet (runner not started?)</div>
          ) : (
            <pre style={{ margin: 0, whiteSpace: "pre-wrap" }}>{JSON.stringify(rt, null, 2)}</pre>
          )}
        </section>
      </div>

      <div style={{ marginTop: 12, display: "flex", gap: 12, alignItems: "center" }}>
        <button onClick={save} disabled={!canSave}>Save Config</button>
        <span>{saving}</span>
      </div>
    </div>
  );
}

function Field(props: { label: string; value: any; onChange: (v: string) => void }) {
  return (
    <label style={{ display: "grid", gridTemplateColumns: "180px 1fr", gap: 8, marginBottom: 8 }}>
      <span>{props.label}</span>
      <input
        value={props.value ?? ""}
        onChange={(e) => props.onChange(e.target.value)}
        style={{ padding: 6 }}
      />
    </label>
  );
}
