import test from "node:test";
import assert from "node:assert/strict";
import { metrics, bestiaryOf, expShares, lootMult } from "../../src/core/metrics.js";
import { makeCatalog } from "../../src/core/catalog.js";

const catalog = makeCatalog([
  { n: "Cobra Assassin", c: "H", m: 12 }, { n: "Cobra Scout", c: "M", m: 6 }, { n: "Cobra Vizier", c: "H", m: 12, r: 1 },
  { n: "Gorerilla", c: "C", m: 8 },
]);
const cobra = catalog.bySlug["cobra-assassin"];
const base = { diff: "master", chalRates: {}, raidP: 0, catalog, entries: {}, spotKph: {} };

test("bestiary by class (PROJECT_CONTEXT: Hard 2,500 kills / 50 charm points, Warden 15)", () => {
  assert.deepEqual(bestiaryOf(cobra), { kills: 2500, charmPoints: 50, warden: 15 });
  assert.deepEqual(bestiaryOf({ cls: "?" }), { kills: 2500, charmPoints: 50, warden: 15 });
  assert.deepEqual(bestiaryOf(catalog.bySlug.gorerilla), { kills: 5000, charmPoints: 100, warden: 30 });
});

test("a Hard creature on Master at 450 kills/h: one hour per default task", () => {
  const m = metrics(cobra, { kph: 450, xph: 3e6, pph: 200000 }, base);
  assert.equal(m.hours, 1);
  assert.equal(m.rewardXph, 1875 * 450);
  assert.equal(m.weeklyXph, 0);
  assert.equal(m.xp, 3e6 + 1875 * 450);
  assert.equal(m.profit, 200000);
  assert.equal(m.bestiaryCharm, 450 * (50 / 2500));
  assert.equal(m.wardenCharm, 0, "no raids without a raid chance");
  assert.equal(m.otherCharm, 0);
  assert.equal(m.charm, 9);
  assert.equal(m.bounty, 27);
});

test("given kills, Silver/Gold and the reward shown in game", () => {
  const m = metrics(cobra, { kph: 300, xph: 1e6 }, Object.assign({}, base, { kills: 600, mult: 4 }));
  assert.equal(m.hours, 2);
  assert.equal(m.rewardXph, 1875 * 600 * 4 / 2);
  assert.equal(m.bounty, 27 * 4 / 2);
  const g = metrics(catalog.bySlug.gorerilla, { kph: 300 }, Object.assign({}, base, { kills: 600, rewardExp: 1.5e6 }));
  assert.equal(g.rewardXph, 750000);
  assert.equal(g.xp, null, "no exp/h without the hunt's exp");
  assert.equal(g.profit, null);
});

test("charm: Talisman bonus, Echo Wardens and what else dies at the spot", () => {
  const ctx = Object.assign({}, base, {
    bestiaryBonus: "50", raidP: 0.001,
    spotKph: { "Cobra Bastion": { "cobra-assassin": 400, "cobra-scout": 200, "cobra-vizier": 50, "no-such": 10 } },
    entries: { "cobra-scout": { bestiaryDone: true } },
  });
  const m = metrics(cobra, { kph: 400, spot: "Cobra Bastion" }, ctx);
  assert.equal(m.bestiaryCharm, 400 * (50 / 2500) * 1.5);
  assert.equal(m.wardenCharm, 400 * 0.001 * 0.1 * 15);
  // Cobra Scout: bestiary done, so no bestiary charm but the Warden share goes up to 20%. Cobra Vizier is rare: no raids.
  assert.equal(m.otherCharm, 200 * 0.001 * 0.2 * 10 + 50 * 50 / 2500);
  assert.equal(m.charm, m.bestiaryCharm + m.wardenCharm + m.otherCharm);
  const done = metrics(cobra, { kph: 400, spot: "Cobra Bastion", bestiaryDone: true, wardenDone: true }, ctx);
  assert.equal(done.bestiaryCharm, 0);
  assert.equal(done.wardenCharm, 0);
});

test("missing numbers", () => {
  const m = metrics(cobra, null, base);
  assert.equal(m.hours, null);
  assert.equal(m.rewardXph, null);
  assert.equal(m.xp, null);
  assert.equal(m.charm, null);
  assert.equal(m.bounty, null);
  assert.equal(metrics(cobra, { bestiaryDone: true, wardenDone: true }, base).charm, 0, "nothing left to earn is zero, not unknown");
});

test("the weekly share comes from the callback", () => {
  const seen = [];
  const m = metrics(cobra, { kph: 450, xph: 1e6, spot: "X" }, Object.assign({}, base, { weeklyXph: (...a) => { seen.push(a); return 5000; } }));
  assert.deepEqual(seen, [["X", 1, "cobra-assassin", 450]]);
  assert.equal(m.weeklyXph, 5000);
  assert.equal(m.xp, 1e6 + 1875 * 450 + 5000);
});

test("each creature's share of a spot's exp, by base exp or else by kills", () => {
  assert.deepEqual(expShares({ a: 300, b: 200 }, { a: 1000, b: 500 }), { a: 0.75, b: 0.25 });
  assert.deepEqual(expShares({ a: 300, b: 100 }, { a: 1000 }), { a: 0.75, b: 0.25 }, "b's exp unknown: kill shares");
  assert.deepEqual(expShares({}, {}), {});
  assert.deepEqual(expShares(null, null), {});
});

test("the Bounty Talisman's more loot raises the profit, unless the hunts were on the bounty", () => {
  const ctx = Object.assign({}, base, { talismanLoot: 10, expTable: { "cobra-assassin": 1000, "cobra-scout": 500 },
    spotKph: { "Cobra Bastion": { "cobra-assassin": 300, "cobra-scout": 200 } }, spotEco: { "Cobra Bastion": { lph: 4e5 } } });
  const rec = { kph: 300, xph: 2e6, pph: 1e5, spot: "Cobra Bastion" };
  const m = metrics(cobra, rec, ctx);
  assert.ok(Math.abs(m.talismanLoot - 4e5 * 0.75 * 0.1) < 1e-6);
  assert.ok(Math.abs(m.profit - 1.3e5) < 1e-6);
  assert.equal(metrics(cobra, Object.assign({ taskBonus: true }, rec), ctx).profit, 1e5, "logged on its bounty: already in");
  assert.equal(metrics(cobra, rec, Object.assign({}, ctx, { talismanLoot: 0 })).profit, 1e5, "no Talisman");
  assert.equal(metrics(cobra, rec, Object.assign({}, ctx, { spotEco: { "Cobra Bastion": { lph: null } } })).profit, 1e5, "loot/h unknown");
  assert.equal(metrics(cobra, Object.assign({}, rec, { pph: null }), ctx).profit, null);
});

test("what loot bonuses multiply a spot's loot by", () => {
  const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-12, a + " vs " + b);
  const shares = { a: 0.75, b: 0.25 };
  assert.equal(lootMult({}, "a", { a: 50 }), 1);
  assert.equal(lootMult(shares, null, {}), 1);
  // The boosted creature's loot doubles (TibiaWiki); chances add, and multiply the doubled set.
  near(lootMult(shares, "a", {}), 0.75 * 2 + 0.25);
  near(lootMult(shares, null, { b: 40 }), 0.75 + 0.25 * 1.4);
  near(lootMult(shares, "a", { a: 25 + 10, b: 40 }), 0.75 * 2 * 1.35 + 0.25 * 1.4);
});
