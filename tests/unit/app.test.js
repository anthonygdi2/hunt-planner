import test from "node:test";
import assert from "node:assert/strict";
import { mergeProfiles, makeWatchers } from "../../src/app/state.js";
import { compute } from "../../src/app/compute.js";
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
  w.sessions("a", (x) => { got.sessions = x; });
  w.creatures((c) => { got.creatures = c; });
  w.plannerState("a", (s) => { got.plan = s; });
  w.marks("a", (m) => { got.marks = m; });
  w.occupancy("a", (o) => { got.occ = o; });
  let profiles = null;
  w.profiles((d) => { profiles = d.map((x) => x.id); });
  await repo.set("profiles/a", { name: "A" });
  await repo.set("profiles/a/entries/rat", { rating: "S", junk: 1 });
  await repo.set("profiles/a/entries/empty", { name: "x" });
  await repo.set("profiles/a/sessions/s1", { hours: 1, kills: [] });
  await repo.set("profiles/a/sessions/bad", { hours: 0 });
  await repo.set("creatures/rat", { name: "Rat", minLevel: { "Elite Knight": 8 } });
  await repo.set("profiles/a/planner/state", { diff: "adept", held: { slug: "bear" } });
  await repo.set("profiles/a/marks/cave", { state: "free", at: "t" });
  await repo.set("profiles/a/occupancy/cave", { counts: { "x|1": [1, 2] } });
  await settle();
  assert.deepEqual(profiles, ["a"]);
  assert.deepEqual(got.entries, { rat: { rating: "S" } });
  assert.deepEqual(got.sessions, [{ id: "s1", hours: 1, kills: [] }]);
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
