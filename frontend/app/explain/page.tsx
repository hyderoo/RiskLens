"use client";
import Link from "next/link";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Async, PageHeader, Panel } from "@/components/kit";
import { AXIS, ChartTip, GRID } from "@/components/charts";
import { useApi } from "@/lib/api";

type Imp = { rows: { feature: string; mean_abs_shap: number; gain: number }[]; note: string };
type Model = { features: { name: string; description: string }[] };

export default function Explain() {
  const s = useApi<Imp>("/api/model/importance"); const m = useApi<Model>("/api/model");
  const desc = (n: string) => m.data?.features.find((f) => f.name === n)?.description ?? "";
  return (
    <>
      <PageHeader title="Explainability" kind="model" subtitle="Which inputs move the model's score. Importance describes the model, not causes of fraud." />
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
