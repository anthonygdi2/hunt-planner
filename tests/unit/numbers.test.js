import test from "node:test";
import assert from "node:assert/strict";
import { manualNums, pickSpot, effective } from "../../src/core/numbers.js";
import { readWeights } from "../../src/core/score.js";

const A = { spot: "A", kph: 100, xph: 1e6, pph: 5e4, last: "2026-10-01T10:00:00", sample: 100, sampleHours: 1 };
const B = { spot: "B", kph: 200, xph: 2e6, pph: -1e4, last: "2026-10-02T10:00:00", sample: 400, sampleHours: 2 };
const byXp = { metricFor: (c) => ({ xp: c.xph, profit: c.pph }), weights: readWeights({ xp: 10 }) };

test("manual numbers", () => {
  assert.equal(manualNums({ kph: 0 }), true);
  assert.equal(manualNums({ notes: "x" }), false);
  assert.equal(manualNums(null), false);
});

test("picking a creature's spot", () => {
  assert.deepEqual(pickSpot([A, B], null, byXp), { spots: [A, B], best: B, pinned: false });
  assert.equal(pickSpot([A, B], null, { metricFor: byXp.metricFor, weights: readWeights({ profit: 10 }) }).best, A);
  assert.deepEqual(pickSpot([A, B], "A", byXp), { spots: [A, B], best: A, pinned: true });
  assert.equal(pickSpot([A, B], "Gone", byXp).pinned, false, "a pin to a spot that's not there is ignored");
  assert.equal(pickSpot([A], null, { metricFor: () => { throw new Error("not scored"); } }).best, A);
  // No goal set: no scores, so the highest exp/h.
  assert.equal(pickSpot([A, B], null, { metricFor: byXp.metricFor, weights: readWeights({}) }).best, B);
});

test("effective numbers: manual fields win, the chosen spot fills the rest", () => {
  const entry = { kph: 150, notes: "n", updatedAt: "2026-09-01T00:00:00Z" };
  const e = effective(entry, { best: B });
  assert.deepEqual([e.src, e.kph, e.xph, e.pph, e.spot, e.fromSessions, e.numsAt], ["own", 150, 2e6, -1e4, "B", true, "2026-09-01T00:00:00Z"]);
  assert.equal(e.sample, undefined, "kills/h is manual, so no sample");
  const s = effective(undefined, { best: B });
  assert.deepEqual([s.src, s.kph, s.numsAt, s.sample, s.sampleHours], ["own", 200, B.last, 400, 2]);
  assert.deepEqual(effective(undefined, undefined), {});
  assert.deepEqual(effective({ xph: 5 }, undefined), { src: "own", xph: 5 });
  assert.equal(effective(entry, undefined).src, "own");
  const plain = { notes: "only notes" };
  assert.equal(effective(plain, undefined), plain);
});

test("effective numbers from a reference spot", () => {
  const ref = { spot: "Lair", ref: true, src: "refAdj", entry: { id: "lair" }, kph: 300, xph: 3e6, pph: 1e5, profitStale: true };
  const e = effective({}, { best: ref });
  assert.deepEqual([e.src, e.kph, e.spot, e.numsAt, e.profitStale, e.refEntry.id], ["refAdj", 300, "Lair", null, true, "lair"]);
  assert.equal(effective({}, { best: Object.assign({}, ref, { pph: null }) }).profitStale, false, "no profit, nothing dated");
});
