"use client";
import { useState } from "react";
import { Async, PageHeader, Panel } from "@/components/kit";
import { Slider } from "@/components/ui/slider";
import { useApi } from "@/lib/api";
import { n0, pct, usd } from "@/lib/format";

type S = { reviewed: number; reviewed_amount: number; fraud_in_reviewed: number; fraud_amount_in_reviewed: number; hypothetical_recovered_amount: number; review_hours: number; analyst_days: number; total_fraud: number; total_fraud_amount: number; test_period_days: number; review_hours_per_day: number; analysts_needed: number; share_of_all_fraud_reviewed: number; assumptions: Record<string, string>; formulas: string[]; label: string; data_needed_for_expected_loss: string };

function Ctl({ label, v, set, min, max, step, fmt }: { label: string; v: number; set: (n: number) => void; min: number; max: number; step: number; fmt: (n: number) => string }) {
  return <div className="text-xs text-muted-foreground">{label}: <span className="tnum font-medium text-foreground">{fmt(v)}</span><Slider className="mt-2" min={min} max={max} step={step} value={[v]} onValueChange={(x) => set(Array.isArray(x) ? x[0] : x)} aria-label={label} /></div>;
}
export default function Exposure() {
  const [t, setT] = useState(0.0319); const [rv, setRv] = useState(1); const [rc, setRc] = useState(0.5); const [mp, setMp] = useState(10); const [hrs, setHrs] = useState(6);
  const s = useApi<S>(`/api/scenario?threshold=${t}&review_rate=${rv}&recovery_rate=${rc}&minutes_per_review=${mp}&analyst_hours_per_day=${hrs}`);
  return (
    <>
      <PageHeader title="Financial Exposure and Scenarios" kind="simulated" subtitle="A what-if on the held-out test period. Recovery rate and review time are assumptions you set; they are not observed in the data." />
      <div className="grid gap-4 lg:grid-cols-3">
        <Panel title="Assumptions" kind="simulated"><div className="space-y-5">
          <Ctl label="Flag threshold" v={t} set={setT} min={0.001} max={0.1} step={0.0005} fmt={(n) => n.toFixed(4)} />
          <Ctl label="Share of flags reviewed" v={rv} set={setRv} min={0.05} max={1} step={0.05} fmt={(n) => pct(n, 0)} />
          <Ctl label="Recovery rate (assumed)" v={rc} set={setRc} min={0} max={1} step={0.05} fmt={(n) => pct(n, 0)} />
          <Ctl label="Minutes per review (assumed)" v={mp} set={setMp} min={1} max={60} step={1} fmt={(n) => n + " min"} />
          <Ctl label="Analyst hours per day" v={hrs} set={setHrs} min={1} max={10} step={0.5} fmt={(n) => n + " h"} />
        </div></Panel>
        <div className="lg:col-span-2"><Async state={s} h="h-80">{(d) => (
          <div className="space-y-4">
            <p className="border-l-2 border-accent2 bg-accent2/10 p-3 text-xs font-medium">{d.label}</p>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
              {([["Transactions reviewed", n0(d.reviewed)], ["Value reviewed", usd(d.reviewed_amount)], ["Fraud in reviewed", `${n0(d.fraud_in_reviewed)} of ${n0(d.total_fraud)}`], ["Fraud value in reviewed", `${usd(d.fraud_amount_in_reviewed)} of ${usd(d.total_fraud_amount)}`], ["Hypothetical recovery", usd(d.hypothetical_recovered_amount)], ["Review effort", `${n0(d.review_hours)} h (${d.analysts_needed.toFixed(2)} analysts)`]] as const).map(([k, v]) => <div key={k} className="border-t border-foreground/80 pt-2 pb-2"><div className="text-xs text-muted-foreground">{k}</div><div className="tnum mt-1 text-lg font-semibold">{v}</div></div>)}
            </div>
            <Panel open title="Formulas and assumptions" kind="simulated"><ul className="list-disc space-y-1 pl-4 text-xs text-muted-foreground">{d.formulas.map((f) => <li key={f}>{f}</li>)}{Object.values(d.assumptions).map((a) => <li key={a}>{a}</li>)}</ul>
              <p className="mt-3 text-xs text-muted-foreground">Not in this dataset, needed for expected-loss estimates: {d.data_needed_for_expected_loss}</p></Panel>
          </div>)}</Async></div>
      </div>
    </>
  );
}
