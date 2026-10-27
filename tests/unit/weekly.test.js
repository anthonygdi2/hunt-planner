import test from "node:test";
import assert from "node:assert/strict";
import { weekStart, weekKey, weeklyReward, readWeekly, loggedSince, weeklyRows, openWeeklies, weeklyBonus, ANY_CREATURE, allKph, weeklyDifficulties } from "../../src/core/weekly.js";
import { makeCatalog } from "../../src/core/catalog.js";

const catalog = makeCatalog([{ n: "Cobra Assassin", c: "H", m: 12 }, { n: "Cobra Scout", c: "M", m: 6 }]);
const WED = new Date("2026-10-21T18:00:00Z");

test("the week starts Monday at server save (08:00 UTC)", () => {
  assert.equal(weekStart(WED).toISOString(), "2026-10-19T08:00:00.000Z");
  assert.equal(weekKey(WED), "2026-10-19");
  assert.equal(weekKey(new Date("2026-10-19T07:59:59Z")), "2026-10-12", "Monday before server save is last week");
  assert.equal(weekKey(new Date("2026-10-19T08:00:00Z")), "2026-10-19");
  assert.equal(weekKey(new Date("2026-10-25T23:00:00Z")), "2026-10-19", "Sunday");
});

test("weekly reward: formula capped by difficulty", () => {
  assert.equal(weeklyReward(615, "master"), Math.round(1994.008 * 615));
  assert.equal(weeklyReward(615, "expert"), 1226315 < 3000000 ? 1226315 : 3000000);
  assert.equal(weeklyReward(615, "adept"), 800000);
  assert.equal(weeklyReward(50, "beginner"), 25 * 2500 - 75 * 50 + 100);
  assert.equal(weeklyReward(500, "beginner"), 200000);
  assert.equal(weeklyReward(undefined, "master"), null);
});

test("reading the stored weekly", () => {
  const w = readWeekly({ week: "2026-10-19", diff: "expert", tasks: [{ name: "Cobra Scout", kills: 300 }] }, 615, WED);
  assert.equal(w.tasks.length, 9);
  assert.deepEqual(w.tasks[1], {});
  assert.equal(w.diff, "expert");
  assert.equal(w.current, true);
  assert.equal(w.exp, 1226315);
  assert.equal(w.override, null);
  assert.equal(readWeekly({ week: "2026-10-12" }, 615, WED).current, false);
  assert.equal(readWeekly(undefined, 615, WED).diff, "master");
  assert.equal(readWeekly(undefined, 615, WED).current, true, "no week saved counts as this week");
  const o = readWeekly({ diff: "nonsense", exp: 1e6 }, null, WED);
  assert.equal(o.diff, "master");
  assert.equal(o.exp, 1e6);
  assert.equal(o.override, 1e6);
  assert.equal(o.formula, null);
});

const SESSIONS = [
  { end: "2026-10-20T10:00:00Z", kills: [{ slug: "cobra-scout", name: "Cobra Scout", count: 120 }, { name: "Mystery", count: 7 }] },
  { end: "2026-10-18T10:00:00Z", kills: [{ slug: "cobra-scout", name: "Cobra Scout", count: 500 }] },
  { kills: [{ slug: "cobra-scout", count: 1 }] },
];

test("progress counts kills logged since the reset plus kills added by hand", () => {
  assert.equal(loggedSince(SESSIONS, "cobra-scout", weekStart(WED), catalog), 120);
  assert.equal(loggedSince(SESSIONS, "n:mystery", weekStart(WED), catalog), 7);
  const wk = readWeekly({ week: "2026-10-19", tasks: [{ name: "cobra scout", kills: 300, extra: 30 }, { name: "Mystery", kills: 5 }, { name: "  " }] }, 615, WED);
  const rows = weeklyRows(wk, SESSIONS, catalog, WED);
  assert.deepEqual(rows[0].creature, catalog.bySlug["cobra-scout"]);
  assert.deepEqual([rows[0].key, rows[0].name, rows[0].K, rows[0].logged, rows[0].extra, rows[0].done, rows[0].rem], ["cobra-scout", "Cobra Scout", 300, 120, 30, 150, 150]);
  assert.deepEqual([rows[1].key, rows[1].rem], ["n:mystery", 0]);
  assert.deepEqual([rows[2].key, rows[2].K, rows[2].rem], [null, null, null]);
  assert.deepEqual(openWeeklies(wk, rows), [{ key: "cobra-scout", name: "Cobra Scout", rem: 150, exp: 1226315 }]);
  // Last week's list: nothing logged counts and nothing is open.
  const old = readWeekly({ week: "2026-10-12", tasks: [{ name: "Cobra Scout", kills: 300 }] }, 615, WED);
  assert.equal(weeklyRows(old, SESSIONS, catalog, WED)[0].logged, 0);
  assert.deepEqual(openWeeklies(old, weeklyRows(old, SESSIONS, catalog, WED)), []);
});

test("weekly bonus per hour", () => {
  const open = [{ key: "cobra-scout", rem: 150, exp: 1e6 }, { key: "cobra-assassin", rem: 400, exp: 1e6 }];
  // 100 scouts/h for 1 h: 100 of 150 needed.
  assert.equal(weeklyBonus(open, { "cobra-scout": 100 }, 1, null, 0), 1e6 * 100 / 150);
  // Capped at the whole reward.
  assert.equal(weeklyBonus(open, { "cobra-scout": 100 }, 3, null, 0), 1e6 / 3);
  // The bounty creature's own task kills count even with no spot.
  assert.equal(weeklyBonus(open, null, 2, "cobra-assassin", 200), 1e6 * 0.5 / 2);
  assert.equal(weeklyBonus([], { "cobra-scout": 100 }, 1), 0);
  assert.equal(weeklyBonus(open, { "cobra-scout": 100 }, 0), 0);
});

test("weekly difficulties by level: exp per kill task, points, and the easiest paying the full exp", () => {
  assert.equal(weeklyDifficulties(null), null);
  const at = (L) => { const d = weeklyDifficulties(L); return [d.best, d.rows.map((r) => (r.locked ? "locked" : r.exp))]; };
  assert.deepEqual(at(20), ["beginner", [8600, "locked", "locked", "locked"]], "Adept needs level 30");
  assert.deepEqual(at(300), ["adept", [200000, 598202, 598202, "locked"]], "Beginner capped; Master needs level 400");
  assert.deepEqual(at(615), ["expert", [200000, 800000, 1226315, 1226315]], "Expert pays as much as Master below the 3kk cap");
  assert.deepEqual(at(1300), ["master", [200000, 800000, 3000000, 3372208]], "Expert capped from about level 1227");
  assert.deepEqual(weeklyDifficulties(615).rows.map((r) => r.points), [25, 50, 100, 110]);
  assert.deepEqual(weeklyDifficulties(615).rows.map((r) => r.capped), [true, true, false, false]);
});

test("the Any Creature weekly takes every kill at the spot", () => {
  assert.equal(allKph({ a: 100, b: 50, c: null }), 150);
  assert.equal(allKph(null), 0);
  const any = [{ key: ANY_CREATURE, rem: 3000, exp: 1e6 }];
  assert.equal(weeklyBonus(any, { "cobra-scout": 100, "cobra-assassin": 200 }, 2, null, 0), 1e6 * 600 / 3000 / 2);
  assert.equal(weeklyBonus(any, { "cobra-scout": 2000 }, 2, null, 0), 1e6 / 2, "capped at the reward");
  // No spot numbers: the bounty kills still count.
  assert.equal(weeklyBonus(any, null, 1, "cobra-assassin", 300), 1e6 * 300 / 3000);
});
