"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ApiError, apiGet, apiPost, apiPut } from "../../../../lib/api";
import { ConfigForm } from "../config-form";
import { LiveView } from "../live-view";

export default function BotPage() {
  const params = useParams();
  const id = params.id as string; // ✅ korrekt für Next 15

  const [bot, setBot] = useState<any>(null);
  const [rt, setRt] = useState<any>(null);
  const [saving, setSaving] = useState("");
  const [toggling, setToggling] = useState("");

  const [mm, setMm] = useState<any>(null);
  const [vol, setVol] = useState<any>(null);
  const [risk, setRisk] = useState<any>(null);
  const [preview, setPreview] = useState<{
    mid: number;
    bids: any[];
    asks: any[];
    inventoryRatio?: number;
    skewPct?: number;
    skewedMid?: number;
  } | null>(null);
  const [previewErr, setPreviewErr] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewMidOverride, setPreviewMidOverride] = useState("");
  const [includeJitter, setIncludeJitter] = useState(false);
  const [previewSeed, setPreviewSeed] = useState("");
  const [fieldErrors, setFieldErrors] = useState<{
    budgetQuoteUsdt?: string;
    budgetBaseToken?: string;
  } | null>(null);

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
      setFieldErrors(null);
      await apiPut(`/bots/${id}/config`, { mm, vol, risk });
      setBaseline({ mm, vol, risk });
      setSaving("saved");
      showToast("success", "Config saved");
      setTimeout(() => setSaving(""), 1200);
    } catch (e) {
      setSaving("");
      if (e instanceof ApiError && e.payload?.error === "min_budget") {
        setFieldErrors(e.payload?.details?.errors ?? null);
      }
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

  async function startMm() {
    try {
      setToggling("mm");
      await apiPost(`/bots/${id}/mm/start`);
      await loadAll();
    } catch (e) {
      showToast("error", errMsg(e));
    } finally {
      setToggling("");
    }
  }

  async function stopMm() {
    try {
      setToggling("mm");
      await apiPost(`/bots/${id}/mm/stop`);
      await loadAll();
    } catch (e) {
      showToast("error", errMsg(e));
    } finally {
      setToggling("");
    }
  }

  async function startVol() {
    try {
      setToggling("vol");
      await apiPost(`/bots/${id}/vol/start`);
      await loadAll();
    } catch (e) {
      showToast("error", errMsg(e));
    } finally {
      setToggling("");
    }
  }

  async function stopVol() {
    try {
      setToggling("vol");
      await apiPost(`/bots/${id}/vol/stop`);
      await loadAll();
    } catch (e) {
      showToast("error", errMsg(e));
    } finally {
      setToggling("");
    }
  }

  function resolveMid(): number | null {
    const raw = previewMidOverride.trim();
    if (raw) {
      const n = Number(raw.replace(",", "."));
      return Number.isFinite(n) && n > 0 ? n : null;
    }
    return rt?.mid ?? null;
  }

  async function loadPreview() {
    if (!mm) return;
    const mid = resolveMid();
    if (!mid) {
      setPreview(null);
      setPreviewErr("Mid price missing. Enter a Mid override.");
      return;
    }
    setPreviewLoading(true);
    setPreviewErr(null);
    try {
      const seedRaw = previewSeed.trim();
      const seedNum = seedRaw ? Number(seedRaw) : null;
      const seed = Number.isFinite(seedNum as number) ? (seedNum as number) : undefined;

      const p = await apiPost<any>(`/bots/${id}/preview/mm`, {
        mm,
        runtime: { mid, freeUsdt: rt?.freeUsdt ?? 0, freeBase: rt?.freeBase ?? 0 },
        options: { includeJitter, seed }
      });
      setPreview(p);
    } catch (e) {
      setPreview(null);
      setPreviewErr(errMsg(e));
    } finally {
      setPreviewLoading(false);
    }
  }

  useEffect(() => {
    if (!id || !mm) return;
    const t = setTimeout(() => {
      loadPreview();
    }, 400);
    return () => clearTimeout(t);
  }, [id, mm, previewMidOverride, includeJitter, previewSeed, rt?.mid, rt?.freeUsdt, rt?.freeBase]);

  if (!bot || !mm || !vol || !risk) return <div>Loading…</div>;

  return (
    <div>
      <h2 style={{ margin: 0, textAlign: "center" }}>Settings</h2>
      <div style={{ marginBottom: 10, marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
        <Link href="/" className="btn">
          ← Back to dashboard
        </Link>
        <Link href={`/bots/${id}`} className="btn">
          Overview →
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
      <div className="adminHeader" style={{ alignItems: "baseline" }}>
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
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <span>MM:</span>
            <span className={`badge ${bot.mmEnabled ? "badgeOk" : "badgeWarn"}`}>
              {bot.mmEnabled ? "enabled" : "disabled"}
            </span>
            <span>Volume:</span>
            <span className={`badge ${bot.volEnabled ? "badgeOk" : "badgeWarn"}`}>
              {bot.volEnabled ? "enabled" : "disabled"}
            </span>
            <span style={{ opacity: 0.7 }}>independent toggles</span>
          </div>
          <div>Runtime: <b>{rt?.status ?? "—"}</b>{rt?.reason ? ` — ${rt.reason}` : ""}</div>
        </div>
      </div>

      <div className="gridTwoCol" style={{ margin: "12px 0" }}>
        <div className="card" style={{ padding: 12 }}>
        <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 2 }}>Runner controls</div>
        <div style={{ fontSize: 11, opacity: 0.6, marginBottom: 6 }}>
          Starts, pauses, or stops the main trading loop for this bot.
        </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button
              onClick={start}
              disabled={saving === "saving..."}
              className={`btn btnStart ${saving === "saving..." ? "btnDisabled" : ""}`}
            >
              Start
            </button>
            <button
              onClick={pause}
              disabled={saving === "saving..."}
              className={`btn btnPause ${saving === "saving..." ? "btnDisabled" : ""}`}
            >
              Pause
            </button>
            <button
              onClick={stop}
              disabled={saving === "saving..."}
              className={`btn btnStop ${saving === "saving..." ? "btnDisabled" : ""}`}
            >
              Stop
            </button>
            <button
              onClick={save}
              disabled={!canSave}
              className={`btn btnPrimary ${!canSave ? "btnDisabled" : ""}`}
            >
              {dirty ? "Save Config" : "Saved"}
            </button>
            <span style={{ alignSelf: "center", fontSize: 12 }}>{saving}</span>
          </div>
        </div>

        <div className="card" style={{ padding: 12 }}>
          <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 6 }}>Strategy controls (MM and Volume run independently)</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <span style={{ fontSize: 12, opacity: 0.8 }}>Market Making</span>
              <button
                onClick={startMm}
                disabled={toggling === "mm" || bot.mmEnabled === true}
                className={`btn btnStart ${toggling === "mm" || bot.mmEnabled ? "btnDisabled" : ""}`}
                title="Start market making only (volume stays as is)"
              >
                Start MM
              </button>
              <button
                onClick={stopMm}
                disabled={toggling === "mm" || bot.mmEnabled === false}
                className={`btn btnStop ${toggling === "mm" || !bot.mmEnabled ? "btnDisabled" : ""}`}
                title="Stop market making only (volume stays as is)"
              >
                Stop MM
              </button>
            </div>
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <span style={{ fontSize: 12, opacity: 0.8 }}>Volume Bot</span>
              <button
                onClick={startVol}
                disabled={toggling === "vol" || bot.volEnabled === true}
                className={`btn btnStart ${toggling === "vol" || bot.volEnabled ? "btnDisabled" : ""}`}
                title="Start volume bot only (MM stays as is)"
              >
                Start Volume
              </button>
              <button
                onClick={stopVol}
                disabled={toggling === "vol" || bot.volEnabled === false}
                className={`btn btnStop ${toggling === "vol" || !bot.volEnabled ? "btnDisabled" : ""}`}
                title="Stop volume bot only (MM stays as is)"
              >
                Stop Volume
              </button>
            </div>
          </div>
        </div>
      </div>

      <div style={{ marginBottom: 16 }}>
        <LiveView runtime={rt} baseSymbol={bot?.symbol?.split("_")[0]} />
      </div>

      <div className="card" style={{ padding: 12, marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <h3 style={{ marginTop: 0 }}>Order book preview</h3>
          <button className="btn" onClick={loadPreview} disabled={previewLoading}>
            {previewLoading ? "Updating..." : "Update preview"}
          </button>
        </div>

        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 10 }}>
          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontSize: 12, color: "var(--muted)" }}>Mid override</span>
            <input
              className="input"
              placeholder={rt?.mid ? String(rt.mid) : "0.0000"}
              value={previewMidOverride}
              onChange={(e) => setPreviewMidOverride(e.target.value)}
            />
          </label>
          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontSize: 12, color: "var(--muted)" }}>Seed (optional)</span>
            <input
              className="input"
              placeholder="e.g. 42"
              value={previewSeed}
              onChange={(e) => setPreviewSeed(e.target.value)}
            />
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
            <input
              type="checkbox"
              checked={includeJitter}
              onChange={(e) => setIncludeJitter(e.target.checked)}
            />
            Include jitter
          </label>
        </div>

        {previewErr ? (
          <div style={{ fontSize: 12, color: "#fca5a5", marginBottom: 8 }}>{previewErr}</div>
        ) : null}

        <div style={{ textAlign: "center", fontSize: 12, color: "var(--muted)", marginBottom: 6 }}>
          Mid: {formatNum(preview?.mid ?? resolveMid() ?? null, 8)}
          {preview?.skewPct !== undefined ? (
            <span>
              {" "}
              • Inventory skew: {preview.skewPct >= 0 ? "+" : ""}
              {preview.skewPct.toFixed(2)}% (ratio {formatNum(preview.inventoryRatio, 2)})
            </span>
          ) : null}
        </div>
        <div className="gridTwoCol">
          <PreviewTable title="Asks" rows={preview?.asks ?? []} accent="#ef4444" />
          <PreviewTable title="Bids" rows={preview?.bids ?? []} accent="#22c55e" />
        </div>
      </div>

      <div>
        <ConfigForm
          mm={mm}
          vol={vol}
          risk={risk}
          onMmChange={(next) => {
            setMm(next);
            if (fieldErrors) setFieldErrors(null);
          }}
          onVolChange={setVol}
          onRiskChange={setRisk}
          baseSymbol={bot?.symbol?.split("_")[0]}
          midPrice={rt?.mid ?? null}
          errors={fieldErrors}
        />
      </div>
    </div>
  );
}

