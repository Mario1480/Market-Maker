"use client";

import Link from "next/link";
import { useState } from "react";
import { ApiError, apiPost } from "../../../lib/api";

export default function UsersPage() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  function errMsg(e: any): string {
    if (e instanceof ApiError) return `${e.message} (HTTP ${e.status})`;
    return e?.message ? String(e.message) : String(e);
  }

  async function save() {
    setStatus("saving...");
    setError("");
    if (newPassword !== confirmPassword) {
      setStatus("");
      setError("Passwords do not match.");
      return;
    }
    try {
      await apiPost("/auth/change-password", {
        currentPassword,
        newPassword
      });
      setStatus("updated");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setTimeout(() => setStatus(""), 1200);
    } catch (e) {
      setStatus("");
      setError(errMsg(e));
    }
  }

  return (
    <div style={{ maxWidth: 720 }}>
      <div style={{ marginBottom: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
        <Link href="/settings" className="btn">
          ← Back to settings
        </Link>
        <Link href="/" className="btn">
          ← Back to dashboard
        </Link>
      </div>
      <h2 style={{ marginTop: 0 }}>Users</h2>
      <div className="card" style={{ padding: 12 }}>
        <div style={{ fontWeight: 700, marginBottom: 6 }}>Change password</div>
        <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 10 }}>
          Set a new password for your account.
        </div>
        <div style={{ display: "grid", gap: 10 }}>
          <label style={{ fontSize: 13 }}>
            Current password
            <input
              className="input"
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
            />
          </label>
          <label style={{ fontSize: 13 }}>
            New password
            <input
              className="input"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
          </label>
          <label style={{ fontSize: 13 }}>
            Confirm new password
            <input
              className="input"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />
          </label>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button className="btn btnPrimary" onClick={save} disabled={!currentPassword || !newPassword}>
              Update password
            </button>
            <span style={{ fontSize: 12, opacity: 0.7 }}>{status}</span>
          </div>
          {error ? <div style={{ fontSize: 12, color: "#ff6b6b" }}>{error}</div> : null}
        </div>
      </div>
    </div>
  );
}
