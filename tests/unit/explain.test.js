import test from "node:test";
import assert from "node:assert/strict";
import { aVoc, offerLabel, offerLetter, noNumsWhy, pickWhy, oddsText, partsWhy, rerollWhy, seeSpotsWhy } from "../../src/core/explain.js";

const pct = (v) => Math.round(v * 100);

test("small pieces", () => {
  assert.equal(aVoc("Elite Knight"), "an Elite Knight");
  assert.equal(aVoc("Royal Paladin"), "a Royal Paladin");
  assert.equal(offerLabel({ name: "Rat", i: 1 }), "Rat (offer B)");
  assert.equal(offerLabel({ name: "Rat", i: -1 }), "Rat");
  assert.equal(offerLabel({ name: "Rat", i: 0, held: true }), "Rat", "the active bounty by its name");
  assert.equal(offerLetter({ i: 2 }), "C");
  assert.equal(oddsText({ n: 4, free: 1 }), "Free 1 of 4 times you checked around this hour");
  assert.equal(oddsText({ n: 0, freeAll: 0, nAll: 1 }), "Free 0 of 1 time you checked it");
});

test("why a spot has no numbers", () => {
  const ctx = { level: 300, vocation: "Elite Knight", refOn: true, otherOn: false };
  assert.match(noNumsWhy({ sessions: [{}], entries: [] }, ctx), /breaks/);
  assert.match(noNumsWhy({ sessions: [], entries: [{ vocation: "Elite Knight" }] }, Object.assign({}, ctx, { refOn: false })), /off for this character/);
  assert.equal(noNumsWhy({ sessions: [], entries: [{ levelMin: 500 }, { levelMin: 400 }] }, ctx), "Needs level 400.");
  assert.match(noNumsWhy({ sessions: [], entries: [{ vocation: "Royal Paladin" }] }, ctx), /^Only other vocations/);
  assert.equal(noNumsWhy({ sessions: [], entries: [{ vocation: "any" }] }, ctx), "No usable numbers for this character yet.");
});

test("the parts of a spot's score", () => {
  const o = { v: 0.92, m: { xp: 4.84e6, profit: 2e5 }, parts: { hunt: 4.1e6, today: 0, held: 5.4e5, weekly: 2e5 }, offer: { name: "Cobra Assassin" },
    weekly: [{ name: "Silencer" }], today: [], held: { hoursLeft: 1.5 }, hours: null };
  assert.equal(partsWhy(o, { sc: { keys: ["xp", "profit"] }, pct }),
    "Scores 92: 4.84kk exp/h (4.1kk hunting, 540k from the bounty, 200k from weekly tasks), 200k profit/h. Bounty done in about 1 h 30 min here.");
});

test("picking, rerolling and the end of the chain", () => {
  assert.equal(pickWhy({ name: "Rat", i: 0 }), "Pick Rat (offer A) once the spot is free: the other offers disappear.");
  const active = { key: "held", name: "Rat", kills: 100, done: 40, held: true, i: -1 };
  const ctx = { chosen: [{ held: true, offer: active, name: "Sewers" }], worth: {}, options: [{}], offers: [active], tokens: 2, pct, active };
  assert.equal(rerollWhy({ name: "Cave", v: 0.4, thr: 0.5 }, [], ctx), "The next spot, Cave (40), is worth less than a reroll (50). Rerolling drops Rat.");
  assert.equal(rerollWhy(null, [], Object.assign({}, ctx, { options: [], offers: [], active: null })), "None of your spots has numbers for this character yet.");
  // The Preferred and Unwanted lists, when any of their creatures is in the pool.
  const listed = Object.assign({}, ctx, { active: null, sc: { model: { lists: { preferred: 2, unwanted: 1 } } } });
  assert.equal(rerollWhy({ name: "Cave", v: 0.4, thr: 0.5 }, [], listed), "The next spot, Cave (40), is worth less than a reroll (50). Counts your lists: 2 Preferred, 1 Unwanted in this pool.");
  assert.doesNotMatch(rerollWhy({ name: "Cave", v: 0.4, thr: 0.5 }, [], Object.assign({}, listed, { sc: { model: { lists: { preferred: 0, unwanted: 0 } } } })), /lists/);
  assert.match(seeSpotsWhy({ unknown: true }), /Set your reroll tokens/);
  assert.match(seeSpotsWhy({ tokens: 0 }), /No reroll tokens left/);
  assert.equal(seeSpotsWhy({ tokens: 3, model: true }), "");
});
