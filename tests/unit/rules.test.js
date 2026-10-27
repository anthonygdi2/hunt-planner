// src/data/rules.js: the game facts from docs/PROJECT_CONTEXT.md ("Game facts established"), frozen.
import test from "node:test";
import assert from "node:assert/strict";
import * as R from "../../src/data/rules.js";

test("task pools, sizes and points", () => {
  assert.deepEqual(R.DIFFICULTIES, ["beginner", "adept", "expert", "master"]);
  assert.equal(R.DIFFICULTIES.reduce((a, d) => a | R.POOL_BIT[d], 0), R.ALL_POOLS);
  assert.deepEqual(R.DIFFICULTIES.map((d) => R.TASK[d].points), [3, 7, 16, 27]);
  assert.deepEqual(R.DIFFICULTIES.map((d) => [R.TASK[d].minKills, R.TASK[d].maxKills]), [[50, 100], [100, 200], [200, 400], [300, 600]]);
  assert.deepEqual(R.KIND_MULT, { normal: 1, silver: 2, gold: 4 });
  assert.equal(R.REWARD_PER_KILL.master, 1875);
});

test("bestiary and Echo Raids", () => {
  assert.deepEqual(["E", "M", "H", "C"].map((c) => [R.BESTIARY[c].kills, R.BESTIARY[c].charmPoints, R.BESTIARY[c].warden]),
    [[500, 15, 5], [1000, 25, 10], [2500, 50, 15], [5000, 100, 30]]);
  assert.equal(R.RAID.wardenShare, 0.1);
  assert.equal(R.RAID.wardenShareDone, 0.2);
  assert.equal(R.RAID.priorPerKill * R.RAID.priorKills, 5);
});

test("weekly exp formula at its boundaries, and caps", () => {
  assert.equal(R.weeklyExpFormula(0), null);
  assert.equal(R.weeklyExpFormula(undefined), null);
  assert.equal(R.weeklyExpFormula(82), 25 * 82 * 82 - 75 * 82 + 100);
  assert.equal(R.weeklyExpFormula(83), Math.round(1994.008 * 83));
  assert.equal(R.weeklyExpFormula(615), 1226315);
  assert.equal(R.weeklyExpFormula(999), Math.round(1994.008 * 999));
  assert.equal(R.weeklyExpFormula(1000), 2 * 1000 * 1000 - 6 * 1000 + 8);
  assert.deepEqual(R.WEEKLY_CAP, { beginner: 200000, adept: 800000, expert: 3000000, master: Infinity });
});

test("tokens, slots, today's bonuses", () => {
  assert.equal(R.TOKEN_CAP, 10);
  assert.deepEqual(R.SLOTS, { max: 5, preferredWeight: 5, offers: 3 });
  assert.equal(R.BOOSTED_EXP_MULT, 2);
  assert.deepEqual(R.PREY.xp, { lo: 13, hi: 40, step: 3 });
  assert.deepEqual(R.EXP_EVENTS, { double: 100, world: [50, 30, 25, 10] });
});

test("rules are frozen", () => {
  assert.throws(() => { R.TASK.master.points = 99; }, TypeError);
  assert.throws(() => { R.EXP_EVENTS.world.push(5); }, TypeError);
  assert.equal(R.TASK.master.points, 27);
});
