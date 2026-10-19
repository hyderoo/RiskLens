export const n0 = (v: number | null | undefined) => v == null ? "-" : new Intl.NumberFormat("en-US").format(Math.round(v));
export const compact = (v: number | null | undefined) => v == null ? "-" : new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 2 }).format(v);
export const usd = (v: number | null | undefined, d = 0) => v == null ? "-" : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: d, minimumFractionDigits: d }).format(v);
export const usdC = (v: number | null | undefined) => v == null ? "-" : "$" + compact(v);
export const pct = (v: number | null | undefined, d = 2) => v == null ? "-" : (v * 100).toFixed(d) + "%";
export const dt = (s: string | null | undefined) => s ? s.replace("T", " ").slice(0, 16) : "-";
export const score = (v: number | null | undefined) => v == null ? "-" : v >= 0.001 ? v.toFixed(4) : v.toExponential(1);
export const BAND_COLOR: Record<string, string> = { low: "var(--low)", medium: "var(--medium)", high: "var(--high)", critical: "var(--critical)" };
