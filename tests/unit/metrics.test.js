import test from "node:test";
import assert from "node:assert/strict";
import { metrics, bestiaryOf } from "../../src/core/metrics.js";
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
