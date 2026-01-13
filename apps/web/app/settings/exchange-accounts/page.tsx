"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ApiError, apiDelete, apiGet, apiPost, apiPut } from "../../../lib/api";

type CexConfig = {
  exchange: string;
  apiKey: string;
  apiSecret: string;
  apiMemo?: string | null;
  updatedAt?: string;
};

const EXCHANGES = [{ label: "Bitmart", value: "bitmart" }];
const DEFAULT_EXCHANGE = "bitmart";

export default function ExchangeAccountsPage() {
  const [items, setItems] = useState<CexConfig[]>([]);
  const [exchange, setExchange] = useState(DEFAULT_EXCHANGE);
  const [onlyConfigured, setOnlyConfigured] = useState(false);
  const [unlocked, setUnlocked] = useState(false);
  const [unlockPwd, setUnlockPwd] = useState("");
  const [unlocking, setUnlocking] = useState(false);
  const [form, setForm] = useState<CexConfig>({
    exchange: DEFAULT_EXCHANGE,
    apiKey: "",
    apiSecret: "",
    apiMemo: ""
  });
  const [status, setStatus] = useState<string>("");
  const [error, setError] = useState<string>("");

  function errMsg(e: any): string {
    if (e instanceof ApiError) return `${e.message} (HTTP ${e.status})`;
    return e?.message ? String(e.message) : String(e);
  }

  function handleReauthError(e: any) {
    if (e instanceof ApiError && e.status === 403 && e.payload?.error === "reauth_required") {
      setUnlocked(false);
      setError("Session expired. Unlock again to edit keys.");
      return true;
    }
    return false;
  }

  async function loadList() {
    const list = await apiGet<CexConfig[]>("/settings/cex");
    setItems(list);
  }

  async function loadSelected(nextExchange: string) {
    const cfg = await apiGet<CexConfig | null>(`/settings/cex/${nextExchange}`);
    if (cfg) {
      setForm({
        exchange: cfg.exchange,
        apiKey: cfg.apiKey ?? "",
        apiSecret: cfg.apiSecret ?? "",
        apiMemo: cfg.apiMemo ?? ""
      });
    } else {
      setForm({ exchange: nextExchange, apiKey: "", apiSecret: "", apiMemo: "" });
    }
  }

  useEffect(() => {
    async function load() {
      setStatus("loading...");
      setError("");
      try {
        await loadList();
        const reauth = await apiGet<{ ok: boolean }>("/auth/reauth/status");
        if (reauth?.ok) {
          setUnlocked(true);
          await loadSelected(exchange);
        } else {
          setUnlocked(false);
          setForm({ exchange, apiKey: "", apiSecret: "", apiMemo: "" });
        }
        setStatus("");
      } catch (e) {
        setStatus("");
        setError(errMsg(e));
      }
    }
    load();
  }, [exchange]);

  async function unlock() {
    setUnlocking(true);
    setStatus("unlocking...");
    setError("");
    try {
      await apiPost("/auth/reauth", { password: unlockPwd });
      setUnlocked(true);
      setUnlockPwd("");
      await loadSelected(exchange);
      setStatus("unlocked");
      setTimeout(() => setStatus(""), 1200);
    } catch (e) {
      setStatus("");
      setError(errMsg(e));
    } finally {
      setUnlocking(false);
    }
  }

  async function save() {
    if (!unlocked) {
      setError("Unlock required to edit keys.");
      return;
    }
    setStatus("saving...");
    setError("");
    try {
      await apiPut("/settings/cex", {
        exchange,
        apiKey: form.apiKey,
        apiSecret: form.apiSecret,
        apiMemo: form.apiMemo ? form.apiMemo : undefined
      });
      await loadList();
      setStatus("saved");
      setTimeout(() => setStatus(""), 1200);
    } catch (e) {
      if (!handleReauthError(e)) {
        setStatus("");
        setError(errMsg(e));
      }
    }
  }

  async function verify() {
    if (!unlocked) {
      setError("Unlock required to verify keys.");
      return;
    }
    setStatus("verifying...");
    setError("");
    try {
      await apiPost("/settings/cex/verify", {
        exchange,
        apiKey: form.apiKey,
        apiSecret: form.apiSecret,
        apiMemo: form.apiMemo ? form.apiMemo : undefined
      });
      setStatus("verified");
      setTimeout(() => setStatus(""), 1200);
    } catch (e) {
      if (!handleReauthError(e)) {
        setStatus("");
        setError(errMsg(e));
      }
    }
  }

  async function remove(exchangeId: string) {
    if (!unlocked) {
      setError("Unlock required to delete keys.");
      return;
    }
    setStatus("removing...");
    setError("");
    try {
      await apiDelete(`/settings/cex/${exchangeId}`);
      await loadList();
      if (exchangeId === exchange) {
        setExchange(DEFAULT_EXCHANGE);
      }
      setStatus("");
    } catch (e) {
      if (!handleReauthError(e)) {
        setStatus("");
        setError(errMsg(e));
      }
    }
  }

  function selectCard(cfg: CexConfig) {
    setExchange(cfg.exchange);
  }

  function addNew() {
    setExchange(DEFAULT_EXCHANGE);
    setForm({ exchange: DEFAULT_EXCHANGE, apiKey: "", apiSecret: "", apiMemo: "" });
  }

  const filtered = onlyConfigured
    ? items.filter((cfg) => Boolean(cfg.apiKey) && Boolean(cfg.apiSecret))
    : items;

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
      <h2 style={{ marginTop: 0 }}>Exchange accounts</h2>
      <div style={{ fontSize: 13, opacity: 0.8, marginBottom: 12 }}>
        Manage your connected trading accounts.
      </div>

      <div className="homeGrid" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <h3 style={{ margin: 0 }}>Accounts</h3>
            <button className="btn btnPrimary" onClick={addNew}>
              Add CEX
            </button>
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, fontSize: 13 }}>
            <input
              type="checkbox"
              checked={onlyConfigured}
              onChange={(e) => setOnlyConfigured(e.target.checked)}
            />
            Show only configured
          </label>
          <div style={{ display: "grid", gap: 10 }}>
            {filtered.length === 0 ? (
              <div className="card" style={{ padding: 12, fontSize: 13 }}>
                No CEX configs yet. Add one to start live testing.
              </div>
            ) : (
              filtered.map((cfg) => (
                <div
                  key={cfg.exchange}
                  className="card"
                  style={{
                    padding: 12,
                    borderColor: cfg.exchange === exchange ? "var(--brand)" : undefined
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div style={{ fontWeight: 700, display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ fontSize: 18 }}>{exchangeIcon(cfg.exchange)}</span>
                          <span>{cfg.exchange}</span>
                        </div>
                        {isConfigured(cfg) ? (
                          <span className="badge badgeOk">configured</span>
                        ) : (
                          <span className="badge badgeWarn">missing secret</span>
                        )}
                      </div>
                      <div style={{ fontSize: 12, color: "var(--muted)" }}>
                        {maskKey(cfg.apiKey)} · Updated {formatTime(cfg.updatedAt)}
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button className="btn" onClick={() => selectCard(cfg)}>Edit</button>
                      <button className="btn btnStop" onClick={() => remove(cfg.exchange)}>Delete</button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div>
          {!unlocked && (
            <Section title="Unlock to edit">
              <Field label="Password">
                <input
                  type="password"
                  value={unlockPwd}
                  onChange={(e) => setUnlockPwd(e.target.value)}
                  className="input"
                  placeholder="Confirm password"
                />
              </Field>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <button
                  onClick={unlock}
                  className="btn btnPrimary"
                  disabled={!unlockPwd || unlocking}
                >
                  Unlock
                </button>
                <span style={{ fontSize: 12, opacity: 0.7 }}>
                  Unlock lasts 10 minutes.
                </span>
              </div>
            </Section>
          )}
          <Section title="CEX API">
            <Field label="exchange">
              <select
                value={exchange}
                onChange={(e) => setExchange(e.target.value)}
                className="input"
              >
                {EXCHANGES.map((ex) => (
                  <option key={ex.value} value={ex.value}>
                    {ex.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="apiKey">
              <input
                value={form.apiKey}
                onChange={(e) => setForm({ ...form, apiKey: e.target.value })}
                className="input"
                disabled={!unlocked}
              />
            </Field>
            <Field label="apiSecret">
              <input
                type="password"
                value={form.apiSecret}
                onChange={(e) => setForm({ ...form, apiSecret: e.target.value })}
                className="input"
                disabled={!unlocked}
              />
            </Field>
            <Field label="apiMemo">
              <input
                value={form.apiMemo ?? ""}
                onChange={(e) => setForm({ ...form, apiMemo: e.target.value })}
                className="input"
                placeholder="optional (Bitmart memo)"
                disabled={!unlocked}
              />
            </Field>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <button onClick={save} className="btn btnPrimary">
                Save
              </button>
              <button onClick={verify} className="btn">
                Verify credentials
              </button>
              <span style={{ fontSize: 12, opacity: 0.7 }}>{status}</span>
            </div>
          </Section>
        </div>
      </div>

      {error ? (
        <div style={{ marginTop: 12, padding: "8px 10px", border: "1px solid #f5b5b5", borderRadius: 8, background: "#fff5f5" }}>
          {error}
        </div>
      ) : null}
    </div>
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

function Field(props: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "grid", gridTemplateColumns: "180px 1fr", gap: 8, marginBottom: 8, alignItems: "center" }}>
      <span style={{ fontSize: 13 }}>{props.label}</span>
      {props.children}
    </label>
  );
}

function maskKey(key: string) {
  if (!key) return "—";
  if (key.length <= 6) return `${key.slice(0, 2)}•••`;
  return `${key.slice(0, 4)}•••${key.slice(-2)}`;
}

function isConfigured(cfg: CexConfig) {
  return Boolean(cfg.apiKey) && Boolean(cfg.apiSecret);
}

function exchangeIcon(exchange: string) {
  const key = exchange.toLowerCase();
  if (key === "bitmart") return "🟡";
  return "💱";
}

function formatTime(value?: string) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString();
}
