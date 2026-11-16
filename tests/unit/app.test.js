import test from "node:test";
import assert from "node:assert/strict";
import { mergeProfiles, makeWatchers } from "../../src/app/state.js";
import { compute } from "../../src/app/compute.js";
import { makeModel } from "../../src/app/model.js";
import { makeRepo } from "../../src/store/repo.js";
import { makeCatalog } from "../../src/core/catalog.js";
import { memDb, settle } from "./helpers.js";

const docs = (o) => Object.keys(o).map((id) => ({ id, data: () => o[id] }));

test("profiles merge with this device's unsaved changes", () => {
  const m = mergeProfiles(docs({ b: { name: "B", createdAt: "2026-02", level: 1 }, a: { name: "A", createdAt: "2026-01" }, gone: null }), {
    pending: { b: { level: 2 } }, pendingNew: { n: true }, current: { n: { name: "New", createdAt: "2026-03" }, old: { name: "Old" } },
  });
  assert.deepEqual(m.order, ["a", "b", "n"]);
  assert.equal(m.profiles.b.level, 2, "the unsaved change wins");
  assert.equal(m.profiles.n.name, "New", "a character not stored yet stays");
  assert.equal("old" in m.profiles, false, "a deleted character goes");
});

test("watchers deliver normalized documents", async () => {
  const repo = makeRepo(memDb()), w = makeWatchers(repo, { known: (s) => s === "rat" });
  const got = {};
  w.entries("a", (r) => { got.entries = r; });
  w.hunts((x) => { got.hunts = x; });
  w.spots((x) => { got.spots = x; });
  w.creatures((c) => { got.creatures = c; });
  w.plannerState("a", (s) => { got.plan = s; });
  w.marks("a", (m) => { got.marks = m; });
  w.occupancy("a", (o) => { got.occ = o; });
  let profiles = null;
  w.profiles((d) => { profiles = d.map((x) => x.id); });
  await repo.set("profiles/a", { name: "A" });
  await repo.set("profiles/a/entries/rat", { rating: "S", junk: 1 });
  await repo.set("profiles/a/entries/empty", { name: "x" });
  await repo.set("hunts/s1", { hours: 1, kills: [], vocation: "Elite Knight", level: 615, by: { pid: "a", name: "A" } });
  await repo.set("hunts/bad", { hours: 0 });
  await repo.set("spots/my-den", { name: "Den" });
  await repo.set("creatures/rat", { name: "Rat", minLevel: { "Elite Knight": 8 } });
  await repo.set("profiles/a/planner/state", { diff: "adept", held: { slug: "bear" } });
  await repo.set("profiles/a/marks/cave", { state: "free", at: "t" });
  await repo.set("profiles/a/occupancy/cave", { counts: { "x|1": [1, 2] } });
  await settle();
  assert.deepEqual(profiles, ["a"]);
  assert.deepEqual(got.entries, { rat: { rating: "S" } });
  assert.deepEqual(got.hunts, [{ id: "s1", hours: 1, kills: [], vocation: "Elite Knight", level: 615, by: { pid: "a", name: "A" } }]);
  assert.deepEqual(got.spots, { "my-den": { name: "Den", parentId: null, note: null, createdAt: null } });
  assert.deepEqual(got.creatures, { rat: { name: "Rat", minLevel: { "Elite Knight": 8 } } });
  assert.equal(got.plan.diff, "adept");
  assert.equal(got.plan.held, null, "unknown creature dropped");
  assert.deepEqual(got.marks, { cave: { state: "free", at: "t", world: null } });
  assert.deepEqual(got.occ, { cave: { counts: { "x|1": [1, 2] } } });
});

