"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ApiError, apiDelete, apiGet } from "../../../lib/api";

type Bot = {
  id: string;
  name: string;
  symbol: string;
  exchange: string;
  status: string;
  createdAt: string;
};

export default function Setup() {
  const [msg, setMsg] = useState("");
  const [bots, setBots] = useState<Bot[]>([]);
  const [loading, setLoading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  function errMsg(e: any): string {
    if (e instanceof ApiError) return `${e.message} (HTTP ${e.status})`;
    return e?.message ? String(e.message) : String(e);
  }

  async function loadBots() {
    try {
      setLoading(true);
      const list = await apiGet<Bot[]>("/bots");
      setBots(list);
    } catch (e) {
      setMsg(errMsg(e));
    } finally {
      setLoading(false);
    }
  }

  async function removeBot(bot: Bot) {
    const ok = window.confirm(`Delete bot "${bot.name}" (${bot.symbol})? This cannot be undone.`);
    if (!ok) return;
    setDeletingId(bot.id);
    try {
      await apiDelete(`/bots/${bot.id}`);
      setMsg(`deleted ${bot.name}`);
      await loadBots();
    } catch (e: any) {
      setMsg(errMsg(e));
    } finally {
      setDeletingId(null);
    }
  }

  useEffect(() => {
    loadBots();
  }, []);

  return (
    <div>
      <div style={{ marginBottom: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
        <Link href="/settings" className="btn">
          ← Back to settings
        </Link>
        <Link href="/" className="btn">
          ← Back to dashboard
        </Link>
      </div>
      <h2>Setup</h2>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        <Link href="/bots/new" className="btn btnPrimary">
          New Bot
        </Link>
        <button onClick={loadBots} className="btn">
          Refresh list
        </button>
      </div>
      {msg ? <p>{msg}</p> : null}

      <div className="card" style={{ padding: 12 }}>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>Bots</div>
        {loading ? (
          <div style={{ fontSize: 12, color: "var(--muted)" }}>Loading...</div>
        ) : bots.length === 0 ? (
          <div style={{ fontSize: 12, color: "var(--muted)" }}>No bots yet.</div>
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            {bots.map((bot) => (
              <div
                key={bot.id}
                className="card"
                style={{
                  padding: 12,
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 12,
                  alignItems: "center",
                  flexWrap: "wrap"
                }}
              >
                <div style={{ minWidth: 220 }}>
                  <div style={{ fontWeight: 700 }}>{bot.name}</div>
                  <div style={{ fontSize: 12, color: "var(--muted)" }}>
                    {bot.exchange} · {bot.symbol} · {bot.status}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <Link href={`/bots/${bot.id}`} className="btn">
                    Open
                  </Link>
                  <button
                    className="btn btnStop"
                    onClick={() => removeBot(bot)}
                    disabled={deletingId === bot.id}
                  >
                    {deletingId === bot.id ? "Deleting..." : "Delete"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
