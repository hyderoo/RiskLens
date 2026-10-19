"use client";
import { useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Async, PageHeader, Panel } from "@/components/kit";
import { AXIS, ChartTip, GRID } from "@/components/charts";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useApi } from "@/lib/api";
import { useGlobalQs } from "@/lib/useGlobal";
import { n0, pct, usd } from "@/lib/format";

type Fraud = { dimension: string; base_rate: number | null; labeled: number; fraud: number; rows: { grp: string; mcc_desc: string | null; labeled: number; fraud: number; fraud_amount: number; fraud_rate: number | null; share_of_fraud: number | null; low_sample: boolean }[]; note: string };
type Summary = { amount_by_label: { label: string; n: number; mean: number; median: number; p95: number; p99: number; max: number }[]; high_value: { threshold: number; n: number; fraud: number; labeled: number; fraud_amt: number }; outliers: { rule: string; n: number; fraud: number; labeled: number }; concentration: { clients: number; clients_with_fraud: number; fraud: number; share_in_top_1pct_clients: number; share_in_top_10pct_clients: number } };
type Hist = { bucket_width: number; note: string; rows: { bucket: number; n: number; fraud: number; labeled: number }[] };
const DIMS: [string, string][] = [["use_chip", "Channel"], ["mcc", "Merchant category"], ["merchant_state", "Merchant state"], ["year", "Year"], ["hour", "Hour of day"], ["dow", "Day of week"], ["card_brand", "Card brand"], ["card_type", "Card type"]];