test("compute on a small state", () => {
  const catalog = makeCatalog([{ n: "Cobra Assassin", c: "H", m: 12 }, { n: "Cobra Scout", c: "M", m: 6 }]);
  const reference = [{ id: "lair", spot: "Test Lair", vocation: "any", rawXph: 4e6, profitph: 2e5, creatures: [{ slug: "cobra-scout", kph: 300 }], source: { date: "2026-09-01", postRebalance: true } }];
  const sessions = [{ id: "s", spot: "Bastion", hours: 1, rawXp: 3e6, balance: 1e5, kills: [{ slug: "cobra-assassin", name: "Cobra Assassin", count: 400 }] }];
  const state = { catalog, reference, profile: { vocation: "Elite Knight", level: 500, weights: { xp: 10 } }, sessions, entries: {}, advanced: false, difficulty: "master" };
  const d = compute(state, Date.parse("2026-10-21T18:00:00Z"));
  assert.equal(d.raidP, 0.001);
  assert.deepEqual(Object.keys(d.spotKph), ["Bastion", "Test Lair"]);
  assert.equal(d.refSpotSrc["Test Lair"], "ref");
  assert.deepEqual([d.derived["cobra-assassin"].best.spot, d.derived["cobra-assassin"].best.kph], ["Bastion", 400]);
  assert.equal(d.derived["cobra-scout"].fromRef, true);
  assert.deepEqual(Object.keys(d.scores), ["cobra-assassin"], "only Master pool creatures are scored at Master");
  assert.equal(d.tiers["cobra-assassin"], "S");
  assert.deepEqual(d.weeklyNow, []);
  assert.equal(d.ctx("master").raidP, 0.001);
  // Reference off: no reference spots or picks.
  const off = compute(Object.assign({}, state, { profile: Object.assign({}, state.profile, { refOff: true }) }), 0);
  assert.deepEqual(Object.keys(off.spotKph), ["Bastion"]);
  assert.equal(off.derived["cobra-scout"], undefined);
});

test("compute counts only the shared hunts that apply to the character", () => {
  const catalog = makeCatalog([{ n: "Cobra Assassin", c: "H", m: 12 }, { n: "Cobra Scout", c: "M", m: 6 }]);
  const reference = [{ id: "bastion", spot: "Cobra Bastion", vocation: "Elite Knight", levelMin: 500, rawXph: 4e6, creatures: [{ slug: "cobra-assassin", kph: 300 }], source: { date: "2026-09-01", postRebalance: true } }];
  const EK = "Elite Knight", RP = "Royal Paladin";
  const sessions = [
    { id: "ek", spot: "Cobra Bastion", hours: 1, rawXp: 3e6, vocation: EK, level: 610, by: { pid: "a" }, kills: [{ slug: "cobra-assassin", count: 400 }] },
    { id: "cave", spot: "Scout Cave", hours: 1, rawXp: 1e6, vocation: EK, level: 620, by: { pid: "a" }, kills: [{ slug: "cobra-scout", count: 200 }] },
    { id: "rp", spot: "Scout Cave", hours: 1, rawXp: 2e5, vocation: RP, level: 45, by: { pid: "a" }, kills: [{ slug: "cobra-scout", count: 100 }] },
  ];
  const run = (profile, pid) => compute({ catalog, reference, pid: pid || "a", profile: Object.assign({ vocation: RP, level: 45 }, profile), sessions, entries: {}, advanced: false, difficulty: "all" }, 0);
  let d = run({});
  assert.deepEqual(d.hunts.use.map((x) => x.id), ["rp"], "only the paladin's hunt");
  assert.equal(d.derived["cobra-scout"].best.kph, 100);
  assert.deepEqual([...d.hunts.why].map(([x, w]) => x.id + ":" + w), ["ek:voc", "cave:voc"]);
  d = run({ otherVocationHunts: true });
  assert.deepEqual(d.hunts.use.map((x) => x.id), ["rp"], "other vocations on: the level rules still apply");
  assert.deepEqual([...d.hunts.why].map(([x, w]) => x.id + ":" + w), ["ek:level", "cave:window"]);
  d = run({ otherVocationHunts: true, levelWindow: 0 });
  assert.deepEqual(d.hunts.use.map((x) => x.id), ["cave", "rp"], "any level: only the spot's minimum level is left");
  // A new knight sees the hunts another character logged as a knight, and is calibrated from them.
  d = run({ vocation: EK, level: 633 }, "b");
  assert.deepEqual(d.hunts.use.map((x) => x.id), ["ek", "cave"]);
  assert.equal(d.derived["cobra-assassin"].best.spot, "Cobra Bastion");
  assert.ok(d.calib && d.calib.spots.length === 1, "calibrated from the other knight's hunt at the reference spot");
  assert.equal(d.huntCtx.window, 20);
  d = run({ vocation: EK, level: 480 }, "b");
  assert.deepEqual([...d.hunts.why].map(([x, w]) => x.id + ":" + w), ["ek:level", "cave:window", "rp:voc"], "level 480: the level-500 spot is cut off, 620 is outside ±20%");
  d = run({ vocation: EK, level: 480, levelWindow: 35 }, "b");
  assert.deepEqual(d.hunts.use.map((x) => x.id), ["cave"], "±35% reaches 648");
});

