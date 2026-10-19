"use client";
export const AXIS = { stroke: "var(--muted-foreground)", fontSize: 11 } as const;
export const GRID = "var(--border)";
export function ChartTip({ active, payload, label, fmt }: { active?: boolean; payload?: { name: string; value: number; color: string; payload: Record<string, unknown> }[]; label?: string | number; fmt?: (name: string, v: number) => string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border bg-popover px-3 py-2 text-xs shadow-lg">
      <div className="mb-1 font-medium">{label}</div>
      {payload.map((p) => <div key={p.name} className="flex items-center gap-2"><span className="size-2 rounded-full" style={{ background: p.color }} /><span className="text-muted-foreground">{p.name}</span><span className="tnum ml-auto pl-4 font-medium">{fmt ? fmt(p.name, p.value) : p.value.toLocaleString()}</span></div>)}
    </div>
  );
}
