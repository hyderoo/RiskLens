"use client";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Async, PageHeader, Panel } from "@/components/kit";
import { AXIS, ChartTip, GRID } from "@/components/charts";
import { useApi } from "@/lib/api";
import { n0, pct } from "@/lib/format";

type Mon = { disclaimer: string; quality: { rows: number; missing: Record<string, { count: number; rate: number }>; invalid: Record<string, number>; duplicates: { duplicate_ids: number }; by_month: { ym: string; n: number; labeled: number; fraud: number }[]; notes: string[] }; drift: { feature: string; compared: string; psi: number }[]; performance_over_time: { quarter: string; pr_auc: number; recall: number; precision: number; fraud: number }[]; alerts: { kind: string; severity: string; subject: string; detail: string }[]; config: { psi_warn: number; psi_alert: number; min_recall: number; max_missing_rate: number }; notes: string[] };
const sev: Record<string, string> = { low: "bg-low/15 text-low", medium: "bg-medium/20 text-medium", high: "bg-high/15 text-high", critical: "bg-critical/15 text-critical" };

export default function Monitoring() {
  const s = useApi<Mon>("/api/monitoring");
  return (
    <>
      <PageHeader title="Risk Monitoring" kind="model" subtitle="Data quality, feature drift (PSI) and model performance over time. Alerts are rule-based on the thresholds shown, computed from this dataset." />
      <Async state={s} h="h-96">{(d) => (
        <div className="space-y-4">
          <Panel title={`Alerts (${d.alerts.length})`} note={`Rules: missing rate > ${pct(d.config.max_missing_rate, 0)}, PSI warn ${d.config.psi_warn} / alert ${d.config.psi_alert}, recall below ${pct(d.config.min_recall, 0)}.`}>
            {d.alerts.length === 0 ? <p className="text-sm text-muted-foreground">No rule fired.</p> : <ul className="divide-y">{d.alerts.map((a, i) => <li key={i} className="flex items-start gap-3 py-2 text-sm"><span className={`mt-0.5 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${sev[a.severity] ?? ""}`}>{a.severity}</span><div><div className="font-medium">{a.subject} <span className="text-xs font-normal text-muted-foreground">({a.kind.replace("_", " ")})</span></div><div className="text-xs text-muted-foreground">{a.detail}</div></div></li>)}</ul>}
          </Panel>
          <div className="grid gap-4 lg:grid-cols-2">
            <Panel title="Data quality" kind="historical" note={d.quality.notes.join(" ")}>
              <table className="tnum w-full text-xs"><thead className="text-muted-foreground"><tr><th className="text-left font-normal">Column</th><th className="text-right font-normal">Missing</th><th className="text-right font-normal">Rate</th></tr></thead><tbody>{Object.entries(d.quality.missing).map(([k, v]) => <tr key={k} className="border-t"><td className="py-1">{k}</td><td className="text-right">{n0(v.count)}</td><td className="text-right">{pct(v.rate, 2)}</td></tr>)}</tbody></table>
              <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">{Object.entries(d.quality.invalid).map(([k, v]) => <div key={k}><dt className="capitalize text-muted-foreground">{k.replace(/_/g, " ")}</dt><dd className="tnum">{n0(v)}</dd></div>)}<div><dt className="text-muted-foreground">Duplicate IDs</dt><dd className="tnum">{n0(d.quality.duplicates.duplicate_ids)}</dd></div></dl>
            </Panel>
            <Panel title="Feature drift (PSI vs train)" kind="model" note="PSI below 0.1 is usually read as stable. Thresholds are conventions, not guarantees.">
              <table className="tnum w-full text-xs"><tbody>{d.drift.map((r, i) => <tr key={i} className="border-t first:border-0"><td className="py-1">{r.feature}</td><td className="text-muted-foreground">{r.compared}</td><td className={`text-right ${r.psi >= d.config.psi_warn ? "text-high" : ""}`}>{r.psi.toFixed(4)}</td></tr>)}</tbody></table>
            </Panel>
            <Panel title="Recall by quarter (test)" kind="model" className="lg:col-span-2"><div className="h-56"><ResponsiveContainer><BarChart data={d.performance_over_time}><CartesianGrid stroke={GRID} vertical={false} /><XAxis dataKey="quarter" {...AXIS} /><YAxis {...AXIS} width={40} tickFormatter={(v: number) => (v * 100).toFixed(0) + "%"} /><Tooltip content={<ChartTip fmt={(_n, v) => pct(v, 1)} />} /><Bar isAnimationActive={false} dataKey="recall" name="Recall" fill="var(--chart-2)" radius={[3, 3, 0, 0]} /><Bar isAnimationActive={false} dataKey="precision" name="Precision" fill="var(--chart-1)" radius={[3, 3, 0, 0]} /></BarChart></ResponsiveContainer></div></Panel>
          </div>
          <p className="text-[11px] text-muted-foreground">{d.disclaimer}</p>
        </div>)}</Async>
    </>
  );
}
