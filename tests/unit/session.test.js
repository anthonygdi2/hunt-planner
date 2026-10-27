import test from "node:test";
import assert from "node:assert/strict";
import { parseSession, sessionProblems } from "../../src/core/session.js";
import { makeCatalog } from "../../src/core/catalog.js";

const catalog = makeCatalog([
  { n: "Choking Fear", c: "H", m: 12 }, { n: "Retching Horror", c: "H", m: 12 }, { n: "Silencer", c: "H", m: 12 },
]);

const EXPORT = `Session data: From 2026-09-26, 21:06:10 to 2026-09-26, 21:21:46
Session: 00:15h
Raw XP Gain: 1,321,740
XP Gain: 1,982,610
Loot: 323,387
Supplies: 48,278
Balance: 275,109
Killed Monsters:
  125x choking fear
  113x retching horror
  52x silencer
  3x unknown thing
Looted Items:
  54x a great mana potion
  Balance: 1`;

test("reads a full analyser export", () => {
  const s = parseSession(EXPORT, catalog);
  assert.equal(s.start, "2026-09-26T21:06:10");
  assert.equal(s.end, "2026-09-26T21:21:46");
  assert.equal(s.minutes, 15);
  assert.ok(Math.abs(s.hours - 936 / 3600) < 1e-12, "hours from the Session data line, not the rounded Session line");
  assert.equal(s.rawXp, 1321740);
  assert.equal(s.xp, 1982610);
  assert.equal(s.loot, 323387);
  assert.equal(s.supplies, 48278);
  assert.equal(s.balance, 275109, "lines under Looted Items are ignored");
  assert.deepEqual(s.kills, [
    { count: 125, name: "Choking Fear", slug: "choking-fear" },
    { count: 113, name: "Retching Horror", slug: "retching-horror" },
    { count: 52, name: "Silencer", slug: "silencer" },
    { count: 3, name: "unknown thing" },
  ]);
  assert.equal("section" in s, false);
  assert.equal(sessionProblems(s), "");
});

test("falls back to the Session line and works out the balance", () => {
  const s = parseSession("Session: 01:30h\r\nXP Gain: 100\r\nLoot: 500\r\nSupplies: 200\r\nKilled Monsters\r\n10x Silencer", catalog);
  assert.equal(s.hours, 1.5);
  assert.equal(s.balance, 300);
  assert.equal(s.rawXp, undefined);
  assert.equal(sessionProblems(s), "");
});

test("says what's missing", () => {
  assert.match(sessionProblems(null), /^Paste/);
  assert.match(sessionProblems(parseSession("", catalog)), /session length/);
  assert.match(sessionProblems(parseSession("Session: 00:15h", catalog)), /killed monsters/);
  assert.match(sessionProblems(parseSession("Session: 00:15h\nKilled Monsters:\n5x Silencer", catalog)), /XP lines/);
  assert.equal(parseSession(undefined, catalog).hours, null);
});
