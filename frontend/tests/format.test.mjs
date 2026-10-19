import test from "node:test";
import assert from "node:assert/strict";
import { n0, usd, pct, dt, score } from "../lib/format.ts";

test("null and undefined render as a dash, never as 0", () => {
  for (const f of [n0, usd, pct, dt, score]) { assert.equal(f(null), "-"); assert.equal(f(undefined), "-"); }
});
test("counts and currency", () => {
  assert.equal(n0(13305915), "13,305,915");
  assert.equal(usd(1469648.78), "$1,469,649");
  assert.equal(usd(110.2347, 2), "$110.23");
  assert.equal(usd(-210, 2), "-$210.00");
});
test("percent keeps requested precision", () => {
  assert.equal(pct(0.1034, 1), "10.3%");
  assert.equal(pct(0.0015, 3), "0.150%");
});
test("timestamps drop seconds and the T", () => { assert.equal(dt("2019-10-31T23:59:00"), "2019-10-31 23:59"); });
test("small scores use exponent form, larger ones four decimals", () => {
  assert.equal(score(0.0319), "0.0319");
  assert.equal(score(0.00011), "1.1e-4");
});
