import test from "node:test";
import assert from "node:assert/strict";
import { clampRatio, refBeats, pickReference, refTooHigh, profitStale, staleProfitText, calibrateAgainst, xpBoostOf, calibrate, refNums, referenceSpots, referenceUse } from "../../src/core/reference.js";
import { makeCatalog } from "../../src/core/catalog.js";

const catalog = makeCatalog([{ n: "Choking Fear", c: "H", m: 12 }, { n: "Retching Horror", c: "H", m: 12 }, { n: "Cobra Assassin", c: "H", m: 12 }]);
const EK = "Elite Knight";
const post = (date) => ({ who: "Kusnier", date, postRebalance: true });
const PRISON = { id: "prison-ek", spot: "Roshamuul Prison", aliases: ["Rosha Prison"], vocation: EK, levelMin: 400, rawXph: 6e6, profitph: 1e6,
  creatures: [{ slug: "choking-fear", kph: 600 }, { slug: "retching-horror", kph: 400 }, { slug: "ghost", kph: 50 }], source: post("2026-09-01") };
const LAIR = { id: "lair-any", spot: "Test Lair", vocation: "any", rawXph: 4e6, profitph: 2e5, creatures: [{ slug: "cobra-assassin", kph: 400 }], source: post("2026-09-02") };
const LAIR_OLD = { id: "lair-ek-old", spot: "Test Lair", vocation: EK, rawXph: 9e6, profitph: 9e5, creatures: [{ slug: "cobra-assassin", kph: 900 }], source: { date: "2026-10-01", postRebalance: false } };
const LAIR_RP = { id: "lair-rp", spot: "Test Lair", vocation: "Royal Paladin", rawXph: 5e6, profitph: 3e5, creatures: [{ slug: "cobra-assassin", kph: 500 }], source: post("2026-09-05") };
const BASTION_RP = { id: "bastion-rp", spot: "Cobra Bastion", vocation: "Royal Paladin", rawXph: 5e6, profitph: 3e5, creatures: [{ slug: "cobra-assassin", kph: 300 }], source: post("2026-09-05") };
const HIGH = { id: "high", spot: "High Place", vocation: EK, levelMin: 800, rawXph: 1e7, creatures: [], source: post("2026-09-01") };
const REF = [PRISON, LAIR, LAIR_OLD, LAIR_RP, BASTION_RP, HIGH, { spot: "Broken", vocation: EK, creatures: [] }];

test("helpers", () => {
  assert.equal(clampRatio(5), 1.5);
  assert.equal(clampRatio(0.01), 0.2);
  assert.equal(clampRatio(0.9), 0.9);
  assert.equal(refTooHigh(HIGH, 615), true);
  assert.equal(refTooHigh(HIGH, null), false, "no level: everything");
  assert.equal(profitStale(LAIR_OLD), true);
  assert.equal(profitStale(Object.assign({}, LAIR, { profitStale: true })), true);
  assert.equal(profitStale(LAIR), false);
  assert.equal(staleProfitText(LAIR_OLD), "Profit from 2026, may be out of date");
  assert.equal(staleProfitText({}), "Profit, may be out of date");
  // Post-rebalance beats a newer pre-rebalance entry; vocation match beats both.
  assert.equal(refBeats(LAIR, LAIR_OLD, "Royal Paladin"), true);
  assert.equal(refBeats(LAIR_OLD, LAIR, EK), true);
});

test("picking a character's entries", () => {
  const p = pickReference(REF, { vocation: EK, level: 615, enabled: true });
  assert.deepEqual(p.list.map((e) => e.id), ["prison-ek", "lair-ek-old"], "own vocation beats any; too high and broken entries are skipped");
  assert.deepEqual(Object.keys(p.other), ["Royal Paladin"]);
  assert.deepEqual(p.other["Royal Paladin"].list.map((e) => e.id), ["lair-rp", "bastion-rp"]);
  assert.deepEqual(pickReference(REF, { vocation: "Royal Paladin", level: 615, enabled: true }).list.map((e) => e.id), ["lair-rp", "bastion-rp"]);
  assert.deepEqual(pickReference(REF, { vocation: EK, enabled: false }), { by: {}, list: [], other: {} });
});

const SESSIONS = [
  // 1 clean hour at the prison: 720 fears + 480 horrors = 1.2 × the reference kills, 7.2kk raw = 1.2 × its exp.
  { spot: "Rosha Prison", hours: 1, rawXp: 7.2e6, xp: 10.8e6, balance: 1.5e6, kills: [{ slug: "choking-fear", count: 720 }, { slug: "retching-horror", count: 480 }] },
  { spot: "Roshamuul Prison", hours: 1, breaks: true, rawXp: 1, kills: [{ slug: "choking-fear", count: 1 }] },
];

test("calibration: log-space average with a prior worth one spot at 1.0", () => {
  const p = pickReference(REF, { vocation: EK, level: 615, enabled: true });
  const c = calibrateAgainst(SESSIONS, p.by, catalog);
  assert.equal(c.spots.length, 1);
  assert.ok(Math.abs(c.spots[0].kill - 1.2) < 1e-12);
  assert.ok(Math.abs(c.kill - Math.exp(Math.log(1.2) / 2)) < 1e-12);
  assert.ok(Math.abs(c.exp - Math.exp(Math.log(1.2) / 2)) < 1e-12);
  // Profit offset: 1.5kk − 1kk × K, shrunk by half.
  assert.ok(Math.abs(c.offset - (1.5e6 - 1e6 * c.kill) / 2) < 1e-6);
  assert.deepEqual([c.nKill, c.nExp, c.nProfit, c.hours], [1, 1, 1, 1]);
  assert.equal(calibrateAgainst([], p.by, catalog), null);
  assert.equal(xpBoostOf(SESSIONS), 1.5);
  assert.equal(xpBoostOf([]), 1);
  const all = calibrate(SESSIONS, p, catalog);
  assert.equal(all.calib.kill, c.kill);
  assert.deepEqual(all.calibOther, { "Royal Paladin": null });
  assert.equal(all.xpBoost, 1.5);
});

