import test from "node:test";
import assert from "node:assert/strict";
import { sessHours, sessionSpot, xpField, raidRate, spotRates, deriveRates, huntLootBonus, huntKillMult } from "../../src/core/rates.js";
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
  assert.deepEqual(r.A, { kph: { "cobra-scout": 160 / 200 * 100, "cobra-assassin": 40 / 200 * 100 }, xph: 4000 / 200 * 100, pph: 600 / 200 * 100, lph: null, hours: 1, kills: 100, tasks: [] });
  // Loot/h from the sessions that logged loot: 900 loot over 100 kills, at 100 kills/h.
  sessions[1].loot = 900;
  assert.equal(spotRates(sessions, catalog, sessionSpot, "rawXp").A.lph, 900 / 100 * 100);
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

test("the loot a hunt's recorded bonuses added comes out of its loot and profit", () => {
  const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-6, a + " vs " + b);
  const exp = { "cobra-assassin": 1000, "cobra-scout": 500 };
  // 300 assassins × 1000 exp and 200 scouts × 500: three quarters and a quarter of the exp, and so of the loot.
  const kills = [{ slug: "cobra-assassin", count: 300 }, { slug: "cobra-scout", count: 200 }];
  const plain = S({ spot: "A", loot: 4e5, balance: 1e5, kills });
  assert.equal(huntLootBonus(plain, catalog, exp), 0, "no boosts recorded");
  assert.equal(huntLootBonus(Object.assign({}, plain, { boosts: { boosted: null, prey: [], talisman: 0 } }), catalog, exp), 0);
  assert.equal(huntLootBonus(Object.assign({}, plain, { loot: null, boosts: { boosted: "cobra-assassin" } }), catalog, exp), 0, "no loot logged");
  // The assassin boosted: loot × (0.75 × 2 + 0.25) = 1.75 × base.
  const boosted = Object.assign({}, plain, { boosts: { boosted: "cobra-assassin", prey: [], talisman: 0 } });
  near(huntLootBonus(boosted, catalog, exp), 4e5 * (1 - 1 / 1.75));
  // A loot Prey on the scout and the Talisman on the assassin's bounty: 0.75 × 1.1 + 0.25 × 1.4.
  const both = Object.assign({}, plain, { task: "cobra-assassin", boosts: { boosted: null, prey: [{ slug: "cobra-scout", pct: 40 }], talisman: 10 } });
  near(huntLootBonus(both, catalog, exp), 4e5 * (1 - 1 / (0.75 * 1.1 + 0.25 * 1.4)));
  // The Talisman counts only on a bounty hunt.
  near(huntLootBonus(Object.assign({}, both, { task: null }), catalog, exp), 4e5 * (1 - 1 / (0.75 + 0.25 * 1.4)));

  // Spot rates: loot and profit without the bonus; a bounty hunt with boosts doesn't count as including the Talisman.
  const extra = 4e5 * (1 - 1 / 1.75), r = spotRates([Object.assign({}, boosted, { task: "cobra-assassin" })], catalog, sessionSpot, "rawXp", exp).A;
  near(r.lph, 4e5 - extra);
  near(r.pph, 1e5 - extra);
  assert.deepEqual(r.tasks, []);
  assert.deepEqual(spotRates([Object.assign({}, plain, { task: "cobra-assassin" })], catalog, sessionSpot, "rawXp", exp).A.tasks, ["cobra-assassin"]);
  // Creature rates: the same profit, and taskBonus only for bounty hunts logged before boosts were recorded.
  const d = deriveRates([Object.assign({}, boosted, { task: "cobra-assassin" })], { catalog, xpMode: "raw", expTable: exp })["cobra-assassin"][0];
  assert.equal(d.pph, Math.round(1e5 - extra));
  assert.equal(d.taskBonus, false);
  assert.equal(deriveRates([Object.assign({}, plain, { task: "cobra-assassin" })], { catalog, expTable: exp })["cobra-assassin"][0].taskBonus, true);
});

test("damage bonuses on during a hunt are taken out of its rates", () => {
  const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-6 * Math.max(1, Math.abs(b)), (msg || "") + " " + a + " vs " + b);
  const exp = { "cobra-assassin": 1000, "cobra-scout": 1000 };
  const hunt = S({ spot: "Bastion", task: "cobra-assassin", rawXp: 4e6, balance: 2e5, loot: 4e5, kills: [{ slug: "cobra-assassin", count: 200 }, { slug: "cobra-scout", count: 200 }] });
  assert.equal(huntKillMult(hunt, catalog, exp), 1, "none recorded");
  assert.equal(huntKillMult(Object.assign({}, hunt, { boosts: { boosted: null, prey: [], talisman: 5 } }), catalog, exp), 1, "loot bonuses only");
  const tal = Object.assign({}, hunt, { boosts: { boosted: null, prey: [], talisman: 0, damage: 10 } }), km = 1 / (1 - 0.5 * 0.5 * 0.1 / 1.1);
  near(huntKillMult(tal, catalog, exp), km, "the Talisman on half the hunt's exp, half the time spent killing");
  assert.equal(huntKillMult(Object.assign({}, tal, { task: null }), catalog, exp), 1, "off the bounty the Talisman's damage is nothing");
  assert.equal(huntKillMult(tal, catalog, exp, 0), 1, "a respawn-limited spot");
  const prey = Object.assign({}, hunt, { task: null, boosts: { boosted: null, prey: [], talisman: 0, preyDamage: [{ slug: "cobra-scout", pct: 25 }] } });
  near(huntKillMult(prey, catalog, exp), 1 / (1 - 0.5 * 0.5 * 0.25 / 1.25), "a damage Prey");
  // With hit points: the assassin (9,000) is nine tenths of the killing, the scout (1,000) one tenth.
  near(huntKillMult(tal, catalog, exp, null, { "cobra-assassin": 9000, "cobra-scout": 1000 }), 1 / (1 - 0.5 * 0.9 * 0.1 / 1.1), "by hit-point share");
  near(spotRates([tal], catalog, sessionSpot, "rawXp", exp, null, { "cobra-assassin": 9000, "cobra-scout": 1000 }).Bastion.xph, 4e6 * (1 - 0.5 * 0.9 * 0.1 / 1.1));
  // The spot's rates: the same kills over km times the hours.
  const r = spotRates([tal], catalog, sessionSpot, "rawXp", exp).Bastion, plain = spotRates([hunt], catalog, sessionSpot, "rawXp", exp).Bastion;
  near(r.kph["cobra-assassin"], 200 / km);
  near(r.xph, plain.xph / km);
  near(r.pph, plain.pph / km);
  near(r.lph, plain.lph / km);
  near(spotRates([tal], catalog, sessionSpot, "rawXp", exp, () => 0).Bastion.xph, plain.xph, "respawn-limited: taken as it is");
  // The creature's rates, the same way.
  const d = deriveRates([tal], { catalog, xpMode: "raw", expTable: exp })["cobra-assassin"][0], d0 = deriveRates([hunt], { catalog, xpMode: "raw", expTable: exp })["cobra-assassin"][0];
  near(d.kph, Math.round(200 / km));
  near(d.xph, Math.round(d0.xph / km));
  assert.equal(d.taskBonus, false, "recorded bonuses are taken out, so the plan adds today's back");
});
