import test from "node:test";
import assert from "node:assert/strict";
import { RHO, readReroll, killLevels, kindOdds, loggedOdds, MIN_BOARD_OBS, poolModel, taskShape, takeValue, planKey, solvePlan, beatChance, rateThreshold, commonMax } from "../../src/core/reroll.js";
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
const ctx = (over) => Object.assign({ weights: readWeights({ xp: 10 }), pool, preferred: [], unwanted: [], unknown: "poor", odds: { silver: 0, gold: 0 },
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
  assert.deepEqual(m.kinds, [1, 0, 0], "no Silver or Gold: normal offers only");
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
  // 20% Gold: Gold offers are 4×.
  const g = poolModel("master", ctx({ odds: { silver: 0, gold: 20 } }));
  assert.deepEqual(g.kinds, [0.8, 0, 0.2]);
  assert.ok(g.pts.some((p) => p.v === 4), "c5 Gold: 4 × its normal value (scaled to the normal best)");
  assert.ok(Math.abs(g.pts.reduce((a, p) => a + p.p, 0) - 1) < 1e-12, "still adds up to 1");
  // Without odds: the guess in rules.js.
  const d = poolModel("master", ctx({ odds: undefined }));
  assert.ok(Math.abs(d.kinds[0] - 0.88) < 1e-12 && d.kinds[1] === 0.1 && d.kinds[2] === 0.02, "10% Silver, 2% Gold");
});

test("Silver and Gold odds", () => {
  assert.deepEqual(kindOdds({ silver: 25, gold: 5 }), [0.7, 0.25, 0.05]);
  assert.deepEqual(kindOdds({ silver: 0, gold: 0 }), [1, 0, 0]);
  assert.equal(kindOdds({ silver: 60, gold: 50 })[0], 0, "never below 0");
  // Logged offers, over every difficulty.
  assert.deepEqual(loggedOdds({}), { n: 0, silver: null, gold: null });
  assert.deepEqual(loggedOdds(undefined), { n: 0, silver: null, gold: null });
  const log = { master: [{ kind: "normal" }, { kind: "silver" }, { kind: "gold" }, { kind: "normal" }], expert: [{ kind: "silver" }] };
  assert.deepEqual(loggedOdds(log), { n: 5, silver: 40, gold: 20 });
  assert.equal(MIN_BOARD_OBS, 10);
});

test("more Silver and Gold make rerolling worth more", () => {
  const none = solvePlan(poolModel("master", ctx()), 3), some = solvePlan(poolModel("master", ctx({ odds: { silver: 10, gold: 2 } })), 3);
  assert.ok(some.h[5] > none.h[5], "a fresh board is worth more");
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

test("the plan settles at its fixed point (one more sweep moves it by less than 1e-5)", () => {
  const big = Array.from({ length: 60 }, (_, i) => ({ it: { slug: "b" + i }, e: { kph: 200 + (i * 37) % 400, xph: (1 + (i * 7919) % 100) * 1e5 }, blocked: i % 9 === 0 }));
  const m = poolModel("master", ctx({ pool: big, odds: { silver: 10, gold: 2 } })), plan = solvePlan(m, 3), h = plan.h;
  // One sweep by hand: with s tokens, the best of 3 offers (by its take value) or a reroll to s − 1.
  const sweep = h.map((_, s) => {
    const qs = plan.pts.map((q) => ({ p: q.p, x: s > 0 && !(q.v > 0) ? -Infinity : takeValue(h, s, q.v, q) })).sort((a, b) => a.x - b.x);
    const R = s > 0 ? h[s - 1] : -Infinity;
    let c = 0, prev = 0, e = 0;
    qs.forEach((q) => { c += q.p; const c3 = Math.min(1, c) ** 3; if (c3 > prev) e += (c3 - prev) * Math.max(q.x, R); prev = c3; });
    return e;
  });
  sweep.forEach((x, s) => assert.ok(Math.abs(x - h[s]) / h[s] < 1e-5, "h[" + s + "]: " + x + " vs " + h[s]));
});
