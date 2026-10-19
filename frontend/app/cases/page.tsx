"use client";
import { useState } from "react";
import Link from "next/link";
import { Async, EmptyState, PageHeader, Panel } from "@/components/kit";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { api, useApi } from "@/lib/api";
import { dt, score } from "@/lib/format";

type Case = { id: number; txn_id: number; status: string; severity: string; disposition: string; notes: string; model_score: number | null; created_at: string; updated_at?: string };
const STATUS = ["open", "in_review", "escalated", "closed"]; const DISP = ["none", "confirmed_fraud", "false_positive", "inconclusive"];

type Hist = { at: string; field: string; old: string | null; new: string | null };
function CaseHistory({ id, bump }: { id: number; bump: number }) {
  const h = useApi<{ history: Hist[] }>(`/api/cases/${id}?v=${bump}`);
  if (h.error) return <p className="text-xs text-destructive">Could not load history: {h.error}</p>;
  if (!h.data) return <p className="text-xs text-muted-foreground">Loading history...</p>;
  return (
    <div className="md:col-span-3">
      <div className="eyebrow mb-1">Case history</div>
      <ul className="space-y-0.5 text-xs text-muted-foreground">
        {h.data.history.map((x, i) => <li key={i} className="tnum"><span className="text-foreground">{dt(x.at)}</span> {x.field === "created" ? "case opened" : `${x.field}: ${x.old ?? "none"} \u2192 ${x.new ?? "none"}`}</li>)}
      </ul>
    </div>
  );
}

export default function Cases() {
  const [filter, setFilter] = useState("all");
  const s = useApi<{ rows: Case[]; persistence: string }>(`/api/cases${filter === "all" ? "" : `?status=${filter}`}`);
  const [bump, setBump] = useState(0); const [edit, setEdit] = useState<Case | null>(null); const [msg, setMsg] = useState<string | null>(null);
  async function save(c: Case, patch: Partial<Case>) {
    try { await api(`/api/cases/${c.id}`, { method: "PATCH", body: JSON.stringify(patch) }); setMsg(`Case #${c.id} updated.`); setBump((b) => b + 1); setEdit(null); s.reload(); } catch (e) { setMsg((e as Error).message); }
  }
  return (
    <>
      <PageHeader title="Investigations" subtitle="Case queue for flagged transactions. A disposition here is an analyst's decision and is stored separately from the dataset's fraud label." />
      <div className="mb-3 flex items-center gap-3"><Select value={filter} onValueChange={(v) => setFilter(v ?? "all")}><SelectTrigger className="h-8 w-40"><SelectValue>{(v: string | null) => (!v || v === "all" ? "All statuses" : v.replace("_", " "))}</SelectValue></SelectTrigger><SelectContent><SelectItem value="all">All statuses</SelectItem>{STATUS.map((x) => <SelectItem key={x} value={x}>{x.replace("_", " ")}</SelectItem>)}</SelectContent></Select>{msg && <span role="status" className="text-xs text-muted-foreground">{msg}</span>}</div>
      <Async state={s} h="h-64">{(d) => (<Panel title={`Cases (${d.rows.length})`} note={d.persistence}>
        {d.rows.length === 0 ? <EmptyState title="No cases yet" text="Open one from a transaction's detail drawer in the Transaction Explorer." /> :
          <table className="w-full text-xs"><thead className="text-muted-foreground"><tr><th className="text-left font-normal">Case</th><th className="text-left font-normal">Transaction</th><th className="text-left font-normal">Severity</th><th className="text-left font-normal">Status</th><th className="text-left font-normal">Disposition</th><th className="text-right font-normal">Score</th><th /></tr></thead>
            <tbody>{d.rows.map((c) => <tr key={c.id} className="border-t"><td className="tnum py-2">#{c.id}<div className="text-[10px] text-muted-foreground">{dt(c.created_at)}</div></td><td><Link className="tnum text-primary hover:underline" href={`/transactions?txn_id=${c.txn_id}`}>#{c.txn_id}</Link></td><td className="capitalize">{c.severity}</td><td className="capitalize">{c.status.replace("_", " ")}</td><td className="capitalize">{c.disposition.replace("_", " ")}</td><td className="tnum text-right">{score(c.model_score)}</td><td className="text-right"><Button size="sm" variant="outline" onClick={() => setEdit(c)}>Update</Button></td></tr>)}</tbody></table>}
      </Panel>)}</Async>
      {edit && <Panel title={`Update case #${edit.id}`} className="mt-4"><div className="grid gap-3 md:grid-cols-3">
        <label className="text-xs text-muted-foreground">Status<Select value={edit.status} onValueChange={(v) => setEdit({ ...edit, status: v ?? edit.status })}><SelectTrigger className="mt-1 h-8"><SelectValue>{(v: string | null) => (v ?? "").replace("_", " ")}</SelectValue></SelectTrigger><SelectContent>{STATUS.map((x) => <SelectItem key={x} value={x}>{x.replace("_", " ")}</SelectItem>)}</SelectContent></Select></label>
        <label className="text-xs text-muted-foreground">Disposition<Select value={edit.disposition} onValueChange={(v) => setEdit({ ...edit, disposition: v ?? edit.disposition })}><SelectTrigger className="mt-1 h-8"><SelectValue>{(v: string | null) => (v ?? "").replace("_", " ")}</SelectValue></SelectTrigger><SelectContent>{DISP.map((x) => <SelectItem key={x} value={x}>{x.replace("_", " ")}</SelectItem>)}</SelectContent></Select></label>
        <label className="text-xs text-muted-foreground">Severity<Select value={edit.severity} onValueChange={(v) => setEdit({ ...edit, severity: v ?? edit.severity })}><SelectTrigger className="mt-1 h-8"><SelectValue /></SelectTrigger><SelectContent>{["low", "medium", "high", "critical"].map((x) => <SelectItem key={x} value={x}>{x}</SelectItem>)}</SelectContent></Select></label>
        <div className="md:col-span-3"><Textarea maxLength={4000} value={edit.notes} onChange={(e) => setEdit({ ...edit, notes: e.target.value })} aria-label="Notes" /></div>
        <CaseHistory id={edit.id} bump={bump} />
        <div className="flex gap-2"><Button size="sm" onClick={() => save(edit, { status: edit.status, disposition: edit.disposition, severity: edit.severity, notes: edit.notes })}>Save</Button><Button size="sm" variant="ghost" onClick={() => setEdit(null)}>Cancel</Button></div>
      </div></Panel>}
    </>
  );
}
