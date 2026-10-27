import test from "node:test";
import assert from "node:assert/strict";
import { todayFactor, heldTask, spotValue, scaleSpots, byValue, spotScores, planOffers, planOptions, planChain, MAX_STEPS } from "../../src/core/plan.js";
import { makeCatalog } from "../../src/core/catalog.js";
import { readWeights } from "../../src/core/score.js";

const catalog = makeCatalog([{ n: "Cobra Assassin", c: "H", m: 12 }, { n: "Cobra Scout", c: "M", m: 6 }, { n: "Rat", c: "E", m: 3 }]);
const ctx = { catalog, chalRates: {}, entries: {}, bestiaryBonus: 0, raidP: 0, expTable: { "cobra-assassin": 1000, "cobra-scout": 500 } };
const NUMS = { src: "own", kph: { "cobra-assassin": 300, "cobra-scout": 200 }, xph: 2e6, pph: 1e5, entry: null };
const SP = { id: "bastion", name: "Cobra Bastion", meta: {} };

test("today's bonuses weigh each creature by its share of the spot's exp", () => {
  assert.deepEqual(todayFactor(NUMS.kph, null, ctx), { mult: 1, notes: [] });
  // Exp shares: 300 × 1000 vs 200 × 500 → 3/4 and 1/4. Boosted assassin: 3/4 × 2 + 1/4.
  const t = todayFactor(NUMS.kph, { boosted: "cobra-assassin", prey: [{ slug: "cobra-scout", kind: "xp", pct: 40 }, { slug: "cobra-scout", kind: "loot", pct: 40 }], event: 50 }, ctx);
  assert.ok(Math.abs(t.mult - (0.75 * 2 + 0.25 * 1.4) * 1.5) < 1e-12);
  assert.deepEqual(t.notes, ["Cobra Assassin is boosted (double exp)", "Cobra Scout prey +40% exp", "+50% exp event"]);
  // A creature with unknown exp: kill shares instead.
  assert.ok(Math.abs(todayFactor({ "cobra-assassin": 300, rat: 100 }, { boosted: "rat" }, ctx).mult - (0.75 + 0.25 * 2)) < 1e-12);
});

test("the held task", () => {
  assert.equal(heldTask(null, "master", ctx), null);
  assert.equal(heldTask({ slug: "nope" }, "master", ctx), null);
  const h = heldTask({ slug: "cobra-assassin", kills: 400, done: 100, kind: "silver" }, "master", ctx);
  assert.deepEqual([h.slug, h.kills, h.left, h.reward, h.points], ["cobra-assassin", 400, 300, 1875 * 400 * 2, 54]);
});

test("a spot's value per hour", () => {
  const held = { slug: "cobra-assassin", kills: 400, done: 100 };
  const weekly = [{ key: "cobra-scout", name: "Cobra Scout", rem: 400, exp: 1e6 }];
  // No session length: hourly rates, each remaining kill worth reward / kills left.
  const v = spotValue(SP, NUMS, { diff: "master", held, weekly }, ctx);
  assert.equal(v.hours, null);
  assert.equal(v.parts.hunt, 2e6);
  assert.equal(v.parts.held, 1875 * 400 * 300 / 300);
  assert.equal(v.parts.weekly, 1e6 * 200 / 400);
  assert.equal(v.m.bounty, 27);
  assert.equal(v.m.xp, v.parts.hunt + v.parts.held + v.parts.weekly);
  assert.equal(v.held.hoursLeft, 1);
  assert.equal(v.m.charm, 300 * 50 / 2500 + 200 * 25 / 1000);
  // A 2 h session with 30 min of travel: 1.5 h hunting; the task finishes, the weekly share is capped.
  const s = spotValue(SP, NUMS, { diff: "master", hours: 2, held, weekly, travel: { bastion: 30 } }, ctx);
  assert.deepEqual([s.hours, s.huntHours, s.travelMin], [2, 1.5, 30]);
  assert.equal(s.parts.hunt, 2e6 * 1.5 / 2);
  assert.equal(s.held.finishes, true);
  assert.equal(s.parts.held, 1875 * 400 / 2);
  assert.equal(s.weekly[0].kills, 300);
  assert.equal(spotValue(SP, null, { diff: "master" }, ctx), null);
  // Any Creature: all 500 kills/h count.
  const any = spotValue(SP, NUMS, { diff: "master", weekly: [{ key: "any", name: "Any Creature", rem: 5000, exp: 1e6 }] }, ctx);
  assert.equal(any.parts.weekly, 1e6 * 500 / 5000);
});

