import test from "node:test";
import assert from "node:assert/strict";
import { api, qs, ApiError } from "../lib/api.ts";

const realFetch = globalThis.fetch;
const res = (status, body) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
test.afterEach(() => { globalThis.fetch = realFetch; });

test("qs drops empty, null and 'all' values", () => {
  assert.equal(qs({ a: 1, b: "", c: null, d: undefined, e: "all", f: "x y" }), "?a=1&f=x+y");
  assert.equal(qs({}), "");
});
test("a cold API (503, then network error, then 200) recovers on its own for GET", async () => {
  let n = 0;
  globalThis.fetch = async () => { n++; if (n === 1) return res(503, {}); if (n === 2) throw new TypeError("fetch failed"); return res(200, { ok: true }); };
  assert.deepEqual(await api("/api/status"), { ok: true });
  assert.equal(n, 3);
});
test("validation errors are not retried and keep the server message", async () => {
  let n = 0;
  globalThis.fetch = async () => { n++; return res(422, { detail: [{ msg: "Input should be a valid number" }] }); };
  await assert.rejects(() => api("/api/transactions?amount_min=abc"), (e) => e instanceof ApiError && e.status === 422 && /valid number/.test(e.message));
  assert.equal(n, 1);
});
test("POST is never retried", async () => {
  let n = 0;
  globalThis.fetch = async () => { n++; return res(503, {}); };
  await assert.rejects(() => api("/api/cases", { method: "POST", body: "{}" }));
  assert.equal(n, 1);
});
