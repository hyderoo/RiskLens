"use client";
import { AlertTriangle, Inbox } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import Link from "next/link";

export type Kind = "historical" | "model" | "simulated";
const KIND: Record<Kind, { label: string; glyph: string; cls: string }> = {
  historical: { label: "Historical data", glyph: "■", cls: "text-chart-1" },
  model: { label: "Model estimate", glyph: "◆", cls: "text-chart-3" },
  simulated: { label: "Simulated scenario", glyph: "◇", cls: "text-chart-5" },
};
export function Provenance({ kind, className }: { kind: Kind; className?: string }) {
  const k = KIND[kind];
  return <span className={cn("eyebrow inline-flex items-center gap-1.5 whitespace-nowrap", className)}><span aria-hidden className={cn("text-[9px]", k.cls)}>{k.glyph}</span>{k.label}</span>;
}

export function PageHeader({ title, subtitle, kind, children }: { title: string; subtitle?: string; kind?: Kind; children?: React.ReactNode }) {
  return (
    <div className="rise mb-7 flex flex-wrap items-end justify-between gap-3 border-b-2 border-foreground pb-4">
      <div>
        {kind && <div className="mb-2"><Provenance kind={kind} /></div>}
        <h1 className="text-[30px] font-medium leading-tight tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1.5 max-w-3xl text-[13px] leading-relaxed text-muted-foreground">{subtitle}</p>}
      </div>
      <div className="no-print flex items-center gap-2">{children}</div>
    </div>
  );
}

export function Kpi({ label, value, sub, href, kind, hint }: { label: string; value: React.ReactNode; sub?: React.ReactNode; href?: string; kind?: Kind; hint?: string }) {
  const body = (
    <div className={cn("rise h-full border-t border-foreground/80 px-0 pb-3 pt-2.5 transition-colors", href && "hover:bg-accent/60")} title={hint}>
      <div className="flex items-start justify-between gap-2">
        <span className="eyebrow">{label}</span>
        {kind && <span aria-label={KIND[kind].label} title={KIND[kind].label} className={cn("text-[9px]", KIND[kind].cls)}>{KIND[kind].glyph}</span>}
      </div>
      <div className="tnum serif mt-1 text-[28px] font-medium leading-none tracking-tight">{value}</div>
      {sub && <div className="mt-1.5 text-[11.5px] leading-snug text-muted-foreground">{sub}</div>}
    </div>
  );
  return href ? <Link href={href} className="block focus-visible:outline-2 focus-visible:outline-ring">{body}</Link> : body;
}

export function Panel({ title, kind, note, children, className, action }: { title: string; kind?: Kind; note?: string; children: React.ReactNode; className?: string; action?: React.ReactNode }) {
  return (
    <section className={cn("rise min-w-0 border-t-2 border-foreground pt-3", className)}>
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-[17px] font-medium tracking-tight">{title}</h2>
        <div className="flex items-center gap-3">{action}{kind && <Provenance kind={kind} />}</div>
      </div>
      <div className="space-y-3 overflow-x-auto">{children}</div>
      {note && <p className="mt-3 border-t border-border pt-2 text-[11.5px] italic leading-relaxed text-muted-foreground">{note}</p>}
    </section>
  );
}

export function LoadingBlock({ h = "h-56" }: { h?: string }) { return <Skeleton className={cn("w-full", h)} />; }
export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex items-start gap-3 border-l-2 border-destructive bg-destructive/5 p-4 text-sm">
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
  return <span className="inline-flex items-center gap-1.5 text-xs font-medium capitalize"><span className="size-2" style={{ background: `var(--${band})` }} />{band}</span>;
}
export function LabelPill({ status }: { status: string }) {
  const m: Record<string, [string, string]> = { confirmed_fraud_label: ["Fraud label", "font-semibold text-critical"], labeled_non_fraud: ["Non-fraud label", "text-muted-foreground"], unlabeled: ["Unlabeled", "italic text-chart-3"] };
  const [t, c] = m[status] ?? [status, ""];
  return <span className={cn("whitespace-nowrap text-[11.5px]", c)}>{t}</span>;
}
