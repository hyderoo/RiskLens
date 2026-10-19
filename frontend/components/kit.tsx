"use client";
import { AlertTriangle, Inbox } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import Link from "next/link";

export type Kind = "historical" | "model" | "simulated";
const KIND: Record<Kind, { label: string; cls: string }> = {
  historical: { label: "Historical data", cls: "border-chart-2/40 text-chart-2 bg-chart-2/10" },
  model: { label: "Model estimate", cls: "border-chart-3/50 text-chart-3 bg-chart-3/10" },
  simulated: { label: "Simulated scenario", cls: "border-chart-4/50 text-chart-4 bg-chart-4/10" },
};
export function Provenance({ kind, className }: { kind: Kind; className?: string }) {
  const k = KIND[kind];
  return <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider", k.cls, className)}><span className="size-1.5 rounded-full bg-current" />{k.label}</span>;
}

export function PageHeader({ title, subtitle, kind, children }: { title: string; subtitle?: string; kind?: Kind; children?: React.ReactNode }) {
  return (
    <div className="rise mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <div className="flex items-center gap-3"><h1 className="text-2xl font-semibold tracking-tight">{title}</h1>{kind && <Provenance kind={kind} />}</div>
        {subtitle && <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      <div className="no-print flex items-center gap-2">{children}</div>
    </div>
  );
}

export function Kpi({ label, value, sub, href, kind, hint }: { label: string; value: React.ReactNode; sub?: React.ReactNode; href?: string; kind?: Kind; hint?: string }) {
  const body = (
    <Card className={cn("rise h-full gap-1 p-4 transition-colors", href && "hover:border-primary/60 hover:bg-accent/40")} title={hint}>
      <div className="flex items-start justify-between gap-2">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
        {kind && <span className={cn("size-2 rounded-full", kind === "historical" ? "bg-chart-2" : kind === "model" ? "bg-chart-3" : "bg-chart-4")} title={KIND[kind].label} />}
      </div>
      <div className="tnum text-2xl font-semibold tracking-tight">{value}</div>
      {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
    </Card>
  );
  return href ? <Link href={href} className="block rounded-xl focus-visible:outline-2 focus-visible:outline-ring">{body}</Link> : body;
}

export function Panel({ title, kind, note, children, className, action }: { title: string; kind?: Kind; note?: string; children: React.ReactNode; className?: string; action?: React.ReactNode }) {
  return (
    <Card className={cn("rise gap-3 p-4", className)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">{title}</h2>
        <div className="flex items-center gap-2">{action}{kind && <Provenance kind={kind} />}</div>
      </div>
      {children}
      {note && <p className="text-xs text-muted-foreground">{note}</p>}
    </Card>
  );
}

export function LoadingBlock({ h = "h-56" }: { h?: string }) { return <Skeleton className={cn("w-full", h)} />; }
export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex items-start gap-3 rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm">
      <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" />
      <div className="flex-1"><p className="font-medium">Could not load this data</p><p className="text-muted-foreground">{message}</p></div>
      {onRetry && <Button size="sm" variant="outline" onClick={onRetry}>Retry</Button>}
    </div>
  );
}
export function EmptyState({ title, text }: { title: string; text?: string }) {
  return <div className="flex flex-col items-center gap-2 py-10 text-center text-sm text-muted-foreground"><Inbox className="size-6" /><p className="font-medium text-foreground">{title}</p>{text && <p className="max-w-md">{text}</p>}</div>;
}

export function Async<T>({ state, children, h }: { state: { data: T | null; error: string | null; loading: boolean; reload: () => void }; children: (d: T) => React.ReactNode; h?: string }) {
  if (state.error) return <ErrorState message={state.error} onRetry={state.reload} />;
  if (state.loading || !state.data) return <LoadingBlock h={h} />;
  return <>{children(state.data)}</>;
}

export function BandPill({ band }: { band: string | null | undefined }) {
  if (!band) return <span className="text-muted-foreground">-</span>;
  return <span className="inline-flex items-center gap-1.5 text-xs font-medium capitalize"><span className="size-2 rounded-full" style={{ background: `var(--${band})` }} />{band}</span>;
}
export function LabelPill({ status }: { status: string }) {
  const m: Record<string, [string, string]> = { confirmed_fraud_label: ["Fraud label", "text-critical border-critical/40 bg-critical/10"], labeled_non_fraud: ["Non-fraud label", "text-muted-foreground border-border"], unlabeled: ["Unlabeled", "text-chart-3 border-chart-3/40 bg-chart-3/10"] };
  const [t, c] = m[status] ?? [status, ""];
  return <span className={cn("inline-block whitespace-nowrap rounded border px-1.5 py-0.5 text-[11px]", c)}>{t}</span>;
}
