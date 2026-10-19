"use client";
import { Suspense, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ColumnDef, flexRender, getCoreRowModel, useReactTable } from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ArrowUpDown, Download } from "lucide-react";
import { z } from "zod";
import { Async, BandPill, EmptyState, ErrorState, LabelPill, PageHeader, Panel } from "@/components/kit";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { API, api, qs, useApi } from "@/lib/api";
import { useFilters } from "@/lib/filters";
import { dt, n0, score, usd } from "@/lib/format";

type Row = { id: number; date: string; client_id: number; card_id: number; amount: number; use_chip: string; merchant_city: string; merchant_state: string | null; mcc: string; errors: string | null; is_fraud: boolean | null; risk_score: number; split: string; band: string; label_status: string; case_status: string };
type Page = { total: number; page: number; page_size: number; pages: number; rows: Row[] };
type Detail = {
  transaction: Record<string, string | number | boolean | null>;
  explanation: { baseline_log_odds: number; top_features: { feature: string; description: string; value: string | number | null; contribution: number; direction: string }[] };
  indicators: string[]; recent_client_activity: { id: number; date: string; amount: number; merchant_city: string; risk_score: number; is_fraud: boolean | null }[];
  cases: { id: number; status: string; severity: string }[]; explanation_note: string;
};
type Meta = { sort?: "date" | "amount" | "risk_score"; right?: boolean };

const numStr = z.string().regex(/^-?\d*\.?\d*$/);

