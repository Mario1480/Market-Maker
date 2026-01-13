"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ApiError, apiPost } from "../../lib/api";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  function errMsg(e: any): string {
    if (e instanceof ApiError) return `${e.message} (HTTP ${e.status})`;
    return e?.message ? String(e.message) : String(e);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setStatus("signing in...");
    setError("");
    try {
      await apiPost("/auth/login", { email, password });
      router.push("/");
    } catch (e) {
      setStatus("");
      setError(errMsg(e));
    }
  }

  return (
    <div className="container" style={{ maxWidth: 520 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 18 }}>
        <img src="/images/logo.png" alt="uLiquid logo" style={{ width: 52, height: 52 }} />
        <div style={{ fontSize: 24, fontWeight: 700 }}>uLiquid</div>
      </div>
      <h1 style={{ marginTop: 0 }}>Login</h1>
      <div className="card" style={{ padding: 16 }}>
        <form onSubmit={submit} style={{ display: "grid", gap: 12 }}>
          <label style={{ fontSize: 13 }}>
            Email
            <input
              className="input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
            />
          </label>
          <label style={{ fontSize: 13 }}>
            Password
            <input
              className="input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
            />
          </label>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button className="btn btnPrimary" type="submit" disabled={!email || !password}>
              Sign in
            </button>
            <span style={{ fontSize: 12, opacity: 0.7 }}>{status}</span>
          </div>
          {error && <div style={{ fontSize: 12, color: "#ff6b6b" }}>{error}</div>}
        </form>
      </div>
    </div>
  );
}
