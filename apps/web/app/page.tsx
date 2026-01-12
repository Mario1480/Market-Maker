import Link from "next/link";
import { apiGet } from "../lib/api";

type Bot = { id: string; name: string; symbol: string; exchange: string; status: string };

export default async function Page() {
  const bots = await apiGet<Bot[]>("/bots");

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h2>Bots</h2>
        <Link href="/setup">Setup</Link>
      </div>

      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th align="left">Name</th>
            <th align="left">Symbol</th>
            <th align="left">Exchange</th>
            <th align="left">Status</th>
          </tr>
        </thead>
        <tbody>
          {bots.map((b) => (
            <tr key={b.id} style={{ borderTop: "1px solid #ddd" }}>
              <td><Link href={`/bots/${b.id}`}>{b.name}</Link></td>
              <td>{b.symbol}</td>
              <td>{b.exchange}</td>
              <td>{b.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}