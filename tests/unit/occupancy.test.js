import test from "node:test";
import assert from "node:assert/strict";
import { MARK_MINUTES, markAge, markActive, occKey, occOdds, orderValue, orderByOdds } from "../../src/core/occupancy.js";

const NOW = Date.parse("2026-10-21T18:00:00Z");

test("marks", () => {
  assert.equal(markAge({ at: "2026-10-21T17:30:00Z" }, NOW), 30);
  assert.equal(markAge({ at: "2026-10-21T18:05:00Z" }, NOW), 0, "a mark from the future counts as now");
  assert.equal(markAge({}, NOW), Infinity);
  assert.equal(markAge(null, NOW), Infinity);
  assert.equal(MARK_MINUTES, 45);
  assert.equal(markActive({ at: "2026-10-21T17:15:00Z" }, NOW), true);
  assert.equal(markActive({ at: "2026-10-21T17:14:00Z" }, NOW), false);
  assert.equal(markActive({ at: "2026-10-21T17:00:00Z" }, NOW, 60), true);
  assert.equal(markActive(undefined, NOW), false);
  assert.equal(occKey(" Antica ", 7), "antica|7");
});

test("odds a spot is free", () => {
  // No marks: the world prior, 1/2.
  assert.equal(occOdds({}, "a", "Antica", NOW).p, 0.5);
  const occ = {
    a: { counts: { "antica|18": [0, 4], "antica|19": [0, 2], "antica|3": [3, 0], "secura|18": [9, 0] } },
    b: { counts: { "antica|12": [5, 1] } },
  };
  const a = occOdds(occ, "a", "antica", NOW);
  assert.deepEqual([a.free, a.n, a.freeAll, a.nAll], [0, 6, 3, 9], "near 18:00 is 17-19; other worlds don't count");
  // World: 8 free of 15 → 9/17; spot: (3 + 2 × 9/17) / 11; near the hour: (0 + 2 × that) / 8.
  const pWorld = 9 / 17, pSpot = (3 + 2 * pWorld) / 11;
  assert.ok(Math.abs(a.p - 2 * pSpot / 8) < 1e-12);
  assert.ok(occOdds(occ, "b", "antica", NOW).p > 0.5);
  assert.equal(occOdds({ x: { counts: { "w|18": [0, 1000] } } }, "x", "w", NOW).p, 0.02, "clamped");
  // Hours wrap around midnight.
  assert.equal(occOdds({ x: { counts: { "w|23": [1, 0] } } }, "x", "w", Date.parse("2026-10-21T00:30:00Z")).n, 1);
});

test("checking order", () => {
  const close = { v: 0.9, odds: { p: 0.9 }, travelMin: 5 }, best = { v: 1, odds: { p: 0.2 }, travelMin: 30 };
  assert.ok(orderValue([close, best], 2, 0) > orderValue([best, close], 2, 0));
  assert.deepEqual(orderByOdds([best, close], 2, 0), [close, best]);
  // Equal odds and trips: best value first.
  const x = { v: 1, odds: { p: 0.5 } }, y = { v: 0.5, odds: { p: 0.5 } };
  assert.deepEqual(orderByOdds([x, y], 2, 0), [x, y]);
  assert.equal(orderValue([], 2, 0.3), 0.3, "nothing to check: the fallback");
});
