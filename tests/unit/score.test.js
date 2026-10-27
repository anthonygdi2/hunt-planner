import test from "node:test";
import assert from "node:assert/strict";
import { GOAL_KEYS, PRESETS, PRESET_IDS, readWeights, scoringWeights, presetOf, shares, weightedValue, scoreList, tierScores } from "../../src/core/score.js";

test("reading weights: whole numbers 0-5", () => {
  assert.deepEqual(readWeights({ xp: "4", profit: 2.4, charm: -1, bounty: "x" }), { xp: 4, profit: 2, charm: 0, bounty: 0 });
  assert.deepEqual(readWeights({ xp: 50 }), { xp: 5, profit: 0, charm: 0, bounty: 0 });
  assert.deepEqual(readWeights(undefined), { xp: 0, profit: 0, charm: 0, bounty: 0 });
  assert.deepEqual(scoringWeights(readWeights({})), PRESETS.exp, "nothing weighted: the plan uses Exp");
  assert.deepEqual(scoringWeights(readWeights({ charm: 1 })), { xp: 0, profit: 0, charm: 1, bounty: 0 });
});

test("presets and shares (design: Exp, Profit, Mostly exp some profit, Balanced, Charm points, Bounty points)", () => {
  assert.deepEqual(GOAL_KEYS, ["xp", "profit", "charm", "bounty"]);
  assert.deepEqual(PRESET_IDS, ["exp", "profit", "mostly", "balanced", "charm", "bounty"]);
  assert.deepEqual(PRESETS.mostly, { xp: 4, profit: 2, charm: 0, bounty: 0 });
  assert.equal(presetOf(readWeights(PRESETS.charm)), "charm");
  assert.equal(presetOf(readWeights({ xp: 3, profit: 3 })), "balanced");
  assert.equal(presetOf(readWeights({ xp: 3, profit: 2, bounty: 1 })), "custom");
  assert.deepEqual(shares({ xp: 6, profit: 3, charm: 0, bounty: 1 }), { xp: 0.6, profit: 0.3, charm: 0, bounty: 0.1 });
  assert.deepEqual(shares({ xp: 0, profit: 0, charm: 0, bounty: 0 }), { xp: 0, profit: 0, charm: 0, bounty: 0 });
});

test("scores are weighted averages of each metric over the list's best", () => {
  const list = [{ slug: "a" }, { slug: "b" }, { slug: "c" }, { slug: "d" }];
  const m = { a: { xp: 100, profit: 10 }, b: { xp: 50, profit: 20 }, c: { xp: 80, profit: null }, d: null };
  const r = scoreList(list, (x) => m[x.slug], readWeights({ xp: 3, profit: 1 }));
  assert.deepEqual(r.metrics, m);
  assert.deepEqual(r.scores, { a: (3 * 1 + 1 * 0.5) / 4, b: (3 * 0.5 + 1 * 1) / 4 }, "c lacks profit and d has no metrics, so no score");
  // Only the weighted goals count.
  assert.deepEqual(scoreList(list, (x) => m[x.slug], readWeights({ xp: 1 })).scores, { a: 1, b: 0.5, c: 0.8 });
  assert.deepEqual(scoreList(list, (x) => m[x.slug], readWeights({})).scores, {}, "no goal, no scores");
  // A goal where everything is 0 counts as 0, not as missing.
  assert.deepEqual(scoreList([{ slug: "a" }], () => ({ xp: 0 }), readWeights({ xp: 1 })).scores, { a: 0 });
});

test("negative profit scales by the largest absolute value", () => {
  const r = scoreList([{ slug: "a" }, { slug: "b" }], (x) => ({ profit: x.slug === "a" ? -200 : 100 }), readWeights({ profit: 1 }));
  assert.deepEqual(r.scores, { a: -1, b: 0.5 });
});

test("tiers relative to the best score", () => {
  const t = tierScores({ a: 2, b: 1.85, c: 1.5, d: 1.2, e: 0.9, f: 0.5 });
  assert.deepEqual(t.tier, { a: "S", b: "S", c: "A", d: "B", e: "C", f: "D" });
  assert.equal(t.rel.c, 0.75);
  assert.deepEqual(tierScores({ a: 0, b: -1 }), { rel: { a: 0, b: 0 }, tier: { a: "D", b: "D" } });
  assert.deepEqual(tierScores({}), { rel: {}, tier: {} });
});

test("weightedValue", () => {
  assert.equal(weightedValue({ xp: 50, profit: 5 }, { xp: 1, profit: 1 }, ["xp", "profit"], { xp: 100, profit: 10 }), 0.5);
  assert.equal(weightedValue({ xp: 50 }, { xp: 1, profit: 1 }, ["xp", "profit"], { xp: 100, profit: 10 }), null);
  assert.equal(weightedValue(null, { xp: 1 }, ["xp"], {}), null);
  assert.equal(weightedValue({ xp: 5 }, { xp: 1 }, ["xp"], { xp: 0 }), 0);
});
