"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ApiError, apiGet, apiPost, apiPut } from "../../../lib/api";

export default function NotificationsPage() {
  const [sending, setSending] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [token, setToken] = useState("");
  const [chatId, setChatId] = useState("");
  const [saving, setSaving] = useState(false);

  function errMsg(e: any): string {
    if (e instanceof ApiError) return `${e.message} (HTTP ${e.status})`;
    return e?.message ? String(e.message) : String(e);
  }

  async function sendTest() {
    setSending(true);
    setMsg(null);
    try {
      await apiPost("/alerts/test");
      setMsg("Test alert sent to Telegram.");
    } catch (e) {
      const message = errMsg(e);
      setMsg(message.includes("telegram_not_configured") ? "Telegram is not configured." : message);
    } finally {
      setSending(false);
    }
  }

  async function loadConfig() {
    try {
      const data = await apiGet<{ telegramBotToken?: string | null; telegramChatId?: string | null }>(
        "/settings/alerts"
      );
      setToken(data.telegramBotToken ?? "");
      setChatId(data.telegramChatId ?? "");
    } catch {
      // ignore
    }
  }

  async function saveConfig() {
    setSaving(true);
    setMsg(null);
    try {
      await apiPut("/settings/alerts", {
        telegramBotToken: token.trim() || null,
        telegramChatId: chatId.trim() || null
      });
      setMsg("Saved.");
    } catch (e) {
      setMsg(errMsg(e));
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    loadConfig();
  }, []);

  return (
    <div style={{ maxWidth: 980 }}>
      <div style={{ marginBottom: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
        <Link href="/settings" className="btn">
          ← Back to settings
        </Link>
        <Link href="/" className="btn">
          ← Back to dashboard
        </Link>
      </div>
      <h2 style={{ marginTop: 0 }}>Notifications</h2>
      <div className="card" style={{ padding: 12, fontSize: 13 }}>
        <div style={{ fontWeight: 700, marginBottom: 6 }}>Telegram alerts</div>
        <div style={{ color: "var(--muted)", marginBottom: 10 }}>
          Stored in DB; runner uses these when env is not set.
        </div>
        <div style={{ display: "grid", gap: 10, marginBottom: 10 }}>
          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontSize: 12, color: "var(--muted)" }}>Bot Token</span>
            <input
              className="input"
              placeholder="123456:ABC..."
              value={token}
              onChange={(e) => setToken(e.target.value)}
            />
          </label>
          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontSize: 12, color: "var(--muted)" }}>Chat ID</span>
            <input
              className="input"
              placeholder="123456789"
              value={chatId}
              onChange={(e) => setChatId(e.target.value)}
            />
          </label>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
          <button className="btn btnPrimary" onClick={saveConfig} disabled={saving}>
            {saving ? "Saving..." : "Save settings"}
          </button>
          <button className="btn" onClick={sendTest} disabled={sending}>
            {sending ? "Sending..." : "Send test message"}
          </button>
        </div>
        {msg ? (
          <div style={{ marginTop: 10, color: "var(--muted)" }}>{msg}</div>
        ) : null}
      </div>
    </div>
  );
}
