import test from "node:test";
import assert from "node:assert/strict";
import { sessHours, sessionSpot, xpField, raidRate, spotRates, deriveRates } from "../../src/core/rates.js";
import { makeCatalog } from "../../src/core/catalog.js";

const catalog = makeCatalog([{ n: "Cobra Assassin", c: "H", m: 12 }, { n: "Cobra Scout", c: "M", m: 6 }, { n: "Cobra Vizier", c: "H", m: 12, r: 1 }]);
const S = (o) => Object.assign({ hours: 1, rawXp: 0, balance: 0, kills: [] }, o);

test("small helpers", () => {
  assert.equal(sessHours({ hours: 2 }), 2);
  assert.equal(sessHours({ hours: -1 }), 0);
  assert.equal(sessHours(null), 0);
  assert.equal(sessionSpot({ spot: " Cobra Bastion " }), "Cobra Bastion");
  assert.equal(sessionSpot({}), "Unnamed spot");
  assert.equal(xpField("xp"), "xp");
  assert.equal(xpField(undefined), "rawXp");
});

test("raid rate: the prior alone, then blended with logged raids (rare kills don't count)", () => {
  assert.deepEqual(raidRate([S({ kills: [{ slug: "cobra-scout", count: 100 }] })], catalog), { p: 0.001, info: null });
  const r = raidRate([
    S({ raidsBy: { "cobra-scout": 2, x: "1" }, kills: [{ slug: "cobra-scout", count: 900 }, { slug: "cobra-vizier", count: 50 }, { name: "?", count: 100 }] }),
    S({ raids: 1, kills: [{ slug: "cobra-assassin", count: 1000 }] }),
  ], catalog);
  assert.deepEqual(r.info, { raids: 4, kills: 2000, n: 2 });
  assert.equal(r.p, (4 + 5) / (2000 + 5000));
});

test("spot rates: kills/h from clean time, exp and profit per kill from every session", () => {
  const sessions = [
    S({ spot: "A", hours: 1, rawXp: 1000, balance: 100, kills: [{ slug: "cobra-scout", count: 60 }, { slug: "cobra-assassin", count: 40 }] }),
    S({ spot: "A", hours: 2, rawXp: 3000, balance: 500, breaks: true, kills: [{ slug: "cobra-scout", count: 100 }] }),
    S({ spot: "B", hours: 1, breaks: true, kills: [{ slug: "cobra-scout", count: 10 }] }),
    S({ spot: "C", hours: 0, kills: [{ slug: "cobra-scout", count: 10 }] }),
  ];
  const r = spotRates(sessions, catalog, sessionSpot, "rawXp");
  assert.deepEqual(Object.keys(r), ["A"], "B has no clean time, C no length");
  // Clean: 100 kills in 1 h. All: 200 kills, 4000 exp, 600 balance.
  assert.deepEqual(r.A, { kph: { "cobra-scout": 160 / 200 * 100, "cobra-assassin": 40 / 200 * 100 }, xph: 4000 / 200 * 100, pph: 600 / 200 * 100, hours: 1, kills: 100 });
  assert.deepEqual(Object.keys(spotRates(sessions, catalog, () => "all", "rawXp")), ["all"]);
});

test("derived creature rates per spot", () => {
  const sessions = [
    S({ spot: "A", hours: 1, rawXp: 1000, xp: 1500, balance: 100, end: "2026-10-01T10:00:00", kills: [{ slug: "cobra-scout", count: 60 }, { slug: "cobra-assassin", count: 40 }, { name: "Unknown", count: 5 }] }),
    S({ spot: "A", hours: 1, rawXp: 1000, balance: 100, end: "2026-10-02T10:00:00", task: "cobra-assassin", kills: [{ slug: "cobra-assassin", count: 80 }, { slug: "cobra-scout", count: 20 }] }),
    S({ spot: "B", hours: 1, breaks: true, kills: [{ slug: "cobra-scout", count: 10 }] }),
  ];
  const r = deriveRates(sessions, { catalog, xpMode: "raw" });
  assert.deepEqual(Object.keys(r), ["cobra-scout", "cobra-assassin"]);
  const scout = r["cobra-scout"];
  assert.equal(scout.length, 1, "B has no clean time");
  // 80 of 205 kills over two clean hours with 205 kills: 102.5 kills/h × 80/205.
  assert.equal(scout[0].kph, Math.round(80 / 205 * 102.5));
  assert.equal(scout[0].taskBonus, false);
  assert.equal(scout[0].last, "2026-10-02T10:00:00");
  assert.equal(scout[0].sample, 80);
  // Cobra assassin was the task in the second session, so only that one counts at A.
  const ca = r["cobra-assassin"][0];
  assert.equal(ca.taskBonus, true);
  assert.equal(ca.kph, 80);
  assert.equal(ca.xph, 1000, "1,000 exp over 100 kills, at 100 kills/h");
  assert.equal(ca.n, 1);
  // xpMode "xp" uses the boosted exp where a session has it.
  assert.equal(deriveRates(sessions, { catalog, xpMode: "xp" })["cobra-scout"][0].xph, Math.round((1500 + 1000) / 205 * 102.5));
  assert.deepEqual(deriveRates([], { catalog }), {});
});