function Explorer() {
  const sp = useSearchParams(); const { f } = useFilters();
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<{ id: "date" | "amount" | "risk_score"; desc: boolean }>({ id: sp.get("sort") === "risk_score" ? "risk_score" : sp.get("sort") === "amount" ? "amount" : "date", desc: true });
  const [local, setLocal] = useState({ txn_id: sp.get("txn_id") ?? "", client_id: sp.get("client_id") ?? "", card_id: "", amount_min: "", amount_max: "", label: sp.get("label") ?? "", mcc: sp.get("mcc") ?? "", threshold: sp.get("score_min") ? Number(sp.get("score_min")) : 0 });
  const [open, setOpen] = useState<number | null>(null);
  const bad = (["txn_id", "client_id", "card_id", "amount_min", "amount_max"] as const).filter((k) => local[k] && !numStr.safeParse(local[k]).success);
  const query = qs({
    date_from: f.date_from || sp.get("date_from"), date_to: f.date_to || sp.get("date_to"), label: local.label || f.label, use_chip: f.use_chip || sp.get("use_chip"),
    txn_id: local.txn_id, client_id: local.client_id, card_id: local.card_id, amount_min: local.amount_min, amount_max: local.amount_max, mcc: local.mcc,
    score_min: local.threshold > 0 ? local.threshold : null, sort: sort.id, order: sort.desc ? "desc" : "asc",
  });
  const path = bad.length ? null : `/api/transactions${query}${query ? "&" : "?"}page=${page}&page_size=25`;
  const state = useApi<Page>(path);
  const upd = (p: Partial<typeof local>) => { setLocal((c) => ({ ...c, ...p })); setPage(1); };
  const toggle = (id: "date" | "amount" | "risk_score") => { setSort((s) => ({ id, desc: s.id === id ? !s.desc : true })); setPage(1); };

  const cols = useMemo<ColumnDef<Row>[]>(() => [
    { accessorKey: "id", header: "ID", cell: (c) => <button className="tnum text-primary hover:underline" onClick={() => setOpen(c.row.original.id)}>{c.row.original.id}</button> },
    { accessorKey: "date", header: "Time", meta: { sort: "date" } as Meta, cell: (c) => <span className="tnum whitespace-nowrap">{dt(c.row.original.date)}</span> },
    { accessorKey: "amount", header: "Amount", meta: { sort: "amount", right: true } as Meta, cell: (c) => <span className="tnum">{usd(c.row.original.amount, 2)}</span> },
    { accessorKey: "use_chip", header: "Channel", cell: (c) => c.row.original.use_chip.replace(" Transaction", "") },
    { accessorKey: "mcc", header: "MCC" },
    { id: "m", header: "Merchant", cell: (c) => `${c.row.original.merchant_city}${c.row.original.merchant_state ? ", " + c.row.original.merchant_state : ""}` },
    { accessorKey: "risk_score", header: "Risk score", meta: { sort: "risk_score", right: true } as Meta, cell: (c) => <span className="tnum">{score(c.row.original.risk_score)}</span> },
    { id: "band", header: "Band", cell: (c) => <BandPill band={c.row.original.band} /> },
    { id: "label", header: "Dataset label", cell: (c) => <LabelPill status={c.row.original.label_status} /> },
    { accessorKey: "case_status", header: "Case", cell: (c) => <span className="text-xs capitalize text-muted-foreground">{c.row.original.case_status.replace("_", " ")}</span> },
  ], []);
// eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({ data: state.data?.rows ?? [], columns: cols, getCoreRowModel: getCoreRowModel(), manualPagination: true, manualSorting: true });
  const exportHref = `${API}/api/transactions/export${query}${query ? "&" : "?"}limit=50000`;

  return (
    <>
      <PageHeader title="Transaction Explorer" kind="historical" subtitle="Filtering, sorting and pagination run on the full 13.3M-row dataset in the backend. Scores are model estimates; the label column is what the dataset says.">
        <a href={exportHref} download className={buttonVariants({ variant: "outline", size: "sm" })}><Download className="mr-1.5 size-3.5" />Export CSV (max 50k)</a>
      </PageHeader>
      <Panel title="Filters" className="mb-4">
        <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
          {([["txn_id", "Transaction ID"], ["client_id", "Client ID"], ["card_id", "Card ID"], ["amount_min", "Min amount"], ["amount_max", "Max amount"], ["mcc", "MCC code"]] as const).map(([k, l]) => (
            <label key={k} className="text-xs text-muted-foreground">{l}<Input inputMode="decimal" className="mt-1 h-8" aria-invalid={(bad as readonly string[]).includes(k)} value={local[k]} onChange={(e) => upd({ [k]: e.target.value })} /></label>
          ))}
        </div>
        <div className="grid items-end gap-4 md:grid-cols-3">
          <label className="text-xs text-muted-foreground">Dataset label
            <Select value={local.label || "all"} onValueChange={(v) => upd({ label: !v || v === "all" ? "" : v })}><SelectTrigger className="mt-1 h-8"><SelectValue>{(v: string | null) => ({ all: "Use global filter", fraud: "Confirmed fraud", nonfraud: "Labeled non-fraud", unlabeled: "Unlabeled" } as Record<string,string>)[v ?? "all"] ?? "Use global filter"}</SelectValue></SelectTrigger>
              <SelectContent><SelectItem value="all">Use global filter</SelectItem><SelectItem value="fraud">Confirmed fraud</SelectItem><SelectItem value="nonfraud">Labeled non-fraud</SelectItem><SelectItem value="unlabeled">Unlabeled</SelectItem></SelectContent></Select></label>
          <div className="text-xs text-muted-foreground md:col-span-2">Minimum model risk score: <span className="tnum font-medium text-foreground">{local.threshold.toFixed(3)}</span>
            <Slider className="mt-3" min={0} max={0.046} step={0.001} value={[local.threshold]} onValueChange={(v) => upd({ threshold: Array.isArray(v) ? v[0] : v })} aria-label="Minimum risk score" /></div>
        </div>
        {bad.length > 0 && <p role="alert" className="text-xs text-destructive">Enter numbers only in: {bad.join(", ")}.</p>}
      </Panel>
      <Async state={state} h="h-96">{(d) => (
        <div className="rise border-y-2 border-foreground">
          {d.rows.length === 0 ? <EmptyState title="No transactions match these filters" text="Loosen the date range, label or score filter." /> : (
            <div className="overflow-x-auto"><Table>
              <TableHeader>{table.getHeaderGroups().map((hg) => <TableRow key={hg.id}>{hg.headers.map((h) => { const m = h.column.columnDef.meta as Meta | undefined;
                return <TableHead key={h.id} className={m?.right ? "text-right" : ""}>{m?.sort ? <button className="inline-flex items-center gap-1 hover:text-foreground" onClick={() => toggle(m.sort!)}>{flexRender(h.column.columnDef.header, h.getContext())}{sort.id === m.sort ? (sort.desc ? <ArrowDown className="size-3" /> : <ArrowUp className="size-3" />) : <ArrowUpDown className="size-3 opacity-40" />}</button> : flexRender(h.column.columnDef.header, h.getContext())}</TableHead>; })}</TableRow>)}</TableHeader>
              <TableBody>{table.getRowModel().rows.map((r) => <TableRow key={r.id} className="cursor-pointer" onClick={() => setOpen(r.original.id)}>{r.getVisibleCells().map((c) => <TableCell key={c.id} className={(c.column.columnDef.meta as Meta | undefined)?.right ? "text-right" : ""}>{flexRender(c.column.columnDef.cell, c.getContext())}</TableCell>)}</TableRow>)}</TableBody>
            </Table></div>)}
          <div className="flex items-center justify-between border-t px-4 py-2.5 text-xs text-muted-foreground">
            <span className="tnum">{n0(d.total)} matching · page {n0(d.page)} of {n0(d.pages)}</span>
            <div className="flex gap-2"><Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</Button><Button size="sm" variant="outline" disabled={page >= d.pages} onClick={() => setPage(page + 1)}>Next</Button></div>
          </div>
        </div>)}</Async>
      <DetailDrawer id={open} onClose={() => setOpen(null)} />
    </>
  );
}

