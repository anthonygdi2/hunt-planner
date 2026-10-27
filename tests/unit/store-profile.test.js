import test from "node:test";
import assert from "node:assert/strict";
import { readSources, sourcesPreset, sourcesPatch, SOURCE_PRESETS, readSettings, readTheme, DEFAULT_TAKEN_MINUTES, readGoal, goalPatch } from "../../src/store/schema.js";
import { pickReference } from "../../src/core/reference.js";

test("sources: the current shape, migrated from refOff / refOtherOff, everything by default", () => {
  assert.deepEqual(readSources({}), { reference: true, otherVocation: true, older: true });
  assert.deepEqual(readSources(undefined), { reference: true, otherVocation: true, older: true });
  assert.deepEqual(readSources({ refOff: true }), { reference: false, otherVocation: true, older: true });
  assert.deepEqual(readSources({ refOtherOff: true }), { reference: true, otherVocation: false, older: true });
  assert.deepEqual(readSources({ refOff: true, sources: { reference: true, otherVocation: false, older: false } }), { reference: true, otherVocation: false, older: false },
    "the new field wins over the old flags");
  assert.equal(sourcesPreset(SOURCE_PRESETS.mine), "mine");
  assert.equal(sourcesPreset({ reference: true, otherVocation: false, older: true }), "reference");
  assert.equal(sourcesPreset(readSources({})), "everything");
  assert.equal(sourcesPreset({ reference: true, otherVocation: true, older: false }), "custom");
  assert.deepEqual(sourcesPatch({ reference: false, otherVocation: true, older: true }),
    { sources: { reference: false, otherVocation: true, older: true }, refOff: true, refOtherOff: false }, "old flags kept in step for older builds");
});

test("settings: world moves from the planner state, Taken length defaults to 45 min", () => {
  assert.deepEqual(readSettings({}, null), { world: null, takenMinutes: DEFAULT_TAKEN_MINUTES });
  assert.deepEqual(readSettings({}, { world: "Antica" }), { world: "Antica", takenMinutes: 45 });
  assert.deepEqual(readSettings({ settings: { world: " Secura ", takenMinutes: 120 } }, { world: "Antica" }), { world: "Secura", takenMinutes: 120 });
  assert.equal(readSettings({ settings: { takenMinutes: 50 } }).takenMinutes, 45);
  assert.equal(readTheme("dark"), "dark");
  assert.equal(readTheme(null), "system");
  assert.equal(readTheme("purple"), "system");
});

test("goal weights: 0-5 as goal, migrated from the old 0-10 weights", () => {
  assert.deepEqual(readGoal({}), { xp: 5, profit: 0, charm: 0, bounty: 0 }, "nothing stored: Exp");
  // w > 0 ? max(1, round(w / 2)) : 0
  assert.deepEqual(readGoal({ weights: { xp: 10, profit: 0, charm: 0, bounty: 0 } }), { xp: 5, profit: 0, charm: 0, bounty: 0 });
  assert.deepEqual(readGoal({ weights: { xp: 6, profit: 3, charm: 0, bounty: 1 } }), { xp: 3, profit: 2, charm: 0, bounty: 1 });
  assert.deepEqual(readGoal({ weights: { xp: 5, profit: 5 } }), { xp: 3, profit: 3, charm: 0, bounty: 0 });
  assert.deepEqual(readGoal({ weights: { xp: 15, profit: -2, charm: "x" } }), { xp: 5, profit: 0, charm: 0, bounty: 0 });
  assert.deepEqual(readGoal({ weights: { xp: 10 }, goal: { xp: 4, profit: 2, charm: 9, bounty: 0.4 } }), { xp: 4, profit: 2, charm: 5, bounty: 0 }, "goal wins");
  assert.deepEqual(goalPatch({ xp: 4, profit: 2, charm: 0, bounty: 0 }), { goal: { xp: 4, profit: 2, charm: 0, bounty: 0 }, weights: { xp: 8, profit: 4, charm: 0, bounty: 0 } },
    "old weights kept in step at twice the scale");
});

test("older hunts can be left out of the reference", () => {
  const ref = [
    { id: "new", spot: "A", vocation: "Elite Knight", rawXph: 1, creatures: [], source: { date: "2026-08-01", postRebalance: true } },
    { id: "old", spot: "B", vocation: "Elite Knight", rawXph: 1, creatures: [], source: { date: "2024-08-01", postRebalance: false } },
  ];
  assert.deepEqual(pickReference(ref, { vocation: "Elite Knight", enabled: true }).list.map((e) => e.id), ["new", "old"]);
  assert.deepEqual(pickReference(ref, { vocation: "Elite Knight", enabled: true, older: false }).list.map((e) => e.id), ["new"]);
});

