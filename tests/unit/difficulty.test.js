import test from "node:test";
import assert from "node:assert/strict";
import { compareDifficulties, MIN_COVERAGE, SUGGEST_GAIN } from "../../src/core/difficulty.js";
import { RHO } from "../../src/core/reroll.js";

// A fake pool model: `known` of `size` creatures with numbers, and a plan whose board value with s tokens is v + s.
const model = (diff, size, known, v) => ({ diff, rows: new Array(size).fill({}), known, pts: [{}], best: 1, v });
const solve = (m) => ({ h: Array.from({ length: 11 }, (_, s) => m.v + s) });
const rate = (v, s) => RHO * (v + s);

test("each difficulty's long-run value, against the current one", () => {
  const models = { beginner: model("beginner", 150, 20, 50), adept: model("adept", 450, 200, 80), expert: model("expert", 500, 300, 130), master: model("master", 280, 140, 100) };
  // Choosing offers on Master with 3 tokens: another difficulty costs a token (its board with 2 left).
  const c = compareDifficulties(models, solve, { tokens: 3, current: "master", active: false });
  const by = Object.fromEntries(c.rows.map((r) => [r.diff, r]));
  assert.equal(by.beginner.enough, false, "20 of 150 is under " + MIN_COVERAGE);
  assert.equal(by.beginner.rate, null);
  assert.deepEqual([by.master.cost, by.expert.cost], [0, 1]);
  assert.equal(by.master.rate, rate(100, 3));
  assert.equal(by.expert.rate, rate(130, 2));
  assert.ok(Math.abs(by.expert.gain - (132 / 103 - 1)) < 1e-12);
  assert.ok(by.expert.gain >= SUGGEST_GAIN);
  assert.equal(c.best, "expert");
  assert.equal(c.free, false);
  // With an active bounty the switch is free: the next board is the new difficulty's, same tokens.
  const a = compareDifficulties(models, solve, { tokens: 3, current: "master", active: true });
  assert.equal(a.rows.filter((r) => r.diff === "expert")[0].rate, rate(130, 3));
  assert.equal(a.free, true);
  // No tokens while choosing: another difficulty can't be seen yet.
  const z = compareDifficulties(models, solve, { tokens: 0, current: "master", active: false });
  assert.equal(z.rows.filter((r) => r.diff === "expert")[0].needsToken, true);
  assert.equal(z.best, null);
});

test("a small gain isn't suggested, and a current difficulty without numbers defers to the best", () => {
  const close = { beginner: null, adept: null, expert: model("expert", 500, 300, 105), master: model("master", 280, 140, 100) };
  assert.equal(compareDifficulties(close, solve, { tokens: 5, current: "master", active: true }).best, null, "5% better: not worth suggesting");
  const thin = { beginner: null, adept: model("adept", 450, 200, 80), expert: model("expert", 500, 300, 90), master: model("master", 280, 20, 200) };
  const t = compareDifficulties(thin, solve, { tokens: 5, current: "master", active: true });
  assert.equal(t.best, "expert");
  assert.equal(t.rows.filter((r) => r.diff === "expert")[0].gain, null);
  assert.equal(compareDifficulties({}, solve, { tokens: 5, current: "master", active: true }).best, null);
});
