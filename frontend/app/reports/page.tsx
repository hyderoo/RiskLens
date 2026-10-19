"use client";
import { Printer, Download } from "lucide-react";
import { Async, PageHeader, Panel } from "@/components/kit";
import { Button, buttonVariants } from "@/components/ui/button";
import { API, useApi } from "@/lib/api";
import { n0, pct, usd } from "@/lib/format";

type R = { title: string; disclaimer: string; period: { data_from: string; data_to: string; test_period: string }; coverage: { transactions: number; labeled: number; unlabeled: number; quality: string[] }; findings: { confirmed_fraud: number; labeled: number; fraud_rate: number; confirmed_fraud_amount: number; top_mcc: { grp?: string; mcc?: string; fraud?: number; labeled?: number }[] }; model: { name: string; evaluation_scope: string; pr_auc: number; roc_auc: number; baseline_pr_auc: number; at_threshold: { threshold: number; tp: number; fp: number; fn: number; precision: number; recall: number; f1: number; flagged: number; flagged_amount: number; fraud_amount_caught: number } }; exposure: { test_flagged_amount: number; test_fraud_amount_caught: number; note: string }; recommendations: { title: string; metric: string; action: string }[]; limitations: string[] };

export default function Reports() {
  const s = useApi<R>("/api/report");
  const csv = (path: string) => `${API}${path}`;
  return (
    <>
      <PageHeader title="Reports" subtitle="A generated summary built from the live metrics. Use Print to save it as a PDF from your browser; CSV exports run on the backend.">
        <div className="no-print flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => window.print()}><Printer className="mr-1.5 size-3.5" />Print / save as PDF</Button>
          <a className={buttonVariants({ variant: "outline", size: "sm" })} href={csv("/api/transactions/export?label=fraud&limit=50000")} download><Download className="mr-1.5 size-3.5" />Confirmed fraud CSV</a>
          <a className={buttonVariants({ variant: "outline", size: "sm" })} href={csv("/api/transactions/export?score_min=0.0319&limit=50000")} download><Download className="mr-1.5 size-3.5" />Flagged CSV</a>
        </div>
      </PageHeader>
      <Async state={s} h="h-96">{(d) => (
        <article className="space-y-4 text-sm">
          <h2 className="text-lg font-semibold">{d.title}</h2>
          <p className="text-xs text-muted-foreground">{d.disclaimer} Data {d.period.data_from} to {d.period.data_to}. Test period {d.period.test_period}.</p>
          <Panel title="Coverage"><p>{n0(d.coverage.transactions)} transactions, {n0(d.coverage.labeled)} labeled, {n0(d.coverage.unlabeled)} unlabeled (unlabeled is not the same as non-fraud).</p><ul className="mt-2 list-disc pl-4 text-xs text-muted-foreground">{d.coverage.quality.map((q) => <li key={q}>{q}</li>)}</ul></Panel>
          <Panel title="Findings (historical)"><p>{n0(d.findings.confirmed_fraud)} confirmed frauds in {n0(d.findings.labeled)} labeled transactions ({pct(d.findings.fraud_rate, 3)}), worth {usd(d.findings.confirmed_fraud_amount)}.</p></Panel>
          <Panel title={`Model: ${d.model.name}`} kind="model" note={d.model.evaluation_scope}>
            <p>PR-AUC {d.model.pr_auc.toFixed(4)} (baseline logistic regression {d.model.baseline_pr_auc.toFixed(4)}), ROC-AUC {d.model.roc_auc.toFixed(3)}. At threshold {d.model.at_threshold.threshold.toFixed(4)}: precision {pct(d.model.at_threshold.precision, 1)}, recall {pct(d.model.at_threshold.recall, 1)}, {n0(d.model.at_threshold.flagged)} flagged, {n0(d.model.at_threshold.fn)} frauds missed.</p>
            <p className="mt-2 text-xs text-muted-foreground">Flagged value {usd(d.exposure.test_flagged_amount)}; fraud value among flags {usd(d.exposure.test_fraud_amount_caught)}. {d.exposure.note}</p></Panel>
          <Panel title="Recommendations (tied to metrics)"><ul className="space-y-2">{d.recommendations.map((r) => <li key={r.title}><div className="font-medium">{r.title}</div><div className="text-xs text-muted-foreground">{r.metric}. {r.action}</div></li>)}</ul></Panel>
          <Panel title="Limitations"><ul className="list-disc pl-4 text-xs text-muted-foreground">{d.limitations.map((l) => <li key={l}>{l}</li>)}</ul></Panel>
        </article>)}</Async>
    </>
  );
}