test("scaling spots", () => {
  const vals = [{ m: { xp: 2, profit: 1 } }, { m: { xp: 4, profit: null } }, { m: { xp: 1, profit: 2 } }];
  const sc = scaleSpots(vals, { weights: readWeights({ xp: 1, profit: 1 }), model: null });
  assert.equal(sc.model, null);
  assert.deepEqual(vals.map((x) => x.v), [0.5, null, 0.625]);
  assert.deepEqual(vals.map((x) => x.score), [80, null, 100]);
  assert.equal(sc.pct(0.5), 80);
  assert.equal(sc.pct(-1), 0);
  // Pooled: the pool's maxima and best set the scale.
  const pooled = [{ m: { xp: 2 } }];
  scaleSpots(pooled, { weights: readWeights({ xp: 1 }), model: { known: 3, best: 0.5, max: { xp: 4 } } });
  assert.deepEqual([pooled[0].v, pooled[0].score], [0.5, 100]);
  assert.deepEqual([{ v: null }, { v: 1 }, { v: 2 }].sort(byValue).map((x) => x.v), [2, 1, null]);
  assert.deepEqual(spotScores([null, { m: { xp: 1 } }, { m: { xp: 3 } }], { weights: readWeights({ xp: 1 }), model: null }).map((x) => x.score), [100, 33]);
});

test("offers to plan with", () => {
  const board = [{ name: "cobra assassin", kills: 400 }, { name: "Rat", kills: 50 }, { slug: "cobra-scout", kills: 300, kind: "gold" }, null];
  assert.deepEqual(planOffers(board, null, "master", catalog).map((o) => [o.key, o.slug, o.held]), [["o0", "cobra-assassin", false]], "only Master pool creatures");
  const held = planOffers(board, { slug: "cobra-assassin", kills: 400, done: 50 }, "master", catalog);
  assert.deepEqual([held.length, held[0].held, held[0].done], [1, true, 50]);
  const off = planOffers([], { slug: "cobra-assassin", kills: 400, done: 50 }, "master", catalog);
  assert.deepEqual([off[0].key, off[0].i], ["held", -1]);
});

test("options and the chain", () => {
  const index = { list: [
    { id: "a", name: "A", meta: {} }, { id: "b", name: "B", meta: {} }, { id: "c", name: "C", meta: { team: "duo" } }, { id: "d", name: "D", meta: {} },
  ] };
  const value = { a: 3, b: 2, c: 5, d: 1 };
  const po = planOptions({ index, offers: [], hours: 0, inLens: (sp) => (sp.id === "d" ? "level" : ""),
    valueAt: (sp) => ({ id: sp.id, name: sp.name, m: { xp: value[sp.id] }, parts: { hunt: value[sp.id], today: 0, held: 0, weekly: 0 }, weekly: [], today: [], held: null, src: "own" }),
    scale: (all) => scaleSpots(all, { weights: readWeights({ xp: 1 }), model: null }) });
  assert.deepEqual(po.options.map((o) => o.id), ["a", "b"], "duo spots need team any; D is out of the lens");
  assert.equal(po.hours, null);

  const NOW = Date.parse("2026-10-21T18:00:00Z");
  const marks = { a: { state: "taken", at: "2026-10-21T17:50:00Z" } };
  const ch = planChain(po, { diff: "master", now: NOW, marks, tokens: 3, tokensUnknown: true, hpd: 3, solve: () => { throw new Error("no plan when tokens are unknown"); } });
  assert.deepEqual(ch.steps.map((s) => s.kind), ["go", "seeSpots"]);
  assert.deepEqual(ch.notes, ["Skipped A: marked taken 10 min ago."]);
  assert.equal(ch.steps[0].bounty, null, "no offers: no bounty line");
  assert.equal(ch.steps[1].text, "Taken? → See Spots for more");
  assert.match(ch.steps[1].why, /^Set your reroll tokens/);
  const none = planChain(po, { diff: "master", now: NOW, marks: {}, tokens: 0, hpd: 3 });
  assert.deepEqual(none.steps.map((s) => s.kind), ["claim", "go", "go", "seeSpots"]);
  assert.ok(MAX_STEPS >= 2);
});
