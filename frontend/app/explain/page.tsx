"use client";
import Link from "next/link";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Async, PageHeader, Panel } from "@/components/kit";
import { AXIS, ChartTip, GRID } from "@/components/charts";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api, useApi } from "@/lib/api";
import { score as fmtScore } from "@/lib/format";

type Imp = { rows: { feature: string; mean_abs_shap: number; gain: number }[]; note: string };
type Model = { features: { name: string; description: string }[] };

type Feat = { feature: string; description: string; value: string | number | null; contribution: number; direction: string };
type One = { transaction: Record<string, string | number | boolean | null>; explanation: { baseline_log_odds: number; top_features: Feat[] }; indicators: string[]; explanation_note: string };

function Lookup() {
  const [id, setId] = useState(""); const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null); const [one, setOne] = useState<One | null>(null);
  const ok = /^\d{1,12}$/.test(id.trim());
  async function run() {
    if (!ok) return; setBusy(true); setErr(null);
    try { setOne(await api<One>(`/api/transactions/${id.trim()}`)); } catch (e) { setOne(null); setErr((e as Error).message); }
    setBusy(false);
  }
  const max = one ? Math.max(...one.explanation.top_features.map((y) => Math.abs(y.contribution)), 1e-9) : 1;
  return (
    <Panel title="Explain one transaction" kind="model" className="mb-4" note="Enter a transaction ID from the Transaction Explorer. Contributions are TreeSHAP values in log-odds relative to the model baseline.">
      <form className="flex flex-wrap items-end gap-3" onSubmit={(e) => { e.preventDefault(); run(); }}>
        <label className="text-xs text-muted-foreground">Transaction ID
          <Input inputMode="numeric" value={id} onChange={(e) => setId(e.target.value)} aria-invalid={id !== "" && !ok} className="tnum mt-1 h-8 w-48" placeholder="e.g. 23741689" /></label>
        <Button type="submit" size="sm" disabled={!ok || busy}>{busy ? "Loading..." : "Explain"}</Button>
        {id !== "" && !ok && <span role="alert" className="text-xs text-destructive">Digits only.</span>}
      </form>
      {err && <p role="alert" className="mt-3 text-xs text-destructive">{err}</p>}
      {one && (
        <div className="mt-4 grid gap-6 md:grid-cols-2">
          <div className="text-xs"><div className="mb-1 font-medium">Transaction #{String(one.transaction.id)} · model score {fmtScore(Number(one.transaction.risk_score))}</div>
            <ul className="list-disc space-y-1 pl-4 text-muted-foreground">{one.indicators.length ? one.indicators.map((x) => <li key={x}>{x}</li>) : <li>No rule-based indicators fired.</li>}</ul></div>
          <ul className="space-y-1.5">{one.explanation.top_features.slice(0, 8).map((x) => (
            <li key={x.feature} className="text-xs"><div className="flex justify-between"><span title={x.description}>{x.feature} = <span className="tnum">{x.value === null ? "missing" : typeof x.value === "number" ? Math.round(x.value * 100) / 100 : x.value}</span></span>
              <span className={x.contribution > 0 ? "text-critical" : "text-low"}>{x.contribution > 0 ? "raises " : "lowers "}{x.contribution > 0 ? "+" : ""}{x.contribution.toFixed(2)}</span></div>
              <div className="mt-0.5 h-1 rounded bg-muted"><div className={`h-full rounded ${x.contribution > 0 ? "bg-critical" : "bg-low"}`} style={{ width: `${(Math.abs(x.contribution) / max) * 100}%` }} /></div></li>))}</ul>
        </div>)}
    </Panel>
  );
}

export default function Explain() {
  const s = useApi<Imp>("/api/model/importance"); const m = useApi<Model>("/api/model");
  const desc = (n: string) => m.data?.features.find((f) => f.name === n)?.description ?? "";
  return (
    <>
      <PageHeader title="Explainability" kind="model" subtitle="Which inputs move the model's score. Importance describes the model, not causes of fraud." />
      <Lookup />
      <Async state={s} h="h-96">{(d) => (
        <div className="grid gap-4 lg:grid-cols-5">
          <Panel title="Global importance (mean |SHAP|)" kind="model" className="lg:col-span-3" note={d.note}>
            <div className="h-[28rem]"><ResponsiveContainer><BarChart data={d.rows.slice(0, 15)} layout="vertical" margin={{ left: 20, right: 12 }}><CartesianGrid stroke={GRID} strokeDasharray="2 5" horizontal={false} /><XAxis type="number" {...AXIS} /><YAxis type="category" dataKey="feature" {...AXIS} width={150} /><Tooltip content={<ChartTip fmt={(_n, v) => v.toFixed(3)} />} cursor={{ fill: "var(--accent)" }} /><Bar isAnimationActive={false} dataKey="mean_abs_shap" name="Mean |SHAP|" fill="var(--chart-1)" /></BarChart></ResponsiveContainer></div>
          </Panel>
          <Panel title="Reading the top drivers" kind="model" className="lg:col-span-2">
            <ul className="space-y-3 text-xs">{d.rows.slice(0, 6).map((r) => <li key={r.feature}><div className="font-medium">{r.feature}</div><div className="text-muted-foreground">{desc(r.feature)}</div></li>)}</ul>
            <p className="mt-4 text-xs text-muted-foreground">For one transaction, open it in the <Link className="text-primary hover:underline" href="/transactions">Transaction Explorer</Link> to see its own feature contributions. SHAP values are on the log-odds scale of the uncalibrated model.</p>
          </Panel>
        </div>)}</Async>
    </>
  );
}
