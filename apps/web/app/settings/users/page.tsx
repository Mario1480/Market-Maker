"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ApiError, apiGet, apiPost, apiPut, apiDel } from "../../../lib/api";

export default function UsersPage() {
  const [me, setMe] = useState<any>(null);
  const [members, setMembers] = useState<any[]>([]);
  const [roles, setRoles] = useState<any[]>([]);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRoleId, setInviteRoleId] = useState("");
  const [inviteResetPassword, setInviteResetPassword] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [savingMemberId, setSavingMemberId] = useState<string | null>(null);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pwdStatus, setPwdStatus] = useState("");
  const [pwdError, setPwdError] = useState("");

  function errMsg(e: any): string {
    if (e instanceof ApiError) return `${e.message} (HTTP ${e.status})`;
    return e?.message ? String(e.message) : String(e);
  }

  async function loadMembers() {
    try {
      const meRes = await apiGet<any>("/auth/me");
      setMe(meRes);
      const [membersRes, rolesRes] = await Promise.all([
        apiGet<any[]>(`/workspaces/${meRes.workspaceId}/members`),
        apiGet<any[]>(`/workspaces/${meRes.workspaceId}/roles`)
      ]);
      setMembers(membersRes);
      setRoles(rolesRes);
      if (!inviteRoleId && rolesRes.length) setInviteRoleId(rolesRes[0].id);
    } catch (e) {
      setError(errMsg(e));
    }
  }

  useEffect(() => {
    loadMembers();
  }, []);

  const canManageMembers = Boolean(me?.permissions?.["users.manage_members"] || me?.isSuperadmin);

  async function invite() {
    if (!inviteEmail || !inviteRoleId) return;
    setStatus("inviting...");
    setError("");
    try {
      await apiPost(`/workspaces/${me.workspaceId}/members/invite`, {
        email: inviteEmail,
        roleId: inviteRoleId,
        resetPassword: inviteResetPassword
      });
      setInviteEmail("");
      setInviteResetPassword(false);
      setStatus("invited");
      await loadMembers();
      setTimeout(() => setStatus(""), 1200);
    } catch (e) {
      setStatus("");
      setError(errMsg(e));
    }
  }

  async function updateMember(memberId: string, roleId: string) {
    setSavingMemberId(memberId);
    setError("");
    try {
      await apiPut(`/workspaces/${me.workspaceId}/members/${memberId}`, { roleId });
      await loadMembers();
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setSavingMemberId(null);
    }
  }

  async function removeMember(memberId: string) {
    if (!confirm("Remove member from workspace?")) return;
    setSavingMemberId(memberId);
    setError("");
    try {
      await apiDel(`/workspaces/${me.workspaceId}/members/${memberId}`);
      await loadMembers();
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setSavingMemberId(null);
    }
  }

  async function savePassword() {
    setPwdStatus("saving...");
    setPwdError("");
    if (newPassword !== confirmPassword) {
      setPwdStatus("");
      setPwdError("Passwords do not match.");
      return;
    }
    try {
      await apiPost("/auth/change-password", {
        currentPassword,
        newPassword
      });
      setPwdStatus("updated");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setTimeout(() => setPwdStatus(""), 1200);
    } catch (e) {
      setPwdStatus("");
      setPwdError(errMsg(e));
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
      <div className="card" style={{ padding: 12, marginBottom: 14 }}>
        <div style={{ fontWeight: 700, marginBottom: 6 }}>Workspace members</div>
        <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 10 }}>
          Invite users and assign roles for this workspace.
        </div>
        <div style={{ display: "grid", gap: 8 }}>
          {members.length ? (
            members.map((m) => (
              <div key={m.id} style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <div style={{ minWidth: 220 }}>
                  <div style={{ fontWeight: 600 }}>{m.email}</div>
                  <div style={{ fontSize: 12, color: "var(--muted)" }}>{m.status}</div>
                </div>
                <select
                  className="input"
                  style={{ maxWidth: 220 }}
                  disabled={!canManageMembers || savingMemberId === m.id}
                  value={m.roleId}
                  onChange={(e) => updateMember(m.id, e.target.value)}
                >
                  {roles.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
                <button
                  className="btn btnStop"
                  onClick={() => removeMember(m.id)}
                  disabled={!canManageMembers || savingMemberId === m.id}
                >
                  Remove
                </button>
              </div>
            ))
          ) : (
            <div style={{ fontSize: 12, color: "var(--muted)" }}>No members yet.</div>
          )}
        </div>
        {canManageMembers ? (
          <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
            <div style={{ fontWeight: 600 }}>Invite member</div>
            <input
              className="input"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="email@domain.com"
            />
            <select
              className="input"
              value={inviteRoleId}
              onChange={(e) => setInviteRoleId(e.target.value)}
            >
              {roles.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
            <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12 }}>
              <input
                type="checkbox"
                checked={inviteResetPassword}
                onChange={(e) => setInviteResetPassword(e.target.checked)}
              />
              Reset password and include a temporary password in the email
            </label>
            <button className="btn btnPrimary" onClick={invite} disabled={!inviteEmail || !inviteRoleId}>
              Invite
            </button>
          </div>
        ) : (
          <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 8 }}>
            You don’t have permission to manage members.
          </div>
        )}
      </div>
      <div style={{ fontSize: 12, color: "var(--muted)" }}>
        Role editing is available in Settings → Roles.
      </div>
      <div className="card" style={{ padding: 12, marginTop: 14 }}>
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
            <button className="btn btnPrimary" onClick={savePassword} disabled={!currentPassword || !newPassword}>
              Update password
            </button>
            <span style={{ fontSize: 12, opacity: 0.7 }}>{pwdStatus}</span>
          </div>
          {pwdError ? <div style={{ fontSize: 12, color: "#ff6b6b" }}>{pwdError}</div> : null}
        </div>
      </div>
      {status ? <div style={{ fontSize: 12, opacity: 0.7, marginTop: 8 }}>{status}</div> : null}
      {error ? <div style={{ fontSize: 12, color: "#ff6b6b", marginTop: 8 }}>{error}</div> : null}
    </div>
  );
}
