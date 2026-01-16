import { useEffect, useState } from "react";

type ConfigFormProps = {
  mm: any;
  vol: any;
  risk: any;
  onMmChange: (next: any) => void;
  onVolChange: (next: any) => void;
  onRiskChange: (next: any) => void;
  baseSymbol?: string;
  midPrice?: number | null;
  errors?: {
    budgetQuoteUsdt?: string;
    budgetBaseToken?: string;
  } | null;
};

export function ConfigForm({
  mm,
  vol,
  risk,
  onMmChange,
  onVolChange,
  onRiskChange,
  baseSymbol,
  midPrice,
  errors
}: ConfigFormProps) {
  const baseLabel = baseSymbol ? `Max Budget (${baseSymbol})` : "Max Budget (Token)";
  const minQuoteUsdt = 100;
  const minBaseToken = midPrice && Number.isFinite(midPrice) && midPrice > 0
    ? minQuoteUsdt / midPrice
    : null;
  const baseUnit = baseSymbol || "Token";
  const spreadPctDisplay = toPercent(mm.spreadPct);
  const maxSpreadPctDisplay = toPercent(mm.maxSpreadPct);
  const jitterPctDisplay = toPercent(mm.jitterPct);
  const maxDeviationDisplay = toPercent(risk.maxDeviationPct);
  return (
    <>
      <AccordionSection
        title="Market Making"
        defaultOpen
      >
        <div className="gridTwoCol">
          <div>
            <Field
              label="Spread (%)"
              hint="Best bid/ask spread around mid"
              value={spreadPctDisplay}
              onChange={(v) => onMmChange({ ...mm, spreadPct: fromPercent(v, mm.spreadPct) })}
            />
            <Field
              label="Max Spread (%)"
              hint="Spread between the farthest bid and ask prices"
              value={maxSpreadPctDisplay}
              onChange={(v) => onMmChange({ ...mm, maxSpreadPct: fromPercent(v, mm.maxSpreadPct) })}
            />
            <Field
              label="Asks count"
              hint="Sell levels above mid (max 30)"
              value={mm.levelsUp}
              onChange={(v) => onMmChange({ ...mm, levelsUp: toIntClamp(v, mm.levelsUp, 0, 30) })}
            />
            <Field
              label="Bids count"
              hint="Buy levels below mid (max 30)"
              value={mm.levelsDown}
              onChange={(v) => onMmChange({ ...mm, levelsDown: toIntClamp(v, mm.levelsDown, 0, 30) })}
            />
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
            <Field
              label="Max Budget (USDT)"
              hint="Total max budget for buy side (min 100 USDT)"
              value={mm.budgetQuoteUsdt}
              onChange={(v) => onMmChange({ ...mm, budgetQuoteUsdt: toMinNumber(v, mm.budgetQuoteUsdt, minQuoteUsdt) })}
              error={errors?.budgetQuoteUsdt}
            />
            <Field
              label={baseLabel}
              hint={
                minBaseToken
                  ? `Total max budget for sell side (min ~${formatFixed(minBaseToken, 0)} ${baseUnit})`
                  : "Total max budget for sell side (min 100 USDT in token value)"
              }
              value={mm.budgetBaseToken}
              onChange={(v) =>
                onMmChange({
                  ...mm,
                  budgetBaseToken: toMinNumber(v, mm.budgetBaseToken, minBaseToken ?? 0)
                })
              }
              error={errors?.budgetBaseToken}
            />
          </div>
          <div>
            <Field
              label="Min order (USDT)"
              hint="Per-order minimum notional (0 disables)"
              value={mm.minOrderUsdt ?? 0}
              onChange={(v) => onMmChange({ ...mm, minOrderUsdt: toNumber(v, mm.minOrderUsdt ?? 0) })}
            />
            <Field
              label="Max order (USDT)"
              hint="Per-order maximum notional (0 disables)"
              value={mm.maxOrderUsdt ?? 0}
              onChange={(v) => onMmChange({ ...mm, maxOrderUsdt: toNumber(v, mm.maxOrderUsdt ?? 0) })}
            />
            <Field
              label="Jitter (%)"
              hint="Randomize prices slightly"
              value={jitterPctDisplay}
              onChange={(v) => onMmChange({ ...mm, jitterPct: fromPercent(v, mm.jitterPct) })}
            />
            <Field label="Skew Factor" hint="Inventory based price shift" value={mm.skewFactor} onChange={(v) => onMmChange({ ...mm, skewFactor: toNumber(v, mm.skewFactor) })} />
            <Field label="Max Skew" hint="Clamp for inventory skew" value={mm.maxSkew} onChange={(v) => onMmChange({ ...mm, maxSkew: toNumber(v, mm.maxSkew) })} />
          </div>
        </div>
      </AccordionSection>

      <AccordionSection
        title="Volume Bot"
      >
        <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 8 }}>
          Generates small trades over time to reach your daily notional. Runs 24/7.
        </div>
        <Field
          label="Daily Notional (USDT)"
          hint="Total target volume per day"
          value={vol.dailyNotionalUsdt}
          onChange={(v) => onVolChange({ ...vol, dailyNotionalUsdt: toNumber(v, vol.dailyNotionalUsdt) })}
        />
        <Field
          label="Min Trade (USDT)"
          hint="Minimum size per trade (smaller trades look more natural)"
          value={vol.minTradeUsdt}
          onChange={(v) => onVolChange({ ...vol, minTradeUsdt: toNumber(v, vol.minTradeUsdt) })}
        />
        <Field
          label="Max Trade (USDT)"
          hint="Maximum size per trade"
          value={vol.maxTradeUsdt}
          onChange={(v) => onVolChange({ ...vol, maxTradeUsdt: toNumber(v, vol.maxTradeUsdt) })}
        />
        <Field
          label="Buy Ratio (%)"
          hint="Target share of buy trades (e.g. 75 = 75% buys)"
          value={toPercent(vol.buyPct ?? 0.5)}
          onChange={(v) => onVolChange({ ...vol, buyPct: fromPercent(v, vol.buyPct ?? 0.5) })}
        />
        <SelectField
          label="Mode"
          hint="Passive = post-only near mid. Mixed = mostly passive with occasional market orders. Active = pace to daily target with market orders."
          value={vol.mode}
          options={[
            { label: "Passive", value: "PASSIVE" },
            { label: "Mixed", value: "MIXED" },
            { label: "Active", value: "ACTIVE" }
          ]}
          onChange={(v) => onVolChange({ ...vol, mode: v })}
        />
      </AccordionSection>

      <AccordionSection
        title="Risk"
      >
        <Field label="Min Balance (USDT)" hint="Stop if balance drops below (0 disables)" value={risk.minUsdt} onChange={(v) => onRiskChange({ ...risk, minUsdt: toNumber(v, risk.minUsdt) })} />
        <Field
          label="Max Deviation (%)"
          hint="Pause on large price drift (0 disables)"
          value={maxDeviationDisplay}
          onChange={(v) => onRiskChange({ ...risk, maxDeviationPct: fromPercent(v, risk.maxDeviationPct) })}
        />
        <Field label="Max Open Orders" hint="Pause if open orders exceed (0 disables)" value={risk.maxOpenOrders} onChange={(v) => onRiskChange({ ...risk, maxOpenOrders: toNumber(v, risk.maxOpenOrders) })} />
        <Field label="Max Daily Loss (USDT)" hint="Stop if loss exceeds (0 disables)" value={risk.maxDailyLoss} onChange={(v) => onRiskChange({ ...risk, maxDailyLoss: toNumber(v, risk.maxDailyLoss) })} />
      </AccordionSection>
    </>
  );
}