test("bounty: the current shape, and migrated from board, reroll, planner diff and held", async () => {
  const { readBounty } = await import("../../src/store/schema.js");
  const ctx = { known: (s) => ["cobra-assassin", "gorerilla"].includes(s), slugOf: (n) => ({ "cobra assassin": "cobra-assassin", gorerilla: "gorerilla" })[String(n).toLowerCase()] || null };
  // Old data: board offers by name, tokens from reroll.left, the held offer becomes the active bounty.
  const old = readBounty({ diff: "expert", held: { slug: "cobra-assassin", kills: 450, done: 30, kind: "normal", since: "t" } },
    { reroll: { left: 4 }, board: { offers: [{ name: "Cobra Assassin", kills: 450, kind: "normal" }, { name: "Gorerilla", kills: 400, exp: 1627800, kind: "silver" }, { name: "", kills: null }] } }, ctx);
  assert.deepEqual(old, { difficulty: "expert", tokens: 4, mode: "active",
    offers: [{ slug: "cobra-assassin", kills: 450, kind: "normal", exp: null }, { slug: "gorerilla", kills: 400, kind: "silver", exp: 1627800 }, { slug: null, kills: null, kind: "normal", exp: null }],
    active: { slug: "cobra-assassin", kills: 450, killsLeft: 420, kind: "normal", exp: null, since: "t" }, zeroChecked: null }, "kills left = kills − the kills typed as done");
  // No data: choosing offers, tokens never set.
  assert.deepEqual(readBounty(undefined, {}, ctx), { difficulty: "master", tokens: null, mode: "offers", offers: [0, 1, 2].map(() => ({ slug: null, kills: null, kind: "normal", exp: null })), active: null, zeroChecked: null });
  // New data wins over the old fields; an active mode without an active bounty falls back to offers.
  const cur = readBounty({ diff: "beginner", bounty: { difficulty: "adept", tokens: 12, mode: "active", active: { slug: "gorerilla", kills: 300, killsLeft: 500, kind: "gold" }, offers: [] } }, { reroll: { left: 2 } }, ctx);
  assert.deepEqual([cur.difficulty, cur.tokens, cur.mode, cur.active.killsLeft], ["adept", 10, "active", 300], "tokens capped at 10, kills left at kills");
  assert.equal(readBounty({ bounty: { mode: "active", active: { slug: "unknown" } } }, {}, ctx).mode, "offers");
  // The day the player last confirmed having no tokens (server day).
  assert.equal(readBounty({ bounty: { tokens: 0, zeroChecked: "2026-10-21" } }, {}, ctx).zeroChecked, "2026-10-21");
  assert.equal(readBounty({ bounty: { tokens: 0, zeroChecked: 5 } }, {}, ctx).zeroChecked, null);
});

test("Hunting now: the current field, migrated from the old timer session", async () => {
  const { readHunting } = await import("../../src/store/schema.js");
  assert.deepEqual(readHunting({ hunting: { spotId: "cobra-bastion", at: "t" } }), { spotId: "cobra-bastion", at: "t" });
  assert.deepEqual(readHunting({ active: { spot: "nuur", name: "Ruins of Nuur", at: "t0" } }), { spotId: "nuur", at: "t0" }, "the old timer becomes Hunting now");
  assert.equal(readHunting({ hunting: null, active: { spot: "nuur", at: "t0" } }), null, "stopped since");
  assert.equal(readHunting({}), null);
});

test("weekly tasks: the current shape, and from the old weekly with the old rule", async () => {
  const { readWeeklyTasks, weeklyTasksFromOld } = await import("../../src/store/schema.js");
  const known = (s) => s === "silencer";
  const w = readWeeklyTasks({ weekStart: "2026-10-19", difficulty: "expert", slots: 9, exp: 0, tasks: [{ slug: "silencer", killsLeft: 300, done: false }, { name: " Varg ", killsLeft: -2, done: true }, { slug: "gone", name: "x" }] }, known);
  assert.deepEqual(w, { weekStart: "2026-10-19", difficulty: "expert", slots: 9, exp: null, tasks: [
    { slug: "silencer", name: null, killsLeft: 300, done: false }, { slug: null, name: "Varg", killsLeft: null, done: true }, { slug: null, name: "x", killsLeft: null, done: false }], any: { killsLeft: null, done: false } });
  assert.deepEqual(readWeeklyTasks({ any: { killsLeft: 2500, done: false } }, known).any, { killsLeft: 2500, done: false }, "the Any Creature task");
  assert.deepEqual(readWeeklyTasks({ any: { killsLeft: -1, done: "yes" } }, known).any, { killsLeft: null, done: false });
  assert.equal(readWeeklyTasks({ slots: 7, tasks: new Array(8).fill({}) }, known).tasks.length, 6, "6 or 9 slots");
  // Old rows as the old app computed them: kills left = K − logged − extra.
  const rows = [{ name: "Silencer", creature: { slug: "silencer" }, K: 600, rem: 390 }, { name: "Retching Horror", creature: { slug: "retching-horror" }, K: 300, rem: 0 },
    { name: "Mystery", K: null, rem: null }, { name: "" }];
  assert.deepEqual(weeklyTasksFromOld({ week: "2026-10-19", diff: "master", exp: null, tasks: [{ name: "Silencer", kills: 600 }, { name: "Retching Horror", kills: 300 }, { name: "Mystery" }] }, rows), {
    weekStart: "2026-10-19", difficulty: "master", slots: 6, exp: null, tasks: [
      { slug: "silencer", name: null, killsLeft: 390, done: false }, { slug: "retching-horror", name: null, killsLeft: 0, done: true }, { slug: null, name: "Mystery", killsLeft: null, done: false }], any: { killsLeft: null, done: false } });
  assert.equal(weeklyTasksFromOld({ tasks: new Array(7).fill({ name: "a", kills: 1 }) }, []).slots, 9, "more than 6 tasks: 9 slots");
});
