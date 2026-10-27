import test from "node:test";
import assert from "node:assert/strict";
import { RHO, readReroll, killLevels, poolModel, taskShape, takeValue, planKey, solvePlan, beatChance, rateThreshold, commonMax } from "../../src/core/reroll.js";
import { readWeights } from "../../src/core/score.js";

test("reading reroll settings", () => {
  assert.deepEqual(readReroll(undefined), { left: 0, hpd: 3, unknown: "poor", hasLeft: false });
  assert.deepEqual(readReroll({ left: "14", hpd: "2.5", unknown: "average" }), { left: 10, hpd: 2.5, unknown: "average", hasLeft: true });
  assert.deepEqual(readReroll({ left: -3, hpd: 0, unknown: "?" }), { left: 0, hpd: 3, unknown: "poor", hasLeft: true });
});

test("task shape", () => {
  assert.deepEqual(killLevels("master"), [350, 450, 550]);
  const q = taskShape(2, 3);
  assert.equal(q.T, 2);
  assert.equal(q.dT, Math.exp(-RHO * 2));
  assert.equal(q.A, (1 - q.dT) / RHO);
  assert.equal(q.a, 1);
  assert.ok(Math.abs(q.fr - 2 / 3) < 1e-12);
  assert.equal(taskShape(null, 3).T, 1, "unknown length counts as an hour");
});

// A pool of five creatures with exp/h 1..5 (relative), kills/h 450, so a default task is an hour.
const pool = [1, 2, 3, 4, 5].map((n) => ({ it: { slug: "c" + n }, e: { kph: 450, xph: n * 1e6 }, blocked: n === 1 }));
const ctx = (over) => Object.assign({ weights: readWeights({ xp: 10 }), pool, preferred: [], unwanted: [], unknown: "poor", rewardObs: [],
  metricsFor: (it, e, kills, mult) => ({ xp: e.xph * (mult || 1) }) }, over);

test("pool models on one scale", () => {
  const own = poolModel("master", ctx()), other = poolModel("expert", ctx({ pool: pool.map((p) => Object.assign({}, p, { e: { kph: 450, xph: p.e.xph * 2 } })) }));
  const scale = commonMax([own, null, other]);
  assert.deepEqual(scale, { xp: 10e6 });
  const scaled = poolModel("master", ctx({ scale }));
  assert.equal(scaled.best, 0.5, "scored against the other pool's best");
  assert.deepEqual(scaled.own, { xp: 5e6 }, "its own best is kept");
  assert.equal(own.best, 1, "without a scale: its own best");
});

test("pool model", () => {
  assert.equal(poolModel("master", ctx({ weights: readWeights({}) })), null, "no goal");
  const m = poolModel("master", ctx());
  assert.equal(m.known, 4, "the blocked creature has no value");
  assert.equal(m.best, 1);
  assert.equal(m.medKph, 450);
  assert.deepEqual(m.kinds, [1, 0, 0], "fewer than 10 boards logged: normal offers only");
  assert.equal(m.pts.length, 5 * 3);
  assert.ok(Math.abs(m.pts.reduce((a, p) => a + p.p, 0) - 1) < 1e-12, "probabilities add up to 1");
  assert.deepEqual(m.pts.slice(0, 3).map((p) => p.v), [0, 0, 0], "blocked offers are worth 0");
  // Unwanted creatures leave the pool; Preferred ones weigh 5.
  const u = poolModel("master", ctx({ unwanted: ["c5"], preferred: ["c4"] }));
  assert.equal(u.rows.length, 4);
  assert.equal(u.best, 1, "c4 is now the best");
  assert.equal(u.rows.find((r) => r.it.slug === "c4").w, 5);
  assert.deepEqual(u.lists, { preferred: 1, unwanted: 1 }, "list creatures in this pool");
  assert.deepEqual(poolModel("master", ctx({ unwanted: ["nope"], preferred: [] })).lists, { preferred: 0, unwanted: 0 }, "not in this pool: not counted");
  // Ten logged boards with two Gold: Gold offers are 4×.
  const g = poolModel("master", ctx({ rewardObs: Array.from({ length: 10 }, (_, i) => ({ kind: i < 2 ? "gold" : "normal" })) }));
  assert.deepEqual(g.kinds, [0.8, 0, 0.2]);
  assert.ok(g.pts.some((p) => p.v === 4), "c5 Gold: 4 × its normal value (scaled to the normal best)");
});

test("the plan: more tokens are worth more, and the advice follows it", () => {
  const m = poolModel("master", ctx());
  const plan = solvePlan(m, 3);
  for (let s = 1; s < plan.h.length; s++) assert.ok(plan.h[s] >= plan.h[s - 1] - 1e-9, "h is non-decreasing in tokens");
  assert.equal(planKey(m, 3), planKey(poolModel("master", ctx()), 3));
  const q = taskShape(1, 3);
  const thr = rateThreshold(plan, 5, q);
  assert.ok(thr > 0 && thr < 1);
  assert.ok(beatChance(plan, 5, takeValue(plan.h, 5, 1, taskShape(550 / 450, 3))) < 1e-9, "nothing beats the best creature's longest task");
  assert.ok(beatChance(plan, 5, takeValue(plan.h, 5, 1, q)) > 0, "its longer tasks beat its one-hour one");
  assert.ok(beatChance(plan, 5, 0) > 0.5);

});