test("scaling a reference spot", () => {
  const c = { kill: 1.1, exp: 1.2, offset: 50000 };
  const n = refNums(PRISON, c, false, { xpMode: "raw", xpBoost: 1.5, catalog });
  assert.equal(n.src, "refAdj");
  assert.deepEqual(n.kph, { "choking-fear": 600 * 1.1, "retching-horror": 400 * 1.1 }, "creatures not in the catalog are left out");
  assert.equal(n.total, 1000 * 1.1);
  assert.equal(n.xph, 6e6 * 1.2);
  assert.equal(n.pph, 1e6 * 1.1 + 50000);
  assert.equal(refNums(PRISON, c, false, { xpMode: "xp", xpBoost: 1.5, catalog }).xph, 6e6 * 1.2 * 1.5);
  const raw = refNums(Object.assign({}, PRISON, { xph: 9e6 }), null, true, { xpMode: "xp", xpBoost: 1.5, catalog });
  assert.equal(raw.src, "other");
  assert.equal(raw.xph, 9e6, "uncalibrated XP mode uses the video's own boosted exp when it has one");
  const stale = refNums(LAIR_OLD, c, true, { xpMode: "raw", xpBoost: 1, catalog });
  assert.equal(stale.src, "otherAdj");
  assert.equal(stale.pph, 9e5 * 1.1, "dated profit scales with kills only");
  assert.equal(stale.profitStale, true);
});

test("reference spots the character hasn't logged, and which creatures use them", () => {
  const p = pickReference(REF, { vocation: EK, level: 615, enabled: true });
  const cal = calibrate(SESSIONS, p, catalog);
  const args = { picks: p, calib: cal.calib, calibOther: cal.calibOther, sessions: SESSIONS, loggedSpots: { "Rosha Prison": {} }, vocation: EK, otherOn: true, xpMode: "raw", xpBoost: 1, catalog };
  const spots = referenceSpots(args);
  // The prison is logged; the lair is the character's vocation; Cobra Bastion only exists for another vocation.
  assert.deepEqual(spots.map((a) => [a.e.id, a.tier, a.active, a.n.src]), [["lair-ek-old", "voc", true, "refAdj"], ["bastion-rp", "other", true, "other"]]);
  assert.deepEqual(referenceSpots(Object.assign({}, args, { otherOn: false })).map((a) => a.active), [true, false]);
  assert.deepEqual(referenceSpots(Object.assign({}, args, { loggedSpots: { "Rosha Prison": {}, "Cobra Bastion": {} } })).map((a) => a.e.id), ["lair-ek-old"]);

  const u = referenceUse(spots, {}, {});
  assert.deepEqual(Object.keys(u.use), ["cobra-assassin"]);
  assert.deepEqual(u.use["cobra-assassin"].map((x) => [x.spot, x.src, x.kph]), [["Test Lair", "refAdj", Math.round(900 * cal.calib.kill)]]);
  assert.deepEqual(u.shadow["cobra-assassin"].map((x) => [x.spot, x.unused]), [["Cobra Bastion", "voc"]]);
  // Own numbers win: everything is unused with reason "own".
  const own = referenceUse(spots, {}, { "cobra-assassin": { kph: 100 } });
  assert.deepEqual(own.use, {});
  assert.deepEqual(own.shadow["cobra-assassin"].map((x) => x.unused), ["own", "own"]);
  assert.deepEqual(referenceUse(spots, { "cobra-assassin": {} }, {}).shadow["cobra-assassin"].length, 2);
  // Another vocation's spot with that tier off is listed as "off".
  const off = referenceUse([spots[1]].map((a) => Object.assign({}, a, { active: false })), {}, {});
  assert.deepEqual(off.use, {});
  assert.deepEqual(off.shadow["cobra-assassin"].map((x) => x.unused), ["off"]);
});

test("solo by default: duo and team entries only when asked for", () => {
  const ref = [
    { spot: "A", vocation: "Elite Knight", team: "duo", rawXph: 9e6, creatures: [{ slug: "x", kph: 1 }], source: { date: "2026-09-01" } },
    { spot: "A", vocation: "Elite Knight", team: "solo", rawXph: 5e6, creatures: [{ slug: "x", kph: 1 }], source: { date: "2026-01-01" } },
    { spot: "B", vocation: "Elite Knight", team: "team", rawXph: 9e6, creatures: [{ slug: "x", kph: 1 }] },
    { spot: "C", vocation: "Elite Knight", rawXph: 1e6, creatures: [{ slug: "x", kph: 1 }] },
  ];
  const solo = pickReference(ref, { vocation: "Elite Knight", level: 500, enabled: true });
  assert.deepEqual(solo.list.map((e) => e.spot + " " + (e.team || "-")), ["A solo", "C -"], "the solo entry wins over a newer duo one; no team field counts as solo");
  const any = pickReference(ref, { vocation: "Elite Knight", level: 500, enabled: true, team: "any" });
  assert.deepEqual(any.list.map((e) => e.spot + " " + (e.team || "-")), ["A duo", "B team", "C -"]);
});
