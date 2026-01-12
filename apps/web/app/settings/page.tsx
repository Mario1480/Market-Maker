"use client";

import { useEffect, useState } from "react";
import { ApiError, apiGet, apiPut } from "../../lib/api";

type CexConfig = {
  exchange: string;
  apiKey: string;
  apiSecret: string;
  apiMemo?: string | null;
};

const DEFAULT_EXCHANGE = "bitmart";

export default function SettingsPage() {
  const [exchange, setExchange] = useState(DEFAULT_EXCHANGE);
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

  useEffect(() => {
    async function load() {
      setStatus("loading...");
      setError("");
      try {
        const cfg = await apiGet<CexConfig | null>(`/settings/cex/${exchange}`);
        if (cfg) {
          setForm({
            exchange: cfg.exchange,
            apiKey: cfg.apiKey ?? "",
            apiSecret: cfg.apiSecret ?? "",
            apiMemo: cfg.apiMemo ?? ""
          });
        } else {
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

  async function save() {
    setStatus("saving...");
    setError("");
    try {
      await apiPut("/settings/cex", {
        exchange,
        apiKey: form.apiKey,
        apiSecret: form.apiSecret,
        apiMemo: form.apiMemo ? form.apiMemo : undefined
      });
      setStatus("saved");
      setTimeout(() => setStatus(""), 1200);
    } catch (e) {
      setStatus("");
      setError(errMsg(e));
    }
  }

  return (
    <div style={{ maxWidth: 720 }}>
      <div style={{ marginBottom: 10 }}>
        <a href="/" style={{ fontSize: 13 }}>
          ← Back to dashboard
        </a>
      </div>
      <h2 style={{ marginTop: 0 }}>Settings</h2>
      <div style={{ fontSize: 13, opacity: 0.8, marginBottom: 12 }}>
        Configure CEX API credentials for live testing.
      </div>

      {error ? (
        <div style={{ marginBottom: 12, padding: "8px 10px", border: "1px solid #f5b5b5", borderRadius: 8, background: "#fff5f5" }}>
          {error}
        </div>
      ) : null}

      <Section title="CEX API">
        <Field label="exchange">
          <select
            value={exchange}
            onChange={(e) => setExchange(e.target.value)}
            style={{ padding: 6, border: "1px solid #ccc", borderRadius: 6 }}
          >
            <option value="bitmart">bitmart</option>
          </select>
        </Field>
        <Field label="apiKey">
          <input
            value={form.apiKey}
            onChange={(e) => setForm({ ...form, apiKey: e.target.value })}
            style={{ padding: 6, border: "1px solid #ccc", borderRadius: 6 }}
          />
        </Field>
        <Field label="apiSecret">
          <input
            type="password"
            value={form.apiSecret}
            onChange={(e) => setForm({ ...form, apiSecret: e.target.value })}
            style={{ padding: 6, border: "1px solid #ccc", borderRadius: 6 }}
          />
        </Field>
        <Field label="apiMemo">
          <input
            value={form.apiMemo ?? ""}
            onChange={(e) => setForm({ ...form, apiMemo: e.target.value })}
            style={{ padding: 6, border: "1px solid #ccc", borderRadius: 6 }}
            placeholder="optional (Bitmart memo)"
          />
        </Field>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button onClick={save}>Save</button>
          <span style={{ fontSize: 12, opacity: 0.7 }}>{status}</span>
        </div>
      </Section>
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

function Field(props: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "grid", gridTemplateColumns: "180px 1fr", gap: 8, marginBottom: 8, alignItems: "center" }}>
      <span style={{ fontSize: 13 }}>{props.label}</span>
      {props.children}
    </label>
  );
}
