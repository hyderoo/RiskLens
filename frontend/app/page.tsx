"use client";
import Link from "next/link";
import { Bar, BarChart, CartesianGrid, Cell, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Async, BandPill, Kpi, LabelPill, PageHeader, Panel } from "@/components/kit";
import { AXIS, ChartTip, GRID } from "@/components/charts";
import { useApi } from "@/lib/api";
import { useGlobalQs } from "@/lib/useGlobal";
import { BAND_COLOR, compact, dt, n0, pct, score, usd, usdC } from "@/lib/format";

type Overview = {
  threshold: number;
  kpis: { transactions: number; total_amount: number; labeled: number; unlabeled: number; confirmed_fraud: number; fraud_rate_labeled: number | null; confirmed_fraud_amount: number; avg_fraud_amount: number | null; model_flagged: number; model_flagged_amount: number; flagged_labeled: number; flagged_fraud_labeled: number; latest_timestamp: string };
  model_eval_test: { scope: string; precision: number; recall: number; threshold: number; pr_auc: number };
  trend: { ym: string; n: number; amount: number; labeled: number; fraud: number; fraud_amount: number }[];
  risk_distribution: { band: string; n: number; amount: number; labeled: number; fraud: number }[];
  by_channel: { grp: string; n: number; labeled: number; fraud: number }[];
  top_mcc: { grp: string; mcc_desc: string | null; n: number; labeled: number; fraud: number }[];
  top_cases: { id: number; date: string; amount: number; merchant_city: string; mcc: string; use_chip: string; risk_score: number; is_fraud: boolean | null; band: string; label_status: string; split: string }[];
  definitions: Record<string, string>;
};

