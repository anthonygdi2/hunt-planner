import test from "node:test";
import assert from "node:assert/strict";
import { spotIndex, spotNumbers, lensCheck, LEVEL_BAND } from "../../src/core/spots.js";
import { pickReference } from "../../src/core/reference.js";
import { makeCatalog } from "../../src/core/catalog.js";

const catalog = makeCatalog([{ n: "Cobra Assassin", c: "H", m: 12 }, { n: "Cobra Scout", c: "M", m: 6 }]);
const EK = "Elite Knight";
const REF = [
  { id: "bastion-ek", spot: "Cobra Bastion", aliases: ["Bastion"], vocation: EK, levelMin: 250, levelMax: 600, team: "solo", rawXph: 3e6, profitph: 1e5,
    creatures: [{ slug: "cobra-assassin", kph: 400 }, { slug: "cobra-scout", kph: 100 }], source: { date: "2026-09-01", postRebalance: true } },
  { id: "bastion-rp", spot: "Cobra Bastion", vocation: "Royal Paladin", levelMin: 300, rawXph: 3.5e6, creatures: [{ slug: "cobra-assassin", kph: 450 }], source: { date: "2026-09-02", postRebalance: true } },
  { id: "deep-rp", spot: "Deep Place", vocation: "Royal Paladin", levelMin: 900, rawXph: 9e6, team: "duo", creatures: [{ slug: "cobra-scout", kph: 500 }], source: { date: "2026-09-02", postRebalance: true } },
];
const SESSIONS = [
  { spot: "bastion", hours: 1, rawXp: 2e6, balance: 5e4, kills: [{ slug: "cobra-assassin", count: 300 }] },
  { spot: "My Cave ", hours: 1, rawXp: 1e6, kills: [{ slug: "cobra-scout", count: 200 }, { name: "Rat", count: 5 }] },
  { spot: "my cave", hours: 1, breaks: true, kills: [] },
  { spot: "My Cave", hours: 1, kills: [] },
];

test("the spot index: reference spots and logged ones", () => {
  const idx = spotIndex({ reference: REF, sessions: SESSIONS, catalog, spotMeta: { "deep-place": { travelMin: 12 } } });
  assert.deepEqual(idx.list.map((s) => s.id), ["cobra-bastion", "deep-place", "my-cave"]);
  const b = idx.spots["cobra-bastion"];
  assert.deepEqual([b.vocations, b.teams, b.levelMin, b.levelMax, b.own, b.sessions.length], [[EK, "Royal Paladin"], ["solo"], 250, null, false, 1], "an entry with no level cap opens the top");
  assert.deepEqual(Object.keys(b.creatures), ["cobra-assassin", "cobra-scout"]);
  assert.deepEqual(idx.spots["deep-place"].meta, { travelMin: 12 });
  const own = idx.spots["my-cave"];
  assert.equal(own.own, true);
  assert.equal(own.name, "My Cave", "named after the name logged most");
  assert.deepEqual(Object.keys(own.creatures), ["cobra-scout"]);
  assert.equal(idx.idOf(" BASTION "), "cobra-bastion");
  assert.equal(idx.idOf("nowhere"), null);
});

