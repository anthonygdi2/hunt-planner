import test from "node:test";
import assert from "node:assert/strict";
import { slotOdds, slotSuggestions } from "../../src/core/slots.js";

const pool = Array.from({ length: 100 }, (_, i) => ({ slug: "c" + i, name: "Creature " + String(i).padStart(3, "0") }));

test("odds with no slots: 3 draws from the pool", () => {
  const o = slotOdds(pool, { preferred: [], unwanted: [] }, () => false);
  assert.deepEqual(o, { poolSize: 100, unwanted: 0, preferred: 0, N: 100, W: 100 });
});

test("Preferred weighs 5, Unwanted leaves the pool, slots outside the pool do nothing", () => {
  const o = slotOdds(pool, { preferred: ["c1", "c2", "elsewhere"], unwanted: ["c3", "c4", "gone"] }, (s) => s === "c1" || s === "c5" || s === "c3");
  assert.equal(o.N, 98);
  assert.equal(o.W, 98 + 4 * 2);
  assert.equal(o.preferred, 2);
  assert.equal(o.unwanted, 2);
  assert.equal(o.pAny, 1 - Math.pow(1 - 10 / 106, 3));
  assert.equal(o.pEach, 1 - Math.pow(1 - 5 / 106, 3));
  assert.equal(o.pBase, 1 - Math.pow(1 - 1 / 98, 3));
  // Good: c1 (Preferred, weight 5) and c5; c3 is Unwanted.
  assert.equal(o.good, 2);
  assert.equal(o.pGood, 1 - Math.pow(1 - 6 / 106, 3));
});

test("suggestions", () => {
  const info = (it) => ({
    avoided: it.slug === "c7", locked: it.slug === "c8", minLevel: it.slug === "c8" ? 700 : null,
    score: { c1: { tier: "S", rel: 1 }, c2: { tier: "A", rel: 0.8 }, c3: { tier: "B", rel: 0.65 }, c4: { tier: "C", rel: 0.5 }, c5: { tier: "D", rel: 0.1 }, c6: { tier: "D", rel: 0.3 }, c7: { tier: "S", rel: 0.95 } }[it.slug],
  });
  assert.deepEqual(slotSuggestions("preferred", pool, ["c2"], info, 5).map((x) => [x.it.slug, x.why]), [["c1", "Score S"], ["c3", "Score B"]]);
  assert.deepEqual(slotSuggestions("unwanted", pool, [], info, 5).map((x) => [x.it.slug, x.why]), [["c7", "Avoided"], ["c8", "Needs level 700"], ["c5", "Score D"], ["c6", "Score D"]]);
  assert.equal(slotSuggestions("unwanted", pool, [], info, 2).length, 2);
});
