"use client";
import { useState } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, Bar, BarChart, ReferenceLine } from "recharts";
import { Async, PageHeader, Panel } from "@/components/kit";
import { AXIS, ChartTip, GRID } from "@/components/charts";
import { Slider } from "@/components/ui/slider";
import { useApi } from "@/lib/api";
import { n0, pct, usd } from "@/lib/format";

type M = { test: { pr_auc: number; roc_auc: number; brier: number; at_threshold: { threshold: number; tp: number; fp: number; fn: number; precision: number; recall: number; f1: number; flagged: number } }; selected_threshold_validation: number; pr_curve: { precision: number; recall: number; threshold: number }[]; reliability: { mean_pred: number; observed: number; n: number }[] };
type Model = { disclaimer: string; config: Record<string, unknown>; features: { name: string; description: string }[]; models: Record<string, M>; base_rate_test: number; calibration: { gbm_brier_raw: number; gbm_brier_cal: number; note: string }; performance_over_time: { quarter: string; n: number; fraud: number; pr_auc: number; recall: number; precision: number }[]; accuracy_note: string; protocol: string };
type Thr = { tp: number; fp: number; fn: number; tn: number; precision: number; recall: number; f1: number; flagged: number; flagged_amount: number; fraud_amount_caught: number; fraud_amount_total: number; review_workload_per_1000_txns: number; scope: string };

