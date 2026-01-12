"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ApiError, apiGet, apiPost, apiPut } from "../../../lib/api";
import { ConfigForm } from "./config-form";
import { LiveView } from "./live-view";

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

  if (!bot || !mm || !vol || !risk) return <div>Loading…</div>;

  return (
    <div>
      <div style={{ marginBottom: 10 }}>
        <Link href="/" className="btn">
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

      <div style={{ display: "flex", gap: 8, margin: "12px 0", flexWrap: "wrap" }}>
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
          style={{ marginLeft: 12 }}
        >
          {dirty ? "Save Config" : "Saved"}
        </button>
        <span style={{ alignSelf: "center", fontSize: 12 }}>{saving}</span>
      </div>

      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 12 }}>
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
        <span style={{ fontSize: 12, opacity: 0.8, marginLeft: 8 }}>Volume Bot</span>
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

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <ConfigForm
          mm={mm}
          vol={vol}
          risk={risk}
          onMmChange={setMm}
          onVolChange={setVol}
          onRiskChange={setRisk}
        />
        <LiveView runtime={rt} />
      </div>
    </div>
  );
}
