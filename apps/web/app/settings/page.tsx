import Link from "next/link";

export default function SettingsPage() {
  return (
    <div style={{ maxWidth: 980 }}>
      <div style={{ marginBottom: 10 }}>
        <Link href="/" className="btn">
          ← Back to dashboard
        </Link>
      </div>
      <h2 style={{ marginTop: 0 }}>Settings</h2>
      <div style={{ fontSize: 13, opacity: 0.8, marginBottom: 12 }}>
        Settings are grouped by area.
      </div>

      <div className="homeGrid" style={{ gridTemplateColumns: "1fr 1fr", marginBottom: 16 }}>
        <Link className="card" href="/settings/exchange-accounts" style={{ padding: 12 }}>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>Exchange accounts</div>
          <div style={{ fontSize: 12, color: "var(--muted)" }}>Manage your connected trading accounts</div>
        </Link>
        <Link className="card" href="/settings/notifications" style={{ padding: 12 }}>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>Notifications</div>
          <div style={{ fontSize: 12, color: "var(--muted)" }}>Alerts and delivery channels</div>
        </Link>
        <Link className="card" href="/settings/subscription" style={{ padding: 12 }}>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>Subscription</div>
          <div style={{ fontSize: 12, color: "var(--muted)" }}>Plan, usage, billing</div>
        </Link>
        <Link className="card" href="/settings/security" style={{ padding: 12 }}>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>Security</div>
          <div style={{ fontSize: 12, color: "var(--muted)" }}>Access control and keys</div>
        </Link>
        <Link className="card" href="/settings/users" style={{ padding: 12 }}>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>Users</div>
          <div style={{ fontSize: 12, color: "var(--muted)" }}>Password and access</div>
        </Link>
        <Link className="card" href="/settings/setup" style={{ padding: 12 }}>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>Bot Setup</div>
          <div style={{ fontSize: 12, color: "var(--muted)" }}>Bot list and setup</div>
        </Link>
        <Link className="card" href="/settings/support" style={{ padding: 12 }}>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>Support & Help</div>
          <div style={{ fontSize: 12, color: "var(--muted)" }}>Docs and contact</div>
        </Link>
      </div>
    </div>
  );
}
