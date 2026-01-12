import Link from "next/link";
import { apiGet } from "../lib/api";

type Bot = { id: string; name: string; symbol: string; exchange: string; status: string; mmEnabled: boolean; volEnabled: boolean };

export default async function Page() {
  const bots = await apiGet<Bot[]>("/bots");
  const runtimes = await Promise.all(
    bots.map((b) =>
      apiGet<any>(`/bots/${b.id}/runtime`).catch(() => null)
    )
  );
  const total = bots.length;
  const running = bots.filter((b) => b.status === "RUNNING").length;
  const paused = bots.filter((b) => b.status === "PAUSED").length;
  const stopped = bots.filter((b) => b.status === "STOPPED").length;
  const errored = bots.filter((b) => b.status === "ERROR").length;
  const now = Date.now();
  const runnerOnline = runtimes.some((rt) => {
    const updated = rt?.updatedAt ? new Date(rt.updatedAt).getTime() : NaN;
    return Number.isFinite(updated) && now - updated <= 15_000;
  });
  const runnerOffline = bots.length > 0 && !runnerOnline;

  return (
    <div>
      <div className="dashboardHeader">
        <div>
          <h2 style={{ margin: 0 }}>Dashboard</h2>
          <div style={{ fontSize: 13, color: "var(--muted)" }}>Active bots and live status overview.</div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Link href="/bots/new" className="btn btnPrimary">New Bot</Link>
          <Link href="/settings" className="btn">Settings</Link>
        </div>
      </div>

      <div className="statGrid">
        <div className="card statCard">
          <div className="statLabel">Total bots</div>
          <div className="statValue">{total}</div>
        </div>
        <div className="card statCard">
          <div className="statLabel">Running</div>
          <div className="statValue">{running}</div>
        </div>
        <div className="card statCard">
          <div className="statLabel">Paused</div>
          <div className="statValue">{paused}</div>
        </div>
        <div className="card statCard">
          <div className="statLabel">Stopped</div>
          <div className="statValue">{stopped}</div>
        </div>
        <div className="card statCard">
          <div className="statLabel">Errors</div>
          <div className="statValue">{errored}</div>
          {runnerOffline ? (
            <div className="statNote statNoteDanger">Runner offline</div>
          ) : null}
        </div>
      </div>

      <div className="botGrid">
        {bots.length === 0 ? (
          <div className="card" style={{ padding: 16 }}>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>No bots yet</div>
            <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 10 }}>
              Create your first bot to start market making.
            </div>
            <Link href="/bots/new" className="btn btnPrimary">New Bot</Link>
          </div>
        ) : (
          bots.map((b) => (
            <div key={b.id} className="card botCard">
              <div className="botCardHeader">
                <div>
                  <div className="botName">{b.name}</div>
                  <div className="botMeta">{b.symbol} · {b.exchange}</div>
                </div>
                <span className={`badge ${statusBadge(b.status)}`}>{b.status.toLowerCase()}</span>
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
                <span className={`badge ${b.mmEnabled ? "badgeOk" : "badgeWarn"}`}>MM {b.mmEnabled ? "running" : "stopped"}</span>
                <span className={`badge ${b.volEnabled ? "badgeOk" : "badgeWarn"}`}>Volume {b.volEnabled ? "running" : "stopped"}</span>
              </div>
              <div style={{ marginTop: 12 }}>
                <Link href={`/bots/${b.id}`} className="btn">
                  Open bot →
                </Link>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function statusBadge(status: string) {
  if (status === "RUNNING") return "badgeOk";
  if (status === "PAUSED") return "badgeWarn";
  if (status === "ERROR") return "badgeDanger";
  return "";
}