export default function ModelLab() {
  const [t, setT] = useState(0.0319);
  const m = useApi<Model>("/api/model");
  const th = useApi<Thr>(`/api/model/threshold?threshold=${t}`);
  return (
    <>
      <PageHeader title="Model Lab" kind="model" subtitle="Temporal split, held-out test period scored once. Metrics are for this synthetic dataset and are modest by design of the problem: fraud is 0.18% of the test period." />
      <Async state={m} h="h-96">{(d) => {
        const names = Object.keys(d.models);
        const pr = (k: string) => d.models[k].pr_curve.filter((_, i) => i % 6 === 0).map((p) => ({ recall: p.recall, [k]: p.precision * 100 }));
        const rel = d.models["LightGBM"].reliability.map((r) => ({ pred: r.mean_pred * 100, obs: r.observed * 100 }));
        return (<div className="space-y-4">
          <p className="rounded-lg border border-medium/40 bg-medium/10 p-3 text-xs">{d.accuracy_note}</p>
          <Panel title="Model comparison (held-out test)" kind="model" note={d.protocol}>
            <table className="tnum w-full text-sm"><thead className="text-xs text-muted-foreground"><tr><th className="text-left font-normal">Model</th><th className="text-right font-normal">PR-AUC</th><th className="text-right font-normal">ROC-AUC</th><th className="text-right font-normal">Precision</th><th className="text-right font-normal">Recall</th><th className="text-right font-normal">F1</th><th className="text-right font-normal">Flagged</th></tr></thead>
              <tbody>{names.map((k) => { const x = d.models[k].test; return <tr key={k} className="border-t"><td className="py-2 font-medium">{k}</td><td className="text-right">{x.pr_auc.toFixed(4)}</td><td className="text-right">{x.roc_auc.toFixed(3)}</td><td className="text-right">{pct(x.at_threshold.precision, 1)}</td><td className="text-right">{pct(x.at_threshold.recall, 1)}</td><td className="text-right">{x.at_threshold.f1.toFixed(3)}</td><td className="text-right">{n0(x.at_threshold.flagged)}</td></tr>; })}</tbody></table>
            <p className="mt-2 text-[11px] text-muted-foreground">Each model uses its own validation-chosen threshold. A random model has PR-AUC equal to the base rate ({pct(d.base_rate_test, 2)}). Brier score: {d.calibration.gbm_brier_cal.toFixed(5)} calibrated vs {d.calibration.gbm_brier_raw.toFixed(5)} raw.</p>
          </Panel>
          <div className="grid gap-4 lg:grid-cols-2">
            <Panel title="Precision-recall curve" kind="model"><div className="h-64"><ResponsiveContainer><LineChart margin={{ left: 0, right: 8 }}><CartesianGrid stroke={GRID} /><XAxis type="number" dataKey="recall" domain={[0, 1]} {...AXIS} tickFormatter={(v: number) => (v * 100).toFixed(0) + "%"} /><YAxis {...AXIS} width={40} tickFormatter={(v: number) => v + "%"} /><Tooltip content={<ChartTip fmt={(_n, v) => v.toFixed(2) + "%"} />} />
              {names.map((k, i) => <Line key={k} data={pr(k)} dataKey={k} name={k} dot={false} strokeWidth={2} stroke={i ? "var(--chart-1)" : "var(--muted-foreground)"} />)}</LineChart></ResponsiveContainer></div></Panel>
            <Panel title="Calibration (LightGBM)" kind="model" note="Mean predicted vs observed fraud rate per score decile, in %."><div className="h-64"><ResponsiveContainer><LineChart data={rel} margin={{ left: 0, right: 8 }}><CartesianGrid stroke={GRID} /><XAxis dataKey="pred" {...AXIS} tickFormatter={(v: number) => v.toFixed(2)} /><YAxis {...AXIS} width={44} tickFormatter={(v: number) => v.toFixed(2)} /><Tooltip content={<ChartTip fmt={(_n, v) => v.toFixed(3) + "%"} />} /><Line dataKey="obs" name="Observed" stroke="var(--chart-5)" strokeWidth={2} /><Line dataKey="pred" name="Predicted" stroke="var(--chart-1)" strokeDasharray="4 4" dot={false} /></LineChart></ResponsiveContainer></div></Panel>
          </div>
          <Panel title="Threshold explorer" kind="model" note="Re-computed on the held-out test predictions by the backend. Lowering the threshold catches more fraud and creates more reviews.">
            <div className="text-xs text-muted-foreground">Threshold <span className="tnum font-medium text-foreground">{t.toFixed(4)}</span><Slider className="mt-3" min={0.0005} max={0.1} step={0.0005} value={[t]} onValueChange={(v) => setT(Array.isArray(v) ? v[0] : v)} aria-label="Threshold" /></div>
            <Async state={th} h="h-24">{(x) => (<div className="mt-4 grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
              {([["Precision", pct(x.precision, 1)], ["Recall", pct(x.recall, 1)], ["Flagged", n0(x.flagged)], ["False positives", n0(x.fp)], ["Frauds missed", n0(x.fn)], ["Reviews per 1,000 txns", x.review_workload_per_1000_txns.toFixed(2)], ["Flagged amount", usd(x.flagged_amount)], ["Fraud amount caught", `${usd(x.fraud_amount_caught)} of ${usd(x.fraud_amount_total)}`]] as const).map(([k, v]) => <div key={k}><div className="text-xs text-muted-foreground">{k}</div><div className="tnum font-medium">{v}</div></div>)}</div>)}</Async>
          </Panel>
          <Panel title="Performance over time (test)" kind="model" note="Quarterly PR-AUC varies a lot. Treat any single estimate with caution.">
            <div className="h-56"><ResponsiveContainer><BarChart data={d.performance_over_time}><CartesianGrid stroke={GRID} vertical={false} /><XAxis dataKey="quarter" {...AXIS} /><YAxis {...AXIS} width={44} /><Tooltip content={<ChartTip fmt={(_n, v) => v.toFixed(3)} />} /><ReferenceLine y={d.base_rate_test} stroke="var(--muted-foreground)" strokeDasharray="3 3" /><Bar dataKey="pr_auc" name="PR-AUC" fill="var(--chart-1)" radius={[3, 3, 0, 0]} /></BarChart></ResponsiveContainer></div>
          </Panel>
          <Panel title={`Features (${d.features.length})`} kind="model"><dl className="grid gap-x-6 gap-y-1.5 text-xs md:grid-cols-2">{d.features.map((f) => <div key={f.name}><dt className="inline font-medium">{f.name}</dt> <dd className="inline text-muted-foreground">{f.description}</dd></div>)}</dl></Panel>
          <p className="text-[11px] text-muted-foreground">{d.disclaimer}</p>
        </div>);
      }}</Async>
    </>
  );
}
