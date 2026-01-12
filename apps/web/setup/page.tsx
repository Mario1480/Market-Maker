"use client";

import { useState } from "react";
import { apiPost } from "../../lib/api";

export default function Setup() {
  const [msg, setMsg] = useState("");

  async function create() {
    setMsg("creating...");
    try {
      await apiPost("/bots", {
        id: "local-bot-1",
        name: "USHARK MM",
        symbol: "USHARK_USDT",
        exchange: "bitmart"
      });
      setMsg("created local-bot-1. Go back to Bots.");
    } catch (e: any) {
      setMsg(String(e));
    }
  }

  return (
    <div>
      <h2>Setup</h2>
      <button onClick={create}>Create default bot (local-bot-1)</button>
      <p>{msg}</p>
    </div>
  );
}