test("the Spots lens widens which shared hunts count there, as it widens the reference spots", () => {
  const catalog = makeCatalog([{ n: "Cobra Scout", c: "M", m: 6 }]);
  const sessions = [
    { id: "ek", spot: "Scout Cave", hours: 1, rawXp: 1e6, vocation: "Elite Knight", level: 45, by: { pid: "a" }, kills: [{ slug: "cobra-scout", count: 200 }] },
    { id: "old", spot: "Scout Hill", hours: 1, rawXp: 2e5, vocation: "Royal Paladin", level: 300, by: { pid: "a" }, kills: [{ slug: "cobra-scout", count: 100 }] },
  ];
  const M = makeModel({ catalog, reference: [], pid: "b", profile: { vocation: "Royal Paladin", level: 45 }, sessions, entries: {}, advanced: false, difficulty: "all", planner: {} }, null, 0);
  const counted = (lens) => M.spotIndex(lens).list.filter((sp) => sp.sessions.length).map((sp) => sp.id);
  assert.deepEqual(counted(), []);
  assert.deepEqual(counted({ allVocations: true }), ["scout-cave"]);
  assert.deepEqual(counted({ anyLevel: true }), ["scout-hill"]);
  assert.deepEqual(counted({ allVocations: true, anyLevel: true }), ["scout-cave", "scout-hill"]);
  assert.equal(M.spotIndex(), M.spotIndex(null), "one index per lens");
  assert.deepEqual(M.derived.hunts.use, [], "the character's own numbers don't change");
});

test("a loot Prey reaches the profit of reference spots and logged spots", () => {
  const catalog = makeCatalog([{ n: "Cobra Assassin", c: "H", m: 12 }, { n: "Cobra Scout", c: "M", m: 6 }]);
  const reference = [{ id: "lair", spot: "Test Lair", vocation: "any", rawXph: 4e6, profitph: 2e5, lootph: 5e5, creatures: [{ slug: "cobra-scout", kph: 300 }], source: { date: "2026-09-01", postRebalance: true } },
    { id: "pit", spot: "Old Pit", vocation: "any", rawXph: 1e6, profitph: 1e5, creatures: [{ slug: "cobra-scout", kph: 100 }], source: { date: "2026-09-01", postRebalance: true } }];
  const sessions = [{ id: "s", spot: "Scout Cave", hours: 1, rawXp: 1e6, loot: 3e5, supplies: 1e5, balance: 2e5, by: { pid: "a" }, kills: [{ slug: "cobra-scout", count: 200 }] }];
  const today = { boosted: null, boostedDay: null, prey: [{ slug: "cobra-scout", kind: "loot", pct: 40 }], event: 0 };
  const M = makeModel({ catalog, reference, pid: "a", profile: { vocation: "Elite Knight", level: 500 }, sessions, entries: {}, advanced: false, difficulty: "all", expTable: {},
    planner: { state: { today } } }, null, 0);
  const at = (id, td) => M.spotValue(M.spotIndex().spots[id], { today: td });
  assert.equal(Math.round(at("test-lair", M.today()).m.profit), 2e5 + 5e5 * 0.4, "a reference spot: its loot/h × 40%");
  assert.equal(Math.round(at("scout-cave", M.today()).m.profit), 2e5 + 3e5 * 0.4, "a logged spot: its own loot/h");
  assert.equal(at("old-pit", M.today()).m.profit, 1e5, "no loot/h on the entry: not counted");
  assert.equal(at("test-lair", null).m.profit, 2e5);
});

