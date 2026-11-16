import test from "node:test";
import assert from "node:assert/strict";
import { todayFactor, heldTask, spotValue, scaleSpots, byValue, spotScores, planOffers, planOptions, planChain, preyAdvice, MAX_STEPS } from "../../src/core/plan.js";
import { makeCatalog } from "../../src/core/catalog.js";
import { readWeights } from "../../src/core/score.js";

const catalog = makeCatalog([{ n: "Cobra Assassin", c: "H", m: 12 }, { n: "Cobra Scout", c: "M", m: 6 }, { n: "Rat", c: "E", m: 3 }]);
const ctx = { catalog, chalRates: {}, entries: {}, bestiaryBonus: 0, raidP: 0, expTable: { "cobra-assassin": 1000, "cobra-scout": 500 } };
const NUMS = { src: "own", kph: { "cobra-assassin": 300, "cobra-scout": 200 }, xph: 2e6, pph: 1e5, entry: null };
const SP = { id: "bastion", name: "Cobra Bastion", meta: {} };

test("today's bonuses weigh each creature by its share of the spot's exp", () => {
  assert.deepEqual(todayFactor(NUMS.kph, null, ctx), { mult: 1, notes: [], loot: 1, lootNotes: [] });
  // Exp shares: 300 × 1000 vs 200 × 500 → 3/4 and 1/4. Boosted assassin: 3/4 × 2 + 1/4.
  const t = todayFactor(NUMS.kph, { boosted: "cobra-assassin", prey: [{ slug: "cobra-scout", kind: "xp", pct: 40 }, { slug: "cobra-scout", kind: "loot", pct: 40 }], event: 50 }, ctx);
  assert.ok(Math.abs(t.mult - (0.75 * 2 + 0.25 * 1.4) * 1.5) < 1e-12);
  assert.deepEqual(t.notes, ["Cobra Assassin is boosted (double exp and loot)", "Cobra Scout prey +40% exp", "+50% exp event"]);
  // Loot: the boosted assassin's three quarters doubled, the scout's quarter × 1.4 for its loot Prey; the event doesn't touch it.
  assert.ok(Math.abs(t.loot - (0.75 * 2 + 0.25 * 1.4)) < 1e-12);
  assert.deepEqual(t.lootNotes, ["Cobra Scout prey +40% loot"]);
  // A loot Prey on the boosted creature: its chance is of a doubled set (2 × 1.25).
  const both = todayFactor(NUMS.kph, { boosted: "cobra-assassin", prey: [{ slug: "cobra-assassin", kind: "loot", pct: 25 }] }, ctx);
  assert.ok(Math.abs(both.loot - (0.75 * 2 * 1.25 + 0.25)) < 1e-12);
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

test("a loot Prey adds to a spot's profit", () => {
  const today = { prey: [{ slug: "cobra-scout", kind: "loot", pct: 40 }] }, near = (a, b) => assert.ok(Math.abs(a - b) < 1e-6, a + " vs " + b);
  // Loot 400k/h, the scout a quarter of it (by exp): +40% of 100k on top of the 100k profit.
  const v = spotValue(SP, Object.assign({ lph: 4e5 }, NUMS), { diff: "master", today }, ctx);
  near(v.lootBonus, 4e5 * 0.25 * 0.4);
  near(v.m.profit, 1e5 + 4e4);
  assert.equal(v.pph, 1e5, "the spot's own profit/h stays as logged");
  assert.deepEqual(v.today, ["Cobra Scout prey +40% loot"]);
  assert.equal(v.parts.today, 0, "no exp from it");
  // A session with travel: the bonus only for the hunting hours.
  const s = spotValue(SP, Object.assign({ lph: 4e5 }, NUMS), { diff: "master", today, hours: 2, travel: { bastion: 30 } }, ctx);
  near(s.m.profit, (1e5 + 4e4) * 1.5 / 2);
  // Without the spot's loot/h, or its profit, the Prey isn't counted or named; nor at a spot without the creature.
  const none = spotValue(SP, NUMS, { diff: "master", today }, ctx);
  assert.deepEqual([none.m.profit, none.lootBonus, none.today], [1e5, 0, []]);
  assert.equal(spotValue(SP, Object.assign({}, NUMS, { lph: 4e5, pph: null }), { diff: "master", today }, ctx).m.profit, null);
  const other = spotValue(SP, Object.assign({ lph: 4e5 }, NUMS), { diff: "master", today: { prey: [{ slug: "rat", kind: "loot", pct: 40 }] } }, ctx);
  assert.deepEqual([other.m.profit, other.today], [1e5, []]);
  assert.equal(spotValue(SP, Object.assign({ lph: 4e5 }, NUMS), { diff: "master" }, ctx).m.profit, 1e5, "no boosts: unchanged");
  // Two loot bonuses on one creature add their chances (rules.js TALISMAN): 1 + 0.4 + 0.13, not 1.4 × 1.13.
  const two = todayFactor(NUMS.kph, { prey: [{ slug: "cobra-scout", kind: "loot", pct: 40 }, { slug: "cobra-scout", kind: "loot", pct: 13 }] }, ctx);
  near(two.loot, 0.75 + 0.25 * 1.53);
});

test("the Bounty Talisman's more loot adds to the held creature's spots", () => {
  const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-6, a + " vs " + b);
  const tctx = Object.assign({}, ctx, { talismanLoot: 10 }), held = { slug: "cobra-assassin", kills: 300 }, nums = Object.assign({ lph: 4e5, tasks: [] }, NUMS);
  // Loot 400k/h, the assassin three quarters of it (by exp): 10% of 300k.
  const v = spotValue(SP, nums, { diff: "master", held }, tctx);
  near(v.talismanLoot, 4e5 * 0.75 * 0.1);
  near(v.m.profit, 1e5 + 3e4);
  // With a 40% loot Prey on it too, the chances add: 0.75 × (0.4 + 0.1) of the loot.
  const both = spotValue(SP, nums, { diff: "master", held, today: { prey: [{ slug: "cobra-assassin", kind: "loot", pct: 40 }] } }, tctx);
  near(both.lootBonus + both.talismanLoot, 4e5 * 0.75 * 0.5);
  near(both.m.profit, 1e5 + 1.5e5);
  // Own hunts logged on this bounty include it already; reference numbers never do.
  assert.equal(spotValue(SP, Object.assign({}, nums, { tasks: ["cobra-assassin"] }), { diff: "master", held }, tctx).talismanLoot, 0);
  near(spotValue(SP, Object.assign({}, nums, { src: "ref", tasks: undefined }), { diff: "master", held }, tctx).talismanLoot, 3e4);
  // A 2-hour session that finishes the bounty halfway (300 kills at 300/h): half the hours have it.
  near(spotValue(SP, nums, { diff: "master", held, hours: 2 }, tctx).talismanLoot, 4e5 * 0.75 * 0.1 * 0.5);
  // Only on the held creature, only with a Talisman, only with the spot's loot/h and profit.
  assert.equal(spotValue(SP, nums, { diff: "master" }, tctx).talismanLoot, 0);
  assert.equal(spotValue(SP, nums, { diff: "master", held }, ctx).talismanLoot, 0);
  assert.equal(spotValue(SP, NUMS, { diff: "master", held }, tctx).talismanLoot, 0);
  assert.equal(spotValue(SP, nums, { diff: "master", held: { slug: "rat", kills: 100 } }, tctx).talismanLoot, 0);
  // On the boosted creature the Talisman's chance is of a doubled set of loot.
  near(spotValue(SP, nums, { diff: "master", held, today: { boosted: "cobra-assassin" } }, tctx).talismanLoot, 4e5 * 0.75 * 2 * 0.1);
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

test("a typed bestiary count raises a spot's charm as its creatures near the end", () => {
  const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-9, (msg || "") + " " + a + " vs " + b);
  // Assassin 300/h (Hard: 2,500 kills, 50 points), Scout 200/h (Medium: 1,000 kills, 25 points).
  near(spotValue(SP, NUMS, { diff: "master" }, ctx).m.charm, 300 * 50 / 2500 + 200 * 25 / 1000);
  const counted = Object.assign({}, ctx, { entries: { "cobra-assassin": { bestiaryKills: 2000 }, "cobra-scout": { bestiaryKills: 950 } } });
  near(spotValue(SP, NUMS, { diff: "master" }, counted).m.charm, 300 * 50 / 500 + 25, "500 left at 300/h; the Scout's 50 left are done within the hour");
  // A 2 h session finishes both: 75 points over the 2 hours. The Talisman's double bestiary speeds the held one only.
  near(spotValue(SP, NUMS, { diff: "master", hours: 2 }, counted).m.charm, 75 / 2);
  near(spotValue(SP, NUMS, { diff: "master", held: { slug: "cobra-assassin", kills: 300 } }, Object.assign({}, counted, { bestiaryBonus: 50, entries: { "cobra-assassin": { bestiaryKills: 1500 }, "cobra-scout": { bestiaryDone: true } } })).m.charm,
    300 * 1.5 * 50 / 1000);
});

test("damage bonuses raise every rate of the spot: a damage Prey, and the Talisman while the bounty lasts", () => {
  const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-6 * Math.max(1, Math.abs(b)), (msg || "") + " " + a + " vs " + b);
  const nums = Object.assign({ lph: 4e5, tasks: [] }, NUMS), held = { slug: "cobra-assassin", kills: 300 };
  const plain = spotValue(SP, nums, { diff: "master", held }, ctx);
  assert.equal("killBonus" in plain, false);
  // The assassin is 3/4 of the spot's exp; half the hunt is killing: 1 / (1 − 0.5 × 0.75 × 0.1 / 1.1).
  const km = 1 / (1 - 0.5 * 0.75 * 0.1 / 1.1), tctx = Object.assign({}, ctx, { talismanDamage: 10 });
  const v = spotValue(SP, nums, { diff: "master", held }, tctx);
  near(v.killBonus, km - 1);
  near(v.kph["cobra-assassin"], 300 * km);
  near(v.parts.hunt, 2e6 * km);
  near(v.parts.held, plain.parts.held * km, "the bounty is done sooner");
  near(v.m.profit, 1e5 * km);
  near(v.m.charm, plain.m.charm * km);
  // Not without the bounty, not where its creature doesn't die, not at a respawn-limited spot, and not when the spot's
  // own hunts on that bounty were logged before bonuses were recorded.
  assert.equal(spotValue(SP, nums, { diff: "master" }, tctx).m.profit, 1e5);
  assert.equal(spotValue(SP, nums, { diff: "master", held: { slug: "rat", kills: 100 } }, tctx).m.profit, 1e5);
  assert.equal(spotValue(SP, nums, { diff: "master", held, killTime: 0 }, tctx).m.profit, 1e5);
  assert.equal(spotValue(SP, Object.assign({}, nums, { tasks: ["cobra-assassin"] }), { diff: "master", held }, tctx).m.profit, 1e5);
  // A damage Prey on the scout (1/4 of the spot) counts with or without a bounty, and is named under Today.
  const today = { prey: [{ slug: "cobra-scout", kind: "damage", pct: 25 }, { slug: "rat", kind: "damage", pct: 25 }] };
  const p = spotValue(SP, nums, { diff: "master", today }, ctx), kp = 1 / (1 - 0.5 * 0.25 * 0.25 / 1.25);
  near(p.killBonus, kp - 1);
  near(p.m.xp, 2e6 * kp);
  assert.deepEqual(p.today, ["Cobra Scout prey +25% damage"]);
  // Both on one creature add their percents.
  const b = spotValue(SP, nums, { diff: "master", held, today: { prey: [{ slug: "cobra-assassin", kind: "damage", pct: 15 }] } }, tctx);
  near(b.killBonus, 1 / (1 - 0.5 * 0.75 * 0.25 / 1.25) - 1);
  // A session that finishes the bounty: the Talisman counts only for the share of the hunting time it lasts.
  const s = spotValue(SP, nums, { diff: "master", held: { slug: "cobra-assassin", kills: 300 }, hours: 2 }, tctx), on = 300 / (300 * km * 2);
  near(s.killBonus, (km - 1) * on);
});

test("which creature to put Prey on: the largest share of the spot, and what the biggest Prey of each kind adds", () => {
  const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-6 * Math.max(1, Math.abs(b)), (msg || "") + " " + a + " vs " + b);
  assert.equal(preyAdvice(null, ctx), null);
  assert.equal(preyAdvice({ kph: {}, xph: 0 }, ctx), null);
  // The assassin is 3/4 of the spot's exp. Exp 40%, loot 40% (needs the spot's loot/h), damage 25%.
  const a = preyAdvice(Object.assign({ lph: 4e5 }, NUMS), ctx, null), km = 1 / (1 - 0.5 * 0.75 * 0.25 / 1.25);
  assert.equal(a.slug, "cobra-assassin");
  near(a.share, 0.75);
  assert.deepEqual([a.xp.pct, a.loot.pct, a.damage.pct], [40, 40, 25]);
  near(a.xp.xph, 2e6 * 0.75 * 0.4);
  near(a.loot.pph, 4e5 * 0.75 * 0.4);
  near(a.damage.kills, km - 1);
  near(a.damage.xph, 2e6 * (km - 1));
  near(a.damage.pph, 1e5 * (km - 1));
  // No loot/h: no loot line. A respawn-limited spot: no damage line.
  const b = preyAdvice(NUMS, ctx, 0);
  assert.deepEqual([b.loot, b.damage], [null, null]);
});