function AccordionSection(props: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  return (
    <details className="card" style={{ padding: 12, marginBottom: 12 }} open={props.defaultOpen}>
      <summary style={{ cursor: "pointer", fontWeight: 700, marginBottom: 10 }}>{props.title}</summary>
      <div>{props.children}</div>
    </details>
  );
}

function Field(props: {
  label: string;
  hint?: string;
  value: any;
  onChange: (v: string) => void;
  error?: string;
}) {
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
    <label className="fieldRow">
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
      {props.error ? (
        <span className="fieldRowError">{props.error}</span>
      ) : null}
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
    <label className="fieldRow">
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

function toIntClamp(value: string, fallback: number, min: number, max: number) {
  const n = toNumber(value, fallback);
  if (!Number.isFinite(n)) return fallback;
  const rounded = Math.round(n);
  return Math.max(min, Math.min(max, rounded));
}

function toMinNumber(value: string, fallback: number, min: number) {
  const n = toNumber(value, fallback);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, n);
}

function toPercent(value: any) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "";
  return n * 100;
}

function fromPercent(value: string, fallbackDecimal: number) {
  const fallbackPct = Number.isFinite(fallbackDecimal) ? fallbackDecimal * 100 : 0;
  const pct = toNumber(value, fallbackPct);
  return pct / 100;
}

function formatNumber(value: any) {
  if (value === null || value === undefined) return "";
  return String(value);
}

function formatFixed(value: number, decimals: number) {
  if (!Number.isFinite(value)) return "";
  return value.toFixed(decimals).replace(/\.?0+$/, "");
}
