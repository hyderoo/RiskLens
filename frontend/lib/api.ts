"use client";
import { useCallback, useEffect, useRef, useState } from "react";

export const API = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000";

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}

const RETRY_DELAYS = [1000, 2000, 3000, 5000, 8000];
const RETRYABLE = new Set([0, 502, 503, 504]);
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** GET requests are retried with backoff (about 19 s in total) so a cold or restarting API recovers without the user doing anything. */
export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const isGet = !init?.method || init.method.toUpperCase() === "GET";
  for (let attempt = 0; ; attempt++) {
    let res: Response | null = null;
    try { res = await fetch(`${API}${path}`, { ...init, headers: { "content-type": "application/json", ...(init?.headers ?? {}) } }); } catch { res = null; }
    const status = res ? res.status : 0;
    if (res && res.ok) return res.json() as Promise<T>;
    if (isGet && RETRYABLE.has(status) && attempt < RETRY_DELAYS.length) { await wait(RETRY_DELAYS[attempt]); continue; }
    if (!res) throw new ApiError(0, "Cannot reach the RiskLens API. Is the backend running?");
    let msg = `Request failed (${status})`;
    try { const j = await res.json(); msg = typeof j.detail === "string" ? j.detail : Array.isArray(j.detail) ? j.detail.map((d: { msg: string }) => d.msg).join("; ") : msg; } catch {}
    throw new ApiError(status, msg);
  }
}

export function qs(params: Record<string, string | number | boolean | null | undefined>): string {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== null && v !== undefined && v !== "" && v !== "all") u.set(k, String(v));
  const s = u.toString(); return s ? `?${s}` : "";
}

export function useApi<T>(path: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const seq = useRef(0);
  const load = useCallback(() => {
    if (!path) return;
    const id = ++seq.current; setLoading(true); setError(null);
    api<T>(path).then((d) => { if (id === seq.current) { setData(d); setLoading(false); } })
      .catch((e: Error) => { if (id === seq.current) { setError(e.message); setLoading(false); } });
  }, [path]);
// eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);
  return { data, error, loading, reload: load };
}