test("the Bounty Talisman's loot reaches the plan's spots and the creature metrics, but not hunts on the bounty", () => {
  const catalog = makeCatalog([{ n: "Cobra Assassin", c: "H", m: 12 }, { n: "Cobra Scout", c: "M", m: 6 }]);
  const reference = [{ id: "lair", spot: "Test Lair", vocation: "any", rawXph: 4e6, profitph: 2e5, lootph: 5e5, creatures: [{ slug: "cobra-scout", kph: 300 }], source: { date: "2026-09-01", postRebalance: true } }];
  const lap = { id: "s", spot: "Scout Cave", hours: 1, rawXp: 1e6, loot: 3e5, supplies: 1e5, balance: 2e5, by: { pid: "a" }, kills: [{ slug: "cobra-assassin", count: 200 }] };
  const state = (sessions) => ({ catalog, reference, pid: "a", profile: { vocation: "Elite Knight", level: 500, talisman: { loot: 10, bestiary: 0 }, bestiaryBonus: 0 },
    sessions, entries: {}, advanced: false, difficulty: "master", expTable: {}, planner: { state: {} } });
  const M = makeModel(state([lap]), null, 0);
  const at = (id, slug) => M.spotValue(M.spotIndex().spots[id], { held: { slug, kills: 400 }, diff: "master" });
  assert.equal(Math.round(at("test-lair", "cobra-scout").m.profit), 2e5 + 5e5 * 0.1, "a reference spot: its loot/h × 10%");
  assert.equal(Math.round(at("scout-cave", "cobra-assassin").m.profit), 2e5 + 3e5 * 0.1, "a test lap: its own loot/h × 10%");
  assert.equal(at("test-lair", "cobra-assassin").m.profit, 2e5, "the held creature isn't there");
  assert.equal(Math.round(M.derived.metrics["cobra-assassin"].profit), 2e5 + 3e5 * 0.1, "the creature's metrics count it too");
  // A hunt logged on that bounty already has it.
  const B = makeModel(state([Object.assign({}, lap, { task: "cobra-assassin" })]), null, 0);
  assert.equal(B.spotValue(B.spotIndex().spots["scout-cave"], { held: { slug: "cobra-assassin", kills: 400 }, diff: "master" }).m.profit, 2e5);
  assert.equal(B.derived.metrics["cobra-assassin"].profit, 2e5);
});

test("loot bonuses on during a logged hunt are taken out of its numbers, and today's are added once", () => {
  const catalog = makeCatalog([{ n: "Cobra Assassin", c: "H", m: 12 }, { n: "Cobra Scout", c: "M", m: 6 }]);
  // A hunt with the assassin boosted and a 10% Talisman on its bounty: one creature, so its loot was 2 × 1.1 = 2.2 × base.
  const hunt = { id: "s", spot: "Scout Cave", hours: 1, rawXp: 1e6, loot: 4.4e5, supplies: 1e5, balance: 3.4e5, by: { pid: "a" }, task: "cobra-assassin",
    kills: [{ slug: "cobra-assassin", count: 200 }], boosts: { boosted: "cobra-assassin", prey: [], talisman: 10 } };
  const state = (sessions, today) => ({ catalog, reference: [], pid: "a", profile: { vocation: "Elite Knight", level: 500, talisman: { loot: 10, bestiary: 0 } },
    sessions, entries: {}, advanced: false, difficulty: "master", expTable: {}, planner: { state: { today: today || {} } } });
  const M = makeModel(state([hunt]), null, 0), sp = M.spotIndex().spots["scout-cave"];
  const near = (a, b, why) => assert.ok(Math.abs(a - b) < 1e-6, why + ": " + a + " vs " + b);
  // Base loot 200k, base profit 100k; the Talisman is added back while the bounty lasts, since this hunt's was taken out.
  near(M.spotNums(sp).lph, 2e5, "base loot/h");
  near(M.spotNums(sp).pph, 1e5, "base profit/h");
  near(M.spotValue(sp, { held: { slug: "cobra-assassin", kills: 400 }, diff: "master" }).m.profit, 1e5 + 2e5 * 0.1, "with the Talisman");
  near(M.derived.metrics["cobra-assassin"].profit, 1e5 + 2e5 * 0.1, "the creature's metrics too");
  // Boosted again today (server day of time 0): the loot doubles and the Talisman's chance is of a doubled set.
  const B = makeModel(state([hunt], { boosted: "cobra-assassin", boostedDay: "1969-12-31" }), null, 0), bsp = B.spotIndex().spots["scout-cave"];
  const v = B.spotValue(bsp, { held: { slug: "cobra-assassin", kills: 400 }, diff: "master", today: B.today() });
  near(v.lootBonus, 2e5, "double loot");
  near(v.talismanLoot, 2e5 * 2 * 0.1, "the Talisman on the boosted creature");
  // The same hunt without boosts (logged before they were recorded) is taken as it is, Talisman included.
  const L = makeModel(state([Object.assign({}, hunt, { boosts: undefined })]), null, 0);
  near(L.spotValue(L.spotIndex().spots["scout-cave"], { held: { slug: "cobra-assassin", kills: 400 }, diff: "master" }).m.profit, 3.4e5, "an older hunt");
});