function PreviewTable({ title, rows, accent }: { title: string; rows: any[]; accent: string }) {
  const maxNotional = Math.max(1, ...rows.map((r) => Number(r?.notional || 0)));
  return (
    <div className="card" style={{ padding: 10, borderColor: accent, minWidth: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <span style={{ width: 8, height: 8, borderRadius: 999, background: accent }} />
        <div style={{ fontSize: 12, fontWeight: 700 }}>{title}</div>
        <div style={{ marginLeft: "auto", fontSize: 11, color: "var(--muted)" }}>
          {rows.length} levels
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
                <td colSpan={3} style={{ color: "var(--muted)", paddingTop: 8 }}>—</td>
              </tr>
            ) : (
              rows.map((r, idx) => (
                <tr key={`${title}-${idx}`} style={{ borderTop: "1px solid rgba(255,255,255,.06)" }}>
                  <td style={{ paddingTop: 6, paddingBottom: 6, overflow: "hidden", textOverflow: "ellipsis" }}>
                    {formatNum(r.price, 8)}
                  </td>
                  <td style={{ textAlign: "right", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {formatNum(r.qty, 6)}
                  </td>
                  <td style={{ textAlign: "right", overflow: "hidden", textOverflow: "ellipsis" }}>
                    <div style={{ position: "relative", padding: "2px 0" }}>
                      <div
                        style={{
                          position: "absolute",
                          inset: 0,
                          width: `${Math.min(100, (Number(r.notional || 0) / maxNotional) * 100)}%`,
                          background: `${accent}22`,
                          borderRadius: 6
                        }}
                      />
                      <span style={{ position: "relative" }}>{formatNum(r.notional, 3)}</span>
                    </div>
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
