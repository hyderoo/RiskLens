"use client";
import { qs } from "@/lib/api";
import { useFilters } from "@/lib/filters";

/** Query string for the global filters shared by overview / explorer / analytics. */
export function useGlobalQs(extra: Record<string, string | number | null | undefined> = {}) {
  const { f } = useFilters();
  return qs({ date_from: f.date_from, date_to: f.date_to, label: f.label, use_chip: f.use_chip, ...extra });
}
