"use client";
import { AlertTriangle } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { usePathname } from "next/navigation";

export type Kind = "historical" | "model" | "simulated";
const KIND: Record<Kind, { label: string; glyph: string; cls: string }> = {
  historical: { label: "Historical data", glyph: "■", cls: "text-primary" },
  model: { label: "Model estimate", glyph: "◆", cls: "text-medium" },
  simulated: { label: "Simulated scenario", glyph: "◇", cls: "text-critical" },
};
export function Provenance({ kind, className }: { kind: Kind; className?: string }) {
  const k = KIND[kind];
  return <span className={cn("stamp", kind, k.cls, className)}><span aria-hidden className="text-[8px]">{k.glyph}</span>{k.label}</span>;
}

const SECTION: Record<string, string> = { "/": "A", "/transactions": "B", "/analytics": "C", "/scoring": "D", "/model": "E", "/explain": "F", "/exposure": "G", "/monitoring": "H", "/cases": "I", "/reports": "J" };
export function PageHeader({ title, subtitle, kind, children }: { title: string; subtitle?: string; kind?: Kind; children?: React.ReactNode }) {
  const letter = SECTION[usePathname()];
  return (
    <div className="rise mb-8 flex flex-wrap items-start justify-between gap-4">
      <div className="flex gap-4">
        {letter && <span aria-hidden className="serif -mt-1 select-none text-[64px] font-semibold leading-[0.85] text-chart-5">{letter}</span>}
        <div>
          <h1 className="text-[36px] leading-[1.05]">{title}</h1>
          {subtitle && <p className="mt-2 max-w-2xl text-[13.5px] leading-relaxed text-muted-foreground">{subtitle}</p>}
          {kind && <div className="mt-3"><Provenance kind={kind} /></div>}
        </div>
      </div>
      <div className="no-print flex items-center gap-2">{children}</div>
    </div>
  );
}

export function Kpi({ label, value, sub, href, kind, hint }: { label: string; value: React.ReactNode; sub?: React.ReactNode; href?: string; kind?: Kind; hint?: string }) {
  const body = (
    <div className="kpi rise h-full py-1 pr-2 transition-colors" title={hint}>
      <div className="eyebrow flex items-center gap-1.5">{kind && <span aria-label={KIND[kind].label} title={KIND[kind].label} className="text-[8px]">{KIND[kind].glyph}</span>}{label}</div>
      <div className="tnum serif mt-1.5 text-[26px] leading-none sm:text-[32px]">{value}</div>
      {sub && <div className="mt-2 text-[11.5px] leading-snug text-muted-foreground">{sub}</div>}
    </div>
  );
  return href ? <Link href={href} className="block focus-visible:outline-2 focus-visible:outline-ring">{body}</Link> : body;
}

export function Panel({ title, kind, note, children, className, action, open }: { title: string; kind?: Kind; note?: string; children: React.ReactNode; className?: string; action?: React.ReactNode; open?: boolean }) {
  return (
    <section className={cn("panel rise min-w-0", open && "open", className)}>
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <div className="panel-fig"><h2 className="text-[19px] leading-tight">{title}</h2></div>
        <div className="flex items-center gap-3">{action}{kind && <Provenance kind={kind} />}</div>
      </div>
      <div className="space-y-3 overflow-x-auto">{children}</div>
      {note && <p className="panel-note">{note}</p>}
    </section>
  );
}

export function LoadingBlock({ h = "h-56" }: { h?: string }) { return <Skeleton className={cn("w-full rounded-lg", h)} />; }
export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex items-start gap-3 rounded-md border-l-4 border-chart-5 bg-chart-5/10 p-4 text-sm">
      <AlertTriangle className="mt-0.5 size-4 shrink-0 text-critical" />
      <div className="flex-1"><p className="serif text-base">Could not load this data</p><p className="text-muted-foreground">{message}</p></div>
      {onRetry && <Button size="sm" variant="outline" onClick={onRetry}>Retry</Button>}
    </div>
  );
}
export function EmptyState({ title, text }: { title: string; text?: string }) {
  return (
    <div className="m-4 flex flex-col items-center gap-2 rounded-lg border border-dashed border-input py-10 text-center text-sm text-muted-foreground">
      <svg width="44" height="28" viewBox="0 0 44 28" aria-hidden className="text-chart-5"><rect x="2" y="14" width="8" height="12" fill="currentColor" opacity=".5" /><rect x="14" y="6" width="8" height="20" fill="currentColor" opacity=".75" /><rect x="26" y="10" width="8" height="16" fill="currentColor" /><path d="M2 27h40" stroke="currentColor" /></svg>
      <p className="serif text-base text-foreground">{title}</p>{text && <p className="max-w-md">{text}</p>}
    </div>
  );
}

export function Async<T>({ state, children, h }: { state: { data: T | null; error: string | null; loading: boolean; reload: () => void }; children: (d: T) => React.ReactNode; h?: string }) {
  if (state.error) return <ErrorState message={state.error} onRetry={state.reload} />;
  if (state.loading || !state.data) return <LoadingBlock h={h} />;
  return <>{children(state.data)}</>;
}

export function BandPill({ band }: { band: string | null | undefined }) {
  if (!band) return <span className="text-muted-foreground">-</span>;
  const n = ["low", "medium", "high", "critical"].indexOf(band) + 1;
  return <span className="inline-flex items-center gap-1.5 text-xs font-medium capitalize"><span aria-hidden className="inline-flex items-end gap-px">{[1, 2, 3, 4].map((i) => <span key={i} className="w-[3px]" style={{ height: 4 + i * 2, background: i <= n ? `var(--${band})` : "var(--border)" }} />)}</span>{band}</span>;
}
export function LabelPill({ status }: { status: string }) {
  const m: Record<string, [string, string]> = { confirmed_fraud_label: ["Fraud label", "rounded-sm bg-critical px-1.5 py-0.5 font-semibold text-background"], labeled_non_fraud: ["Non-fraud label", "text-muted-foreground"], unlabeled: ["Unlabeled", "rounded-sm border border-dashed border-input px-1.5 py-0.5 text-muted-foreground"] };
  const [t, c] = m[status] ?? [status, ""];
  return <span className={cn("whitespace-nowrap text-[11px]", c)}>{t}</span>;
}
