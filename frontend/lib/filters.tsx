"use client";
import { createContext, useContext, useEffect, useMemo, useState } from "react";

export type GlobalFilters = { date_from: string; date_to: string; label: string; use_chip: string };
const DEFAULT: GlobalFilters = { date_from: "", date_to: "", label: "all", use_chip: "" };
const Ctx = createContext<{ f: GlobalFilters; set: (p: Partial<GlobalFilters>) => void; reset: () => void }>({ f: DEFAULT, set: () => {}, reset: () => {} });

export function FiltersProvider({ children }: { children: React.ReactNode }) {
  const [f, setF] = useState<GlobalFilters>(DEFAULT);
  useEffect(() => { try { const s = localStorage.getItem("rl-filters"); if (s) setF({ ...DEFAULT, ...JSON.parse(s) }); } catch {} }, []);
  const value = useMemo(() => ({
    f, set: (p: Partial<GlobalFilters>) => setF((c) => { const n = { ...c, ...p }; try { localStorage.setItem("rl-filters", JSON.stringify(n)); } catch {} return n; }),
    reset: () => { setF(DEFAULT); try { localStorage.removeItem("rl-filters"); } catch {} },
  }), [f]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
export const useFilters = () => useContext(Ctx);