export default function Overview() {
  const q = useGlobalQs();
  const s = useApi<Overview>(`/api/overview${q}`);
  const dlq = (extra: string) => `/transactions${q ? q + "&" : "?"}${extra}`;
  return (
    <>
      <PageHeader title="Executive Overview" kind="historical"
        subtitle="Portfolio-level view of a public synthetic transactions dataset. Confirmed fraud comes from the dataset's labels; model flags are estimates and are never counted as confirmed fraud." />
      <Async state={s} h="h-[560px]">{(d) => {
        const k = d.kpis;
        const trend = d.trend.map((t) => ({ ...t, rate: t.labeled ? (t.fraud / t.labeled) * 100 : null }));
        const bands = ["low", "medium", "high", "critical"].map((b) => d.risk_distribution.find((r) => r.band === b) ?? { band: b, n: 0, labeled: 0, fraud: 0, amount: 0 });
        return (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
              <Kpi label="Transactions" value={n0(k.transactions)} sub={`${n0(k.labeled)} labeled · ${n0(k.unlabeled)} unlabeled`} kind="historical" href={dlq("")} hint="All transactions matching the filters." />
              <Kpi label="Total value" value={usdC(k.total_amount)} sub="Sum of signed amounts" kind="historical" />
              <Kpi label="Confirmed fraud" value={n0(k.confirmed_fraud)} sub={`${pct(k.fraud_rate_labeled, 3)} of labeled`} kind="historical" href={dlq("label=fraud")} hint="Rows labeled Yes. Unlabeled rows are excluded from the rate." />
              <Kpi label="Confirmed fraud amount" value={usd(k.confirmed_fraud_amount)} sub={`avg ${usd(k.avg_fraud_amount, 2)} per fraud`} kind="historical" href={dlq("label=fraud&sort=amount")} />
              <Kpi label="Model-flagged" value={n0(k.model_flagged)} sub={`${usdC(k.model_flagged_amount)} · score ≥ ${score(d.threshold)}`} kind="model" href={dlq(`score_min=${d.threshold}&sort=risk_score`)} hint="A flag is a model estimate, not confirmed fraud. Rows before 2017 are in-sample." />
              <Kpi label="Test precision / recall" value={<span>{pct(d.model_eval_test.precision, 1)} <span className="text-base text-muted-foreground">/ {pct(d.model_eval_test.recall, 1)}</span></span>} sub="Held-out test, threshold chosen on validation" kind="model" href="/model" />
            </div>

            <div className="grid gap-4 xl:grid-cols-3">
              <Panel title="Volume and confirmed fraud over time" kind="historical" className="xl:col-span-2" note="Monthly. Fraud rate uses labeled transactions only. The uneven fraud counts across years look like a property of the synthetic generator.">
                <div className="h-72"><ResponsiveContainer>
                  <ComposedChart data={trend} margin={{ left: 0, right: 8, top: 8 }}>
                    <CartesianGrid stroke={GRID} vertical={false} />
                    <XAxis dataKey="ym" {...AXIS} tickFormatter={(v: string) => v.slice(0, 4)} interval={11} />
                    <YAxis yAxisId="l" {...AXIS} tickFormatter={compact} width={44} />
                    <YAxis yAxisId="r" orientation="right" {...AXIS} tickFormatter={(v: number) => v.toFixed(2) + "%"} width={48} />
                    <Tooltip content={<ChartTip fmt={(n, v) => n.includes("rate") ? v.toFixed(3) + "%" : n0(v)} />} />
                    <Bar yAxisId="l" dataKey="n" name="Transactions" fill="var(--chart-1)" fillOpacity={0.45} radius={[2, 2, 0, 0]} />
                    <Line yAxisId="r" dataKey="rate" name="Fraud rate (labeled)" stroke="var(--chart-5)" strokeWidth={2} dot={false} connectNulls />
                  </ComposedChart>
                </ResponsiveContainer></div>
              </Panel>
              <Panel title="Model risk bands" kind="model" note="Band cut-offs apply to the calibrated probability and are configurable on the Risk Scoring page. Observed fraud rate uses labeled rows.">
                <div className="h-44"><ResponsiveContainer>
                  <BarChart data={bands} layout="vertical" margin={{ left: 8, right: 12 }}>
                    <XAxis type="number" {...AXIS} tickFormatter={compact} /><YAxis type="category" dataKey="band" {...AXIS} width={60} />
                    <Tooltip content={<ChartTip />} cursor={{ fill: "var(--accent)" }} />
                    <Bar dataKey="n" name="Transactions" radius={[0, 3, 3, 0]}>{bands.map((b) => <Cell key={b.band} fill={BAND_COLOR[b.band]} />)}</Bar>
                  </BarChart>
                </ResponsiveContainer></div>
                <table className="tnum w-full text-xs"><thead className="text-muted-foreground"><tr><th className="text-left font-normal">Band</th><th className="text-right font-normal">Txns</th><th className="text-right font-normal">Fraud rate</th></tr></thead>
                  <tbody>{bands.map((r) => <tr key={r.band}><td className="py-0.5"><BandPill band={r.band} /></td><td className="text-right">{n0(r.n)}</td><td className="text-right">{r.labeled ? pct(r.fraud / r.labeled, 2) : "-"}</td></tr>)}</tbody></table>
              </Panel>
            </div>

            <div className="grid gap-4 xl:grid-cols-3">
              <Panel title="Fraud rate by channel" kind="historical" note="Labeled transactions only. Counts shown with rates because the base rate is very low.">
                <div className="space-y-3">{d.by_channel.map((c) => { const r = c.labeled ? c.fraud / c.labeled : 0; const max = Math.max(...d.by_channel.map((x) => (x.labeled ? x.fraud / x.labeled : 0)), 1e-9);
                  return <Link key={c.grp} href={dlq(`use_chip=${encodeURIComponent(c.grp)}&label=fraud`)} className="block rounded-md p-1.5 hover:bg-accent/50"><div className="flex justify-between text-xs"><span>{c.grp.replace(" Transaction", "")}</span><span className="tnum text-muted-foreground">{n0(c.fraud)} frauds · <span className="font-medium text-foreground">{pct(r, 3)}</span></span></div><div className="mt-1 h-1.5 rounded bg-muted"><div className="h-full rounded bg-chart-5" style={{ width: `${(r / max) * 100}%` }} /></div></Link>; })}</div>
              </Panel>
              <Panel title="Merchant categories with most confirmed fraud" kind="historical" note="Top 8 by fraud count. Click to open the underlying transactions.">
                <table className="tnum w-full text-xs"><tbody>{d.top_mcc.map((m) => <tr key={m.grp} className="border-t first:border-0"><td className="py-1.5 pr-2"><Link className="hover:text-primary" href={dlq(`mcc=${m.grp}&label=fraud`)}>{m.mcc_desc ?? m.grp}</Link></td><td className="text-right">{n0(m.fraud)}</td><td className="w-16 text-right text-muted-foreground">{m.labeled ? pct(m.fraud / m.labeled, 2) : "-"}</td></tr>)}</tbody></table>
              </Panel>
              <Panel title="Highest-priority cases to review" kind="model" note="Top model scores in the out-of-sample periods (2017+). Priority is a model estimate; the label column shows what the dataset says.">
                <table className="w-full text-xs"><tbody>{d.top_cases.map((c) => <tr key={c.id} className="border-t first:border-0"><td className="py-1.5"><Link className="tnum hover:text-primary" href={`/transactions?txn_id=${c.id}`}>#{c.id}</Link><div className="text-[10px] text-muted-foreground">{dt(c.date)}</div></td><td className="tnum">{usd(c.amount, 2)}</td><td className="tnum">{score(c.risk_score)}</td><td className="text-right"><LabelPill status={c.label_status} /></td></tr>)}</tbody></table>
              </Panel>
            </div>

            <Panel title="Metric definitions" note={d.definitions.caveat}>
              <dl className="grid gap-x-6 gap-y-2 text-xs md:grid-cols-3">{Object.entries(d.definitions).filter(([k]) => k !== "caveat").map(([k, v]) => <div key={k}><dt className="font-medium capitalize">{k.replace(/_/g, " ")}</dt><dd className="text-muted-foreground">{v}</dd></div>)}</dl>
            </Panel>
          </div>
        );
      }}</Async>
    </>
  );
}