test("a spot the character can't go to stays out of its plan and its creatures' numbers", () => {
  const catalog = makeCatalog([{ n: "Cobra Assassin", c: "H", m: 12 }, { n: "Cobra Scout", c: "M", m: 6 }]);
  const ref = (id, spot, xph, slug) => ({ id, spot, vocation: "any", rawXph: xph, profitph: 2e5, creatures: [{ slug, kph: 300 }], source: { date: "2026-09-01", postRebalance: true } });
  const reference = [ref("a", "Locked Lair", 9e6, "cobra-assassin"), ref("b", "Open Cave", 4e6, "cobra-assassin"), ref("c", "Scout Cave", 3e6, "cobra-scout")];
  const den = { id: "s", spot: "Den", spotId: "my-den", hours: 1, rawXp: 8e6, balance: 1e5, by: { pid: "a" }, kills: [{ slug: "cobra-scout", count: 500 }] };
  const state = (noAccess) => ({ catalog, reference, pid: "a", profile: { vocation: "Elite Knight", level: 500, weights: { xp: 10 } }, sessions: [den], userSpots: { "my-den": { name: "Den" } },
    entries: {}, advanced: false, difficulty: "master", expTable: {}, planner: { state: { noAccess: noAccess || {}, travel: {} } } });
  const ids = (M) => M.planOptions(M.plannerCtx()).options.map((o) => o.id);
  let M = makeModel(state(), null, 0);
  assert.deepEqual(ids(M), ["locked-lair", "my-den", "open-cave", "scout-cave"]);
  assert.equal(M.derived.derived["cobra-assassin"].best.spot, "Locked Lair");
  assert.equal(M.derived.derived["cobra-scout"].best.spot, "Den");
  // A reference spot and a spot the player made, both off: the plan and each creature's numbers go to the next spot.
  M = makeModel(state({ "locked-lair": true, "my-den": true }), null, 0);
  assert.deepEqual(ids(M), ["open-cave", "scout-cave"]);
  assert.equal(M.derived.derived["cobra-assassin"].best.spot, "Open Cave");
  assert.equal(M.derived.derived["cobra-scout"].best.spot, "Scout Cave", "its own hunts are at a spot it can't go to: the reference spot");
  assert.deepEqual(M.planChain(M.plannerCtx({ marks: {} })).steps.filter((x) => x.kind === "go").map((x) => x.option.id).filter((id) => id === "locked-lair" || id === "my-den"), [], "no step sends it there");
  // Where respawn is the limit, the Talisman's damage adds nothing; elsewhere it raises the creature's numbers.
  const dmg = (respawnLimit) => { const s = state(); s.profile.talisman = { damage: 10 }; s.planner.state.respawnLimit = respawnLimit; return makeModel(s, null, 0); };
  const xpAt = (m) => m.spotValue(m.spotIndex().spots["locked-lair"], { held: { slug: "cobra-assassin", kills: 400 }, diff: "master" }).parts.hunt;
  assert.ok(Math.abs(xpAt(dmg({})) / xpAt(dmg({ "locked-lair": true })) - 1 / (1 - 0.5 * 0.1 / 1.1)) < 1e-9, "the only creature there: half the time is killing");
  assert.equal(xpAt(dmg({ "locked-lair": true })), xpAt(makeModel(state(), null, 0)));
  assert.ok(dmg({}).derived.metrics["cobra-assassin"].killBonus > 0);
  assert.equal("killBonus" in dmg({ "locked-lair": true }).derived.metrics["cobra-assassin"], false);
  // The Spots list still values them (blocked: null).
  assert.equal(M.planOptions(M.plannerCtx({ blocked: null })).options.length, 4);
});
