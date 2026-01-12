"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ApiError, apiGet, apiPost } from "../../../lib/api";

type SymbolOption = { symbol: string; base: string; quote: string };

export default function NewBotPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [exchange, setExchange] = useState("bitmart");
  const [symbols, setSymbols] = useState<SymbolOption[]>([]);
  const [symbolOptions, setSymbolOptions] = useState<string[]>([]);
  const [symbolQuery, setSymbolQuery] = useState("");
  const [symbol, setSymbol] = useState("");
  const [loadingSymbols, setLoadingSymbols] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function errMsg(e: any): string {
    if (e instanceof ApiError) return `${e.message} (HTTP ${e.status})`;
    return e?.message ? String(e.message) : String(e);
  }

  useEffect(() => {
    let mounted = true;
    async function loadSymbols() {
      setLoadingSymbols(true);
      setError(null);
      try {
        const data = await apiGet<SymbolOption[]>(`/exchanges/${exchange}/symbols`);
        if (!mounted) return;
        const unique = Array.from(
          new Set((data ?? []).map((s) => s.symbol).filter(Boolean))
        );
        setSymbols(data);
        setSymbolOptions(unique);
        setSymbol(unique[0] ?? "");
      } catch (e) {
        if (!mounted) return;
        setError(errMsg(e));
        setSymbols([]);
        setSymbolOptions([]);
        setSymbol("");
      } finally {
        if (mounted) setLoadingSymbols(false);
      }
    }
    loadSymbols();
    return () => {
      mounted = false;
    };
  }, [exchange]);

  const filteredOptions = useMemo(() => {
    const q = symbolQuery.trim().toLowerCase();
    if (!q) return symbolOptions;
    return symbolOptions.filter((s) => s.toLowerCase().includes(q));
  }, [symbolOptions, symbolQuery]);

  const canCreate = useMemo(() => {
    return name.trim().length > 0 && !!exchange && !!symbol && !saving;
  }, [name, exchange, symbol, saving]);

  async function createBot(e: React.FormEvent) {
    e.preventDefault();
    if (!canCreate) return;
    setSaving(true);
    setError(null);
    try {
      const bot = await apiPost<{ id: string }>("/bots", {
        name: name.trim(),
        exchange,
        symbol
      });
      router.push(`/bots/${bot.id}`);
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="container" style={{ maxWidth: 820 }}>
      <div style={{ marginBottom: 12 }}>
        <Link href="/" className="btn">
          ← Back to dashboard
        </Link>
      </div>

      <div className="card" style={{ padding: 18 }}>
        <div style={{ marginBottom: 12 }}>
          <h2 style={{ margin: 0 }}>New Bot</h2>
          <div style={{ fontSize: 13, color: "var(--muted)" }}>
            Create a fresh bot with exchange and trading pair. Existing bots stay immutable.
          </div>
        </div>

        {error ? (
          <div
            style={{
              marginBottom: 12,
              padding: "10px 12px",
              borderRadius: 8,
              border: "1px solid #ef4444",
              background: "rgba(239,68,68,0.12)",
              color: "#e8eef7",
              fontSize: 13
            }}
          >
            {error}
          </div>
        ) : null}

        <form onSubmit={createBot} style={{ display: "grid", gap: 12 }}>
          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontSize: 12, color: "var(--muted)" }}>Name</span>
            <input
              className="input"
              placeholder="e.g. Bot name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>

          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontSize: 12, color: "var(--muted)" }}>Exchange</span>
            <select className="input" value={exchange} onChange={(e) => setExchange(e.target.value)}>
              <option value="bitmart">Bitmart</option>
            </select>
          </label>

          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontSize: 12, color: "var(--muted)" }}>Trading Pair</span>
            <div style={{ position: "relative" }}>
              <input
                className="input"
                placeholder="Search pair (e.g. BTC)"
                value={symbolQuery}
                onChange={(e) => setSymbolQuery(e.target.value)}
                disabled={loadingSymbols || symbolOptions.length === 0}
              />
              {symbolQuery ? (
                <button
                  type="button"
                  className="btn"
                  onClick={() => setSymbolQuery("")}
                  style={{
                    position: "absolute",
                    right: 6,
                    top: "50%",
                    transform: "translateY(-50%)",
                    padding: "4px 8px",
                    borderRadius: 8,
                    fontSize: 12
                  }}
                >
                  ✕
                </button>
              ) : null}
            </div>
            <select
              className="input"
              value={symbol}
              onChange={(e) => setSymbol(e.target.value)}
              disabled={loadingSymbols || symbolOptions.length === 0}
            >
              {filteredOptions.length === 0 ? [
                <option key={loadingSymbols ? "loading" : "empty"} value="">
                  {loadingSymbols ? "Loading symbols..." : "No matching symbols"}
                </option>
              ] : (
                filteredOptions.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))
              )}
            </select>
          </label>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 4 }}>
            <button className="btn btnPrimary" type="submit" disabled={!canCreate}>
              {saving ? "Creating..." : "Create Bot"}
            </button>
            <Link href="/" className="btn">
              Cancel
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}