export default function Analytics() {
  const [dim, setDim] = useState("use_chip");
  const q = useGlobalQs();
  const f = useApi<Fraud>(`/api/analytics/fraud${q}${q ? "&" : "?"}dimension=${dim}&limit=15`);
  const s = useApi<Summary>(`/api/analytics/summary${q}`);
  const h = useApi<Hist>(`/api/analytics/amount-histogram${q}`);
  return (
    <>
      <PageHeader title="Fraud Analytics" kind="historical" subtitle="Where confirmed fraud concentrates. Rates use labeled transactions only. Associations are descriptive, not causal." />
      <Panel title="Fraud rate by dimension" kind="historical" className="mb-4" note={f.data?.note}
        action={<Select value={dim} onValueChange={(v) => setDim(v ?? "use_chip")}><SelectTrigger className="h-8 w-48"><SelectValue /></SelectTrigger><SelectContent>{DIMS.map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent></Select>}>
        <Async state={f} h="h-80">{(d) => (
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="h-80"><ResponsiveContainer><BarChart data={d.rows.map((r) => ({ ...r, rate: (r.fraud_rate ?? 0) * 100, label: r.mcc_desc ? `${r.grp}` : r.grp }))} margin={{ left: 0, right: 8 }}>
              <CartesianGrid stroke={GRID} vertical={false} /><XAxis dataKey="label" {...AXIS} interval={0} angle={-30} textAnchor="end" height={55} /><YAxis {...AXIS} tickFormatter={(v: number) => v + "%"} width={44} />
              <Tooltip content={<ChartTip fmt={(_n, v) => v.toFixed(3) + "%"} />} cursor={{ fill: "var(--accent)" }} />
              <Bar isAnimationActive={false} dataKey="rate" name="Fraud rate" radius={[3, 3, 0, 0]}>{d.rows.map((r) => <Cell key={r.grp} fill={r.low_sample ? "var(--muted-foreground)" : "var(--chart-1)"} fillOpacity={r.low_sample ? 0.4 : 1} />)}</Bar>
            </BarChart></ResponsiveContainer></div>
            <div className="max-h-80 overflow-auto"><table className="tnum w-full text-xs"><thead className="sticky top-0 bg-card text-muted-foreground"><tr><th className="text-left font-normal">Group</th><th className="text-right font-normal">Labeled</th><th className="text-right font-normal">Fraud</th><th className="text-right font-normal">Rate</th><th className="text-right font-normal">Share</th></tr></thead>
              <tbody>{d.rows.map((r) => <tr key={r.grp} className="border-t"><td className="py-1">{r.grp}{r.mcc_desc ? ` · ${r.mcc_desc}` : ""}{r.low_sample && <span className="ml-1 text-[10px] text-muted-foreground">(small sample)</span>}</td><td className="text-right">{n0(r.labeled)}</td><td className="text-right">{n0(r.fraud)}</td><td className="text-right">{pct(r.fraud_rate, 3)}</td><td className="text-right">{pct(r.share_of_fraud, 1)}</td></tr>)}</tbody></table></div>
            <p className="text-[11px] text-muted-foreground lg:col-span-2">Overall labeled base rate {pct(d.base_rate, 3)} ({n0(d.fraud)} frauds in {n0(d.labeled)} labeled). Grey bars have too few labeled rows for a stable rate.</p>
          </div>)}</Async>
      </Panel>
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Amount behaviour" kind="historical" note="Labeled transactions only.">
          <Async state={s} h="h-48">{(d) => (<div className="space-y-3">
            <table className="tnum w-full text-xs"><thead className="text-muted-foreground"><tr><th className="text-left font-normal">Label</th><th className="text-right font-normal">Mean</th><th className="text-right font-normal">Median</th><th className="text-right font-normal">p95</th><th className="text-right font-normal">p99</th></tr></thead>
              <tbody>{d.amount_by_label.map((r) => <tr key={String(r.label)} className="border-t"><td className="py-1">{String(r.label) === "true" || String(r.label) === "1" ? "Fraud" : "Non-fraud"}</td><td className="text-right">{usd(r.mean, 2)}</td><td className="text-right">{usd(r.median, 2)}</td><td className="text-right">{usd(r.p95, 2)}</td><td className="text-right">{usd(r.p99, 2)}</td></tr>)}</tbody></table>
            <p className="text-xs text-muted-foreground">Amounts of {usd(d.high_value.threshold)}+: {n0(d.high_value.n)} transactions, {n0(d.high_value.fraud)} confirmed frauds ({pct(d.high_value.labeled ? d.high_value.fraud / d.high_value.labeled : null, 2)} of labeled).</p>
            <p className="text-xs text-muted-foreground">Outlier rule ({d.outliers.rule}): {n0(d.outliers.n)} rows, {n0(d.outliers.fraud)} frauds.</p>
          </div>)}</Async></Panel>
        <Panel title="Client concentration" kind="historical" note="How concentrated confirmed fraud is across clients.">
          <Async state={s} h="h-48">{(d) => (<dl className="grid grid-cols-2 gap-3 text-sm">
            <div><dt className="text-xs text-muted-foreground">Clients</dt><dd className="tnum">{n0(d.concentration.clients)}</dd></div>
            <div><dt className="text-xs text-muted-foreground">Clients with confirmed fraud</dt><dd className="tnum">{n0(d.concentration.clients_with_fraud)}</dd></div>
            <div><dt className="text-xs text-muted-foreground">Fraud in top 1% of clients</dt><dd className="tnum">{pct(d.concentration.share_in_top_1pct_clients, 1)}</dd></div>
            <div><dt className="text-xs text-muted-foreground">Fraud in top 10% of clients</dt><dd className="tnum">{pct(d.concentration.share_in_top_10pct_clients, 1)}</dd></div></dl>)}</Async></Panel>
        <Panel title="Amount distribution" kind="historical" className="lg:col-span-2" note={h.data?.note}>
          <Async state={h} h="h-64">{(d) => (<div className="h-64"><ResponsiveContainer><BarChart data={d.rows} margin={{ left: 0, right: 8 }}><CartesianGrid stroke={GRID} vertical={false} /><XAxis dataKey="bucket" {...AXIS} tickFormatter={(v: number) => "$" + v} /><YAxis {...AXIS} width={50} tickFormatter={(v: number) => (v >= 1e6 ? (v / 1e6).toFixed(1) + "M" : v >= 1e3 ? (v / 1e3).toFixed(0) + "k" : String(v))} /><Tooltip content={<ChartTip fmt={(_n, v) => n0(v)} />} /><Bar isAnimationActive={false} dataKey="n" name="Transactions" fill="var(--chart-1)" fillOpacity={0.6} /><Bar isAnimationActive={false} dataKey="fraud" name="Confirmed fraud" fill="var(--chart-5)" /></BarChart></ResponsiveContainer></div>)}</Async></Panel>
      </div>
    </>
  );
}
