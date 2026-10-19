"use client";
import { useState } from "react";
import Link from "next/link";
import { Async, BandPill, ErrorState, PageHeader, Panel } from "@/components/kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api, useApi } from "@/lib/api";
import { n0, pct, score, usd } from "@/lib/format";

type Cfg = { default_bands: { medium: number; high: number; critical: number }; default_threshold: number; note: string };
type Dist = { rows: { band: string; n: number; amount: number; labeled: number; fraud: number; fraud_rate_labeled: number | null }[] };
type Res = { score: number; band: string; above_default_threshold: boolean; explanation: { top_features: { feature: string; value: string | number | null; contribution: number }[] }; note: string };

export default function Scoring() {
  const cfg = useApi<Cfg>("/api/risk/config");
  const [b, setB] = useState<{ medium: string; high: string; critical: string } | null>(null);
  const bands = b ?? (cfg.data ? { medium: String(cfg.data.default_bands.medium), high: String(cfg.data.default_bands.high), critical: String(cfg.data.default_bands.critical) } : null);
  const ok = bands && [bands.medium, bands.high, bands.critical].every((x) => x !== "" && !isNaN(Number(x))) && Number(bands.medium) < Number(bands.high) && Number(bands.high) < Number(bands.critical) && Number(bands.critical) <= 1 && Number(bands.medium) > 0;
  const bq = bands ? `bands=${bands.medium},${bands.high},${bands.critical}` : "";
  const dist = useApi<Dist>(ok ? `/api/risk/distribution?${bq}` : null);
  const [f, setF] = useState({ amount: "120", use_chip: "Online Transaction", mcc: "5732", hour: "2", new_merchant: "1" });
  const [res, setRes] = useState<Res | null>(null); const [err, setErr] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  const bad = isNaN(Number(f.amount)) || f.amount === "" || !/^\d{3,5}$/.test(f.mcc) || !(Number(f.hour) >= 0 && Number(f.hour) <= 23);
  async function run() {
    setBusy(true); setErr(null);
    try { setRes(await api<Res>(`/api/risk/score?${bq}`, { method: "POST", body: JSON.stringify({ amount: Number(f.amount), use_chip: f.use_chip, mcc: f.mcc, hour: Number(f.hour), new_merchant_for_client: Number(f.new_merchant) }) })); }
    catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }
  return (
    <>
      <PageHeader title="Risk Scoring Engine" kind="model" subtitle="Calibrated LightGBM probability of fraud, mapped to bands. Bands are configurable choices, not industry standards.">
        <Link href="/methodology" className="text-xs text-primary hover:underline">Methodology</Link>
      </PageHeader>
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Band cut-offs" kind="model" note={cfg.data?.note}>
          {bands && <div className="grid grid-cols-3 gap-3">{(["medium", "high", "critical"] as const).map((k) => <label key={k} className="text-xs capitalize text-muted-foreground">{k} from<Input className="mt-1 h-8" inputMode="decimal" value={bands[k]} onChange={(e) => setB({ ...bands, [k]: e.target.value })} /></label>)}</div>}
          {!ok && bands && <p role="alert" className="mt-2 text-xs text-destructive">Cut-offs must be increasing numbers between 0 and 1.</p>}
          <p className="mt-3 text-[11px] text-muted-foreground">The spec's 0.2 / 0.5 / 0.8 would put every transaction in Low: calibrated scores here top out near 0.05 because fraud is rare. Defaults were chosen from the score distribution.</p>
          <div className="mt-3"><Async state={dist} h="h-32">{(d) => (<table className="tnum w-full text-xs"><thead className="text-muted-foreground"><tr><th className="text-left font-normal">Band</th><th className="text-right font-normal">Txns</th><th className="text-right font-normal">Amount</th><th className="text-right font-normal">Observed fraud rate</th></tr></thead><tbody>{d.rows.map((r) => <tr key={r.band} className="border-t"><td className="py-1"><BandPill band={r.band} /></td><td className="text-right">{n0(r.n)}</td><td className="text-right">{usd(r.amount)}</td><td className="text-right">{r.labeled ? pct(r.fraud_rate_labeled, 2) : "-"}</td></tr>)}</tbody></table>)}</Async></div>
        </Panel>
        <Panel title="What-if scoring" kind="model" note="Hypothetical transaction. Fields not entered (client history, card attributes) are treated as missing.">
          <div className="grid grid-cols-2 gap-3">
            <label className="text-xs text-muted-foreground">Amount (USD)<Input className="mt-1 h-8" inputMode="decimal" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} /></label>
            <label className="text-xs text-muted-foreground">MCC code<Input className="mt-1 h-8" value={f.mcc} onChange={(e) => setF({ ...f, mcc: e.target.value })} /></label>
            <label className="text-xs text-muted-foreground">Channel<Select value={f.use_chip} onValueChange={(v) => setF({ ...f, use_chip: v ?? f.use_chip })}><SelectTrigger className="mt-1 h-8"><SelectValue /></SelectTrigger><SelectContent>{["Swipe Transaction", "Chip Transaction", "Online Transaction"].map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}</SelectContent></Select></label>
            <label className="text-xs text-muted-foreground">Hour (0-23)<Input className="mt-1 h-8" inputMode="numeric" value={f.hour} onChange={(e) => setF({ ...f, hour: e.target.value })} /></label>
            <label className="text-xs text-muted-foreground">First time at this merchant<Select value={f.new_merchant} onValueChange={(v) => setF({ ...f, new_merchant: v ?? "0" })}><SelectTrigger className="mt-1 h-8"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="1">Yes</SelectItem><SelectItem value="0">No</SelectItem></SelectContent></Select></label>
          </div>
          <Button className="mt-3" size="sm" disabled={bad || busy || !ok} onClick={run}>{busy ? "Scoring..." : "Score"}</Button>
          {err && <ErrorState message={err} />}
          {res && <div className="rise mt-4 rounded-lg border p-3"><div className="flex items-center gap-3"><span className="tnum text-2xl font-semibold">{score(res.score)}</span><BandPill band={res.band} /><span className="text-xs text-muted-foreground">{res.above_default_threshold ? "above" : "below"} the default flag threshold</span></div>
            <ul className="mt-2 space-y-1 text-xs">{res.explanation.top_features.slice(0, 5).map((x) => <li key={x.feature} className="flex justify-between"><span>{x.feature} = {x.value === null ? "missing" : String(x.value)}</span><span className={x.contribution > 0 ? "text-critical" : "text-low"}>{x.contribution > 0 ? "+" : ""}{x.contribution.toFixed(2)}</span></li>)}</ul>
            <p className="mt-2 text-[11px] text-muted-foreground">{res.note}</p></div>}
        </Panel>
      </div>
    </>
  );
}
