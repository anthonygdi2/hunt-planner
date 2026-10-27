import test from "node:test";
import assert from "node:assert/strict";
import * as S from "../../src/store/schema.js";

const docs = (o) => Object.keys(o).map((id) => ({ id, data: () => o[id] }));
const known = (slug) => slug === "cobra-assassin" || slug === "rat";

test("paths", () => {
  assert.equal(S.entryPath("a", "rat"), "profiles/a/entries/rat");
  assert.equal(S.sessionPath("a", "x"), "profiles/a/sessions/x");
  assert.equal(S.plStatePath("a"), "profiles/a/planner/state");
  assert.equal(S.marksPath("a"), "profiles/a/marks");
  assert.equal(S.occupancyPath("a"), "profiles/a/occupancy");
  assert.equal(S.creaturePath("rat"), "creatures/rat");
  assert.equal(S.validCharacterId("main"), true);
  assert.equal(S.validCharacterId("a/b"), false);
  assert.equal(S.validSpotId("cobra-bastion"), true);
  assert.equal(S.validSpotId("Cobra Bastion"), false);
});

test("entries", () => {
  assert.deepEqual(S.readRecord(null), {});
  assert.deepEqual(S.readRecord({ rating: "Q", kph: "12", xph: 5, pph: NaN, notes: "", bestiaryDone: "yes", wardenDone: true, pinSpot: "", name: "Rat" }), { xph: 5, wardenDone: true });
  assert.equal(S.readRecord({ notes: "x".repeat(3000) }).notes.length, 2000);
  assert.deepEqual(S.readRecords(docs({ rat: { rating: "X" }, empty: { name: "Nothing" } })), { rat: { rating: "X" } });
});

test("sessions and creature settings", () => {
  assert.deepEqual(S.readSessions(docs({ a: { hours: 1, kills: [] }, b: { hours: 0, kills: [] }, c: { hours: 1 }, d: null })), [{ id: "a", hours: 1, kills: [] }]);
  assert.deepEqual(S.readCreatureDocs(docs({ rat: { name: "Rat", minLevel: { "Elite Knight": 8 } }, bear: { name: "Bear" } })), { rat: { name: "Rat", minLevel: { "Elite Knight": 8 } } });
});

test("planner state: defaults and every field checked", () => {
  assert.deepEqual(S.readPlState(null, known), S.plDefaults());
  assert.deepEqual(S.readPlState("junk", known), S.plDefaults());
  const s = S.readPlState({
    fixedHours: 30, sessionHours: 2, diff: "expert",
    held: { slug: "cobra-assassin", kills: "400", done: -5, kind: "platinum", exp: 0, i: 1.7, since: 5 },
    today: { boosted: "unknown", boostedDay: "2026-10-21", prey: [{ slug: "rat", kind: "xp", pct: 99 }, { slug: null, kind: "loot", pct: 16 }, { slug: "bear", kind: "xp", pct: 20 }, { slug: "rat", kind: "constructor" }], event: 150 },
    world: "  Antica  ", travel: { "cobra-bastion": "12", "Bad Key": 5, "far": 900 }, lens: { anyLevel: true },
    active: { spot: "cobra-bastion", at: "2026-10-21T17:00:00Z", slug: "bear" },
  }, known);
  assert.equal(s.fixedHours, null, "outside 0.25-12 h");
  assert.equal(s.diff, "expert");
  assert.deepEqual(s.held, { slug: "cobra-assassin", kills: 400, done: 0, kind: "normal", exp: null, i: 1, since: null });
  assert.deepEqual(s.today, { boosted: null, boostedDay: "2026-10-21", prey: [{ slug: "rat", kind: "xp", pct: 13 }, { slug: null, kind: "loot", pct: 16 }], event: 0 }, "an empty slot is kept, an unknown creature isn't");
  assert.equal(s.world, "Antica");
  assert.deepEqual(s.travel, { "cobra-bastion": 12 });
  assert.deepEqual(s.lens, { anyLevel: true });
  assert.deepEqual(s.active, { spot: "cobra-bastion", name: "cobra-bastion", at: "2026-10-21T17:00:00Z", slug: null });
  assert.equal(S.readPlState({ fixedHours: 2, held: { slug: "bear" } }, known).fixedHours, 2);
  assert.equal(S.readPlState({ held: { slug: "bear" } }, known).held, null, "unknown creature");
  assert.equal(S.plNum("", 0, 1), null);
  assert.equal(S.plNum("0.5", 0, 1), 0.5);
});

test("marks and occupancy", () => {
  assert.deepEqual(S.readMark({ state: "taken", at: "t", world: 5 }), { state: "taken", at: "t", world: null });
  assert.equal(S.readMark({ state: "maybe", at: "t" }), null);
  assert.equal(S.readMark({ state: "free" }), null);
  assert.deepEqual(S.readMarks(docs({ a: { state: "free", at: "t", world: "Antica" }, b: {} })), { a: { state: "free", at: "t", world: "Antica" } });
  assert.deepEqual(S.readOcc({ counts: { "antica|7": [2, "3"], "antica|24": [1, 1], "bad": [1, 1], "secura|0": "x", "|5": [-1, 2] } }), { counts: { "antica|7": [2, 3], "|5": [0, 2] } });
  assert.deepEqual(S.readOcc(null), { counts: {} });
  assert.deepEqual(S.readOccs(docs({ a: null })), { a: { counts: {} } });
});