test("a spot's numbers: own sessions first, else the reference", () => {
  const idx = spotIndex({ reference: REF, sessions: SESSIONS, catalog });
  const picks = pickReference(REF, { vocation: EK, level: 500, enabled: true });
  const ctx = { catalog, xpMode: "raw", refOn: true, otherOn: true, picks, calib: null, calibOther: {}, vocation: EK, xpBoost: 1 };
  const own = spotNumbers(idx.spots["cobra-bastion"], ctx);
  assert.deepEqual([own.src, own.kph, own.xph, own.hours, own.kills, own.entry], ["own", { "cobra-assassin": 300 }, 2e6, 1, 300, null]);
  const ref = spotNumbers(Object.assign({}, idx.spots["cobra-bastion"], { sessions: [] }), ctx);
  assert.deepEqual([ref.src, ref.kph["cobra-assassin"], ref.entry.id], ["ref", 400, "bastion-ek"]);
  // Deep Place is only a Royal Paladin duo spot: solo by default, so no numbers unless duo and team hunts are asked for.
  assert.equal(spotNumbers(idx.spots["deep-place"], Object.assign({}, ctx, { picks: pickReference(REF, { vocation: EK, level: 950, enabled: true }) })), null);
  // Asked for, and above level: the other-vocation tier, while it's on.
  const picksHigh = pickReference(REF, { vocation: EK, level: 950, enabled: true, team: "any" });
  const deep = spotNumbers(idx.spots["deep-place"], Object.assign({}, ctx, { picks: picksHigh }));
  assert.deepEqual([deep.src, deep.entry.id], ["other", "deep-rp"]);
  assert.equal(spotNumbers(idx.spots["deep-place"], Object.assign({}, ctx, { picks: picksHigh, otherOn: false })), null);
  assert.equal(spotNumbers(idx.spots["deep-place"], Object.assign({}, ctx, { refOn: false })), null);
});

test("the lens", () => {
  const idx = spotIndex({ reference: REF, sessions: [], catalog });
  const ctx = { level: 500, vocation: EK, otherOn: false };
  assert.deepEqual(LEVEL_BAND, [-100, 150]);
  assert.equal(lensCheck(idx.spots["cobra-bastion"], null, ctx), "");
  assert.equal(lensCheck(idx.spots["deep-place"], null, ctx), "voc");
  assert.equal(lensCheck(idx.spots["deep-place"], { allVocations: true }, ctx), "level", "level 900+ is above 500 + 150");
  assert.equal(lensCheck(idx.spots["deep-place"], { allVocations: true, anyLevel: true }, ctx), "");
  assert.equal(lensCheck(idx.spots["deep-place"], null, Object.assign({}, ctx, { otherOn: true, level: 800 })), "");
  assert.equal(lensCheck(idx.spots["cobra-bastion"], null, Object.assign({}, ctx, { level: 750 })), "level", "the EK entry stops at 600");
  assert.equal(lensCheck(idx.spots["cobra-bastion"], null, Object.assign({}, ctx, { level: 750, otherOn: true })), "", "the RP entry has no cap");
  assert.equal(lensCheck(idx.spots["cobra-bastion"], null, Object.assign({}, ctx, { level: 120 })), "", "250 is within 120 + 150");
  assert.equal(lensCheck(idx.spots["cobra-bastion"], null, Object.assign({}, ctx, { level: 80 })), "level");
  assert.equal(lensCheck({ sessions: [{}], entries: [] }, null, ctx), "", "logged spots are always in");
});

test("the character's own spots and variations join the index; sessions with a spotId belong to them", () => {
  const sessions = [
    { spot: "Bastion lure", spotId: "my-bastion-lure", hours: 1, kills: [{ slug: "cobra-assassin", count: 300 }] },
    { spot: "Cobra Bastion", hours: 1, kills: [{ slug: "cobra-scout", count: 50 }] },
    { spot: "My Cave", spotId: "gone", hours: 1, kills: [] },
  ];
  const idx = spotIndex({ reference: REF, sessions, catalog, userSpots: { "my-bastion-lure": { name: "Bastion lure", parentId: "cobra-bastion", note: "2 boxes" }, "my-empty": { name: "Empty" } } });
  const v = idx.spots["my-bastion-lure"];
  assert.deepEqual([v.name, v.userMade, v.own, v.parentId, v.note, v.sessions.length, Object.keys(v.creatures)], ["Bastion lure", true, true, "cobra-bastion", "2 boxes", 1, ["cobra-assassin"]]);
  assert.equal(idx.spots["cobra-bastion"].sessions.length, 1, "the variation's session isn't the parent's");
  assert.equal(idx.spots["my-empty"].sessions.length, 0);
  assert.equal(idx.spots["my-cave"].sessions.length, 1, "a spotId that no longer exists falls back to the name");
  assert.equal(idx.idOf("bastion lure"), "my-bastion-lure");
});