function DetailDrawer({ id, onClose }: { id: number | null; onClose: () => void }) {
  const s = useApi<Detail>(id ? `/api/transactions/${id}` : null);
  const [notes, setNotes] = useState(""); const [msg, setMsg] = useState<string | null>(null); const [sev, setSev] = useState("medium");
  async function open_case() {
    try { const c = await api<{ id: number }>("/api/cases", { method: "POST", body: JSON.stringify({ txn_id: id, severity: sev, notes }) }); setMsg(`Case #${c.id} opened. Manage it under Investigations.`); s.reload(); }
    catch (e) { setMsg((e as Error).message); }
  }
  const t = s.data?.transaction;
  return (
    <Sheet open={id !== null} onOpenChange={(o) => { if (!o) { onClose(); setMsg(null); setNotes(""); } }}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader><SheetTitle>Transaction #{id}</SheetTitle><SheetDescription>Model flag, human review and dataset label are separate things here.</SheetDescription></SheetHeader>
        <div className="space-y-5 px-4 pb-6">
          {s.error && <ErrorState message={s.error} onRetry={s.reload} />}
          {s.loading && <div className="h-40 animate-pulse rounded bg-muted" />}
          {s.data && t && <>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              {([["Time", dt(String(t.date))], ["Amount", usd(Number(t.amount), 2)], ["Channel", String(t.use_chip)], ["MCC", `${t.mcc} ${t.mcc_description ?? ""}`], ["Merchant", `${t.merchant_city}${t.merchant_state ? ", " + t.merchant_state : ""}`], ["Errors", String(t.errors ?? "none")], ["Client / Card", `${t.client_id} / ${t.card_id}`], ["Split", String(t.split)]] as const).map(([k, v]) => <div key={k}><dt className="text-xs text-muted-foreground">{k}</dt><dd className="tnum">{v}</dd></div>)}
            </dl>
            <div className="grid grid-cols-3 gap-2 rounded-lg border p-3 text-sm">
              <div><div className="text-xs text-muted-foreground">Model score</div><div className="tnum font-semibold">{score(Number(t.risk_score))}</div></div>
              <div><div className="text-xs text-muted-foreground">Band</div><BandPill band={String(t.band)} /></div>
              <div><div className="text-xs text-muted-foreground">Dataset label</div><LabelPill status={String(t.label_status)} /></div>
              <p className="col-span-3 text-[11px] text-muted-foreground">Score scope: {String(t.score_scope)}.</p>
            </div>
            <div><h3 className="mb-2 text-sm font-semibold">Why the model scored it this way</h3>
              <ul className="space-y-1.5">{s.data.explanation.top_features.slice(0, 6).map((x) => {
                const max = Math.max(...s.data!.explanation.top_features.map((y) => Math.abs(y.contribution))); const w = (Math.abs(x.contribution) / max) * 100;
                return <li key={x.feature} className="text-xs"><div className="flex justify-between"><span title={x.description}>{x.feature} = <span className="tnum">{x.value === null ? "missing" : typeof x.value === "number" ? Math.round(x.value * 100) / 100 : x.value}</span></span><span className={x.contribution > 0 ? "text-critical" : "text-low"}>{x.contribution > 0 ? "+" : ""}{x.contribution.toFixed(2)}</span></div><div className="mt-0.5 h-1 rounded bg-muted"><div className={`h-full rounded ${x.contribution > 0 ? "bg-critical" : "bg-low"}`} style={{ width: `${w}%` }} /></div></li>; })}</ul>
              <p className="mt-2 text-[11px] text-muted-foreground">{s.data.explanation_note}</p></div>
            {s.data.indicators.length > 0 && <div><h3 className="mb-1 text-sm font-semibold">Risk indicators</h3><ul className="list-disc space-y-1 pl-4 text-xs text-muted-foreground">{s.data.indicators.map((i) => <li key={i}>{i}</li>)}</ul></div>}
            <div><h3 className="mb-1 text-sm font-semibold">Recent client activity</h3><table className="tnum w-full text-xs"><tbody>{s.data.recent_client_activity.map((a) => <tr key={a.id} className="border-t"><td className="py-1">{dt(a.date)}</td><td>{usd(a.amount, 2)}</td><td className="text-right">{score(a.risk_score)}</td></tr>)}</tbody></table></div>
            <div className="space-y-2 rounded-lg border p-3"><h3 className="text-sm font-semibold">Investigation</h3>
              {s.data.cases.length > 0 && <p className="text-xs text-muted-foreground">Existing: {s.data.cases.map((c) => `#${c.id} (${c.status})`).join(", ")}</p>}
              <Textarea placeholder="Notes for the case" value={notes} maxLength={4000} onChange={(e) => setNotes(e.target.value)} />
              <div className="flex items-center gap-2"><Select value={sev} onValueChange={(v) => setSev(v ?? "medium")}><SelectTrigger className="h-8 w-32"><SelectValue /></SelectTrigger><SelectContent>{["low", "medium", "high", "critical"].map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}</SelectContent></Select><Button size="sm" onClick={open_case}>Open case</Button></div>
              {msg && <p role="status" className="text-xs text-muted-foreground">{msg}</p>}</div>
          </>}
        </div>
      </SheetContent>
    </Sheet>
  );
}

export default function Page() { return <Suspense fallback={null}><Explorer /></Suspense>; }
