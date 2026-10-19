"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { Menu, Moon, Sun, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useApi } from "@/lib/api";
import { useFilters } from "@/lib/filters";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/", label: "Executive Overview", n: "A" },
  { href: "/transactions", label: "Transaction Explorer", n: "B" },
  { href: "/analytics", label: "Fraud Analytics", n: "C" },
  { href: "/scoring", label: "Risk Scoring", n: "D" },
  { href: "/model", label: "Model Lab", n: "E" },
  { href: "/explain", label: "Explainability", n: "F" },
  { href: "/exposure", label: "Exposure & Scenarios", n: "G" },
  { href: "/monitoring", label: "Risk Monitoring", n: "H" },
  { href: "/cases", label: "Investigations", n: "I" },
  { href: "/reports", label: "Reports", n: "J" },
  { href: "/methodology", label: "Methodology", n: "" },
];

function Nav({ onNav }: { onNav?: () => void }) {
  const path = usePathname();
  return (
    <nav className="flex flex-col px-4" aria-label="Primary">
      {NAV.map(({ href, label, n }) => {
        const active = href === "/" ? path === "/" : path.startsWith(href);
        return (
          <Link key={href} href={href} onClick={onNav} aria-current={active ? "page" : undefined}
            className={cn("flex items-baseline gap-3 border-l-2 py-1.5 pl-3 text-[13px] transition-colors", active ? "border-primary font-semibold text-foreground" : "border-transparent text-muted-foreground hover:border-border hover:text-foreground")}>
            <span className="w-3 font-mono text-[10px] text-muted-foreground">{n}</span>{label}
          </Link>
        );
      })}
    </nav>
  );
}

function Brand() {
  return (
    <Link href="/" className="block px-5 pb-6 pt-6">
      <span className="serif block text-[22px] font-semibold leading-none tracking-tight">RiskLens</span>
      <span className="eyebrow mt-1.5 block">Transaction risk review</span>
    </Link>
  );
}

function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme(); const [m, setM] = useState(false);
// eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setM(true), []);
  return <Button variant="ghost" size="icon" aria-label="Toggle theme" onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}>{m && resolvedTheme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}</Button>;
}

function Freshness() {
  const { data } = useApi<{ latest_timestamp: string; first_timestamp: string; transactions: number }>("/api/status");
  return (
    <div className="hidden items-center gap-2 text-xs text-muted-foreground md:flex" title="Latest transaction timestamp in the dataset. This is a historical file, not a live feed.">
      
      {data ? <span>Data through <span className="tnum font-medium text-foreground">{data.latest_timestamp.slice(0, 10)}</span> · historical</span> : <span>Loading...</span>}
    </div>
  );
}

function GlobalFilterBar() {
  const { f, set, reset } = useFilters();
  const active = f.date_from || f.date_to || f.label !== "all" || f.use_chip;
  return (
    <div className="no-print flex flex-wrap items-center gap-2 border-b px-4 py-2 text-xs md:px-6" role="group" aria-label="Global filters">
      <span className="eyebrow">Filters</span>
      <Input type="date" aria-label="From date" className="h-8 w-36" min="2010-01-01" max="2019-10-31" value={f.date_from} onChange={(e) => set({ date_from: e.target.value })} />
      <span className="text-muted-foreground">to</span>
      <Input type="date" aria-label="To date" className="h-8 w-36" min="2010-01-01" max="2019-10-31" value={f.date_to} onChange={(e) => set({ date_to: e.target.value })} />
      <Select value={f.label} onValueChange={(v) => set({ label: v ?? "all" })}>
        <SelectTrigger className="h-8 w-44" aria-label="Label filter"><SelectValue>{(v: string) => ({ all: "All transactions", labeled: "Labeled only", fraud: "Confirmed fraud", nonfraud: "Labeled non-fraud", unlabeled: "Unlabeled" } as Record<string, string>)[v] ?? v}</SelectValue></SelectTrigger>
        <SelectContent><SelectItem value="all">All transactions</SelectItem><SelectItem value="labeled">Labeled only</SelectItem><SelectItem value="fraud">Confirmed fraud</SelectItem><SelectItem value="nonfraud">Labeled non-fraud</SelectItem><SelectItem value="unlabeled">Unlabeled</SelectItem></SelectContent>
      </Select>
      <Select value={f.use_chip || "any"} onValueChange={(v) => set({ use_chip: !v || v === "any" ? "" : v })}>
        <SelectTrigger className="h-8 w-44" aria-label="Channel filter"><SelectValue>{(v: string) => ({ any: "All channels", "Swipe Transaction": "Swipe", "Chip Transaction": "Chip", "Online Transaction": "Online" } as Record<string, string>)[v] ?? v}</SelectValue></SelectTrigger>
        <SelectContent><SelectItem value="any">All channels</SelectItem><SelectItem value="Swipe Transaction">Swipe</SelectItem><SelectItem value="Chip Transaction">Chip</SelectItem><SelectItem value="Online Transaction">Online</SelectItem></SelectContent>
      </Select>
      {active && <Button size="sm" variant="ghost" className="h-8" onClick={reset}><X className="mr-1 size-3" />Clear</Button>}
    </div>
  );
}

export function Shell({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false); const path = usePathname();
  const current = NAV.find((n) => (n.href === "/" ? path === "/" : path.startsWith(n.href)));
  const filterable = ["/", "/transactions", "/analytics", "/scoring"].includes(path);
  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 hidden h-screen w-56 shrink-0 flex-col border-r border-sidebar-border bg-sidebar lg:flex">
        <Brand /><Nav />
        <div className="mt-auto p-4 text-[11px] leading-relaxed text-muted-foreground">Portfolio project on a public synthetic dataset. Not connected to any bank or live transactions.</div>
      </aside>
      {open && <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true"><div className="absolute inset-0 bg-black/50" onClick={() => setOpen(false)} /><div className="absolute left-0 top-0 h-full w-64 bg-sidebar shadow-xl"><Brand /><Nav onNav={() => setOpen(false)} /></div></div>}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b bg-background px-4 py-2 md:px-6">
          <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open navigation" onClick={() => setOpen(true)}><Menu className="size-4" /></Button>
          <nav aria-label="Breadcrumb" className="min-w-0 truncate text-sm text-muted-foreground"><span className="eyebrow">{current?.n ? `Section ${current.n}` : "Reference"}</span></nav>
          <div className="ml-auto flex items-center gap-2"><Freshness /><ThemeToggle /></div>
        </header>
        {filterable && <GlobalFilterBar />}
        <main className="mx-auto w-full max-w-[1500px] flex-1 px-4 py-6 md:px-6">{children}</main>
      </div>
    </div>
  );
}
