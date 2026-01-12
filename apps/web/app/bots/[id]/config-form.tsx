import { useEffect, useState } from "react";

type ConfigFormProps = {
  mm: any;
  vol: any;
  risk: any;
  onMmChange: (next: any) => void;
  onVolChange: (next: any) => void;
  onRiskChange: (next: any) => void;
};

export function ConfigForm({ mm, vol, risk, onMmChange, onVolChange, onRiskChange }: ConfigFormProps) {
  return (
    <>
      <Section title="Market Making">
        <Field label="Spread (%)" hint="Best bid/ask spread around mid" value={mm.spreadPct} onChange={(v) => onMmChange({ ...mm, spreadPct: toNumber(v, mm.spreadPct) })} />
        <Field label="Max Spread (%)" hint="Spread between the farthest bid and ask prices" value={mm.maxSpreadPct} onChange={(v) => onMmChange({ ...mm, maxSpreadPct: toNumber(v, mm.maxSpreadPct) })} />
        <Field label="Asks count" hint="Sell levels above mid" value={mm.levelsUp} onChange={(v) => onMmChange({ ...mm, levelsUp: toNumber(v, mm.levelsUp) })} />
        <Field label="Bids count" hint="Buy levels below mid" value={mm.levelsDown} onChange={(v) => onMmChange({ ...mm, levelsDown: toNumber(v, mm.levelsDown) })} />
        <Field label="Max Budget (USDT)" hint="Total max budget for buy side" value={mm.budgetQuoteUsdt} onChange={(v) => onMmChange({ ...mm, budgetQuoteUsdt: toNumber(v, mm.budgetQuoteUsdt) })} />
        <Field label="Max Budget (Token)" hint="Total max budget for sell side" value={mm.budgetBaseToken} onChange={(v) => onMmChange({ ...mm, budgetBaseToken: toNumber(v, mm.budgetBaseToken) })} />
        <SelectField
          label="Order distribution"
          hint="How size is distributed across levels"
          value={mm.distribution}
          options={[
            { label: "Linear", value: "LINEAR" },
            { label: "Valley", value: "VALLEY" },
            { label: "Random", value: "RANDOM" }
          ]}
          onChange={(v) => onMmChange({ ...mm, distribution: v })}
        />
        <Field label="Jitter (%)" hint="Randomize prices slightly" value={mm.jitterPct} onChange={(v) => onMmChange({ ...mm, jitterPct: toNumber(v, mm.jitterPct) })} />
        <Field label="Skew Factor" hint="Inventory based price shift" value={mm.skewFactor} onChange={(v) => onMmChange({ ...mm, skewFactor: toNumber(v, mm.skewFactor) })} />
        <Field label="Max Skew" hint="Clamp for inventory skew" value={mm.maxSkew} onChange={(v) => onMmChange({ ...mm, maxSkew: toNumber(v, mm.maxSkew) })} />
      </Section>

      <Section title="Volume Bot">
        <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 8 }}>
          Passive = post-only around mid. Mixed may place occasional market orders.
        </div>
        <Field label="Daily Notional (USDT)" hint="Target daily volume" value={vol.dailyNotionalUsdt} onChange={(v) => onVolChange({ ...vol, dailyNotionalUsdt: toNumber(v, vol.dailyNotionalUsdt) })} />
        <Field label="Min Trade (USDT)" hint="Lower bound per trade" value={vol.minTradeUsdt} onChange={(v) => onVolChange({ ...vol, minTradeUsdt: toNumber(v, vol.minTradeUsdt) })} />
        <Field label="Max Trade (USDT)" hint="Upper bound per trade" value={vol.maxTradeUsdt} onChange={(v) => onVolChange({ ...vol, maxTradeUsdt: toNumber(v, vol.maxTradeUsdt) })} />
        <Field label="Active From (HH:MM)" hint="Trading window start" value={vol.activeFrom} onChange={(v) => onVolChange({ ...vol, activeFrom: v })} />
        <Field label="Active To (HH:MM)" hint="Trading window end" value={vol.activeTo} onChange={(v) => onVolChange({ ...vol, activeTo: v })} />
        <SelectField
          label="Mode"
          hint="Passive or mixed execution"
          value={vol.mode}
          options={[
            { label: "Passive", value: "PASSIVE" },
            { label: "Mixed", value: "MIXED" }
          ]}
          onChange={(v) => onVolChange({ ...vol, mode: v })}
        />
      </Section>

      <Section title="Risk">
        <Field label="Min Balance (USDT)" hint="Stop if balance drops below (0 disables)" value={risk.minUsdt} onChange={(v) => onRiskChange({ ...risk, minUsdt: toNumber(v, risk.minUsdt) })} />
        <Field label="Max Deviation (%)" hint="Pause on large price drift (0 disables)" value={risk.maxDeviationPct} onChange={(v) => onRiskChange({ ...risk, maxDeviationPct: toNumber(v, risk.maxDeviationPct) })} />
        <Field label="Max Open Orders" hint="Pause if open orders exceed (0 disables)" value={risk.maxOpenOrders} onChange={(v) => onRiskChange({ ...risk, maxOpenOrders: toNumber(v, risk.maxOpenOrders) })} />
        <Field label="Max Daily Loss (USDT)" hint="Stop if loss exceeds (0 disables)" value={risk.maxDailyLoss} onChange={(v) => onRiskChange({ ...risk, maxDailyLoss: toNumber(v, risk.maxDailyLoss) })} />
      </Section>
    </>
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

function Field(props: { label: string; hint?: string; value: any; onChange: (v: string) => void }) {
  const [draft, setDraft] = useState<string>(formatNumber(props.value));

  useEffect(() => {
    setDraft(formatNumber(props.value));
  }, [props.value]);

  function handleChange(raw: string) {
    setDraft(raw);

    if (raw === "" || raw.endsWith(",") || raw.endsWith(".")) return;
    props.onChange(raw);
  }

  return (
    <label style={{ display: "grid", gridTemplateColumns: "180px 1fr", gap: 8, marginBottom: 8, alignItems: "center" }}>
      <span style={{ fontSize: 13 }}>
        {props.label}
        {props.hint ? (
          <span style={{ display: "block", fontSize: 11, opacity: 0.7 }}>{props.hint}</span>
        ) : null}
      </span>
      <input
        value={draft}
        onChange={(e) => handleChange(e.target.value)}
        inputMode="decimal"
        className="input"
      />
    </label>
  );
}

function SelectField(props: {
  label: string;
  hint?: string;
  value: string;
  options: { label: string; value: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <label style={{ display: "grid", gridTemplateColumns: "180px 1fr", gap: 8, marginBottom: 8, alignItems: "center" }}>
      <span style={{ fontSize: 13 }}>
        {props.label}
        {props.hint ? (
          <span style={{ display: "block", fontSize: 11, opacity: 0.7 }}>{props.hint}</span>
        ) : null}
      </span>
      <select
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        className="input"
      >
        {props.options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function toNumber(value: string, fallback: number) {
  const v = value.replace(",", ".");
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function formatNumber(value: any) {
  if (value === null || value === undefined) return "";
  return String(value);
}
