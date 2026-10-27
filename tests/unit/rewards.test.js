import test from "node:test";
import assert from "node:assert/strict";
import { kindMult, defaultKills, isChallengingMaster, challengingRate, rewardPerKill, learnChallenging, taskReward } from "../../src/core/rewards.js";

const hard = { slug: "cobra-assassin", cls: "H" };
const gorerilla = { slug: "gorerilla", cls: "C" };
const demon = { slug: "infernal-demon", cls: "C" };

test("multipliers and default task size", () => {
  assert.equal(kindMult("normal"), 1);
  assert.equal(kindMult("silver"), 2);
  assert.equal(kindMult("gold"), 4);
  assert.equal(kindMult(undefined), 1);
  assert.equal(kindMult("constructor"), 1);
  assert.equal(defaultKills("master"), 450);
  assert.equal(defaultKills("beginner"), 75);
});

test("reward per kill by difficulty (PROJECT_CONTEXT: Master 1,875, Expert 510, Adept 97.5, Beginner 15)", () => {
  assert.deepEqual(rewardPerKill("master", hard, {}), { perKill: 1875 });
  assert.deepEqual(rewardPerKill("expert", hard, {}), { perKill: 510 });
  assert.deepEqual(rewardPerKill("adept", hard), { perKill: 97.5 });
  assert.deepEqual(rewardPerKill("beginner", hard), { perKill: 15 });
  assert.deepEqual(rewardPerKill("all", hard), { perKill: 0 });
});

test("Challenging creatures on Master: own rate, else the average of those seen, else the rules' estimate", () => {
  assert.equal(isChallengingMaster("master", gorerilla), true);
  assert.equal(isChallengingMaster("expert", gorerilla), false);
  assert.equal(isChallengingMaster("master", hard), false);
  assert.equal(isChallengingMaster("master", null), false);
  assert.deepEqual(rewardPerKill("master", gorerilla, {}), { perKill: 2699, estimate: true });
  const rates = { gorerilla: [{ kills: 400, perKill: 2000 }, { kills: 600, perKill: 2100 }] };
  assert.equal(challengingRate(rates.gorerilla), (400 * 2000 + 600 * 2100) / 1000);
  assert.deepEqual(rewardPerKill("master", gorerilla, rates), { perKill: 2060, seen: true });
  assert.deepEqual(rewardPerKill("master", demon, rates), { perKill: 2060, estimate: true });
  assert.equal(challengingRate([]), null);
  assert.equal(challengingRate([{ kills: 0, perKill: 5 }]), null);
  assert.equal(challengingRate(undefined), null);
});

test("learning a Challenging rate from an offer", () => {
  const at = "2026-10-21T18:00:00.000Z";
  const one = learnChallenging({}, gorerilla, { kills: 400, exp: 1627800, kind: "gold", level: 615, at });
  assert.deepEqual(one, { gorerilla: [{ kills: 400, exp: 1627800, kind: "gold", perKill: 1017.38, level: 615, at }] });
  // The same offer again replaces the first; the input isn't changed.
  const two = learnChallenging(one, gorerilla, { kills: 400, exp: 1627800, kind: "gold", level: 616, at });
  assert.equal(two.gorerilla.length, 1);
  assert.equal(two.gorerilla[0].level, 616);
  assert.equal(one.gorerilla[0].level, 615);
  let many = {};
  for (let i = 1; i <= 10; i++) many = learnChallenging(many, gorerilla, { kills: 300 + i, exp: 600000, at });
  assert.equal(many.gorerilla.length, 8, "keeps the latest 8");
  assert.equal(many.gorerilla[0].kills, 303);
  assert.equal(many.gorerilla[7].kind, "normal");
  assert.equal(learnChallenging({}, null, { kills: 1, exp: 1 }), null);
  assert.equal(learnChallenging({}, gorerilla, { kills: 0, exp: 1 }), null);
});

test("a whole task's reward and points", () => {
  assert.deepEqual(taskReward({ diff: "master", creature: hard, kills: 400, kind: "silver" }), { kills: 400, reward: 1875 * 400 * 2, points: 54 });
  assert.deepEqual(taskReward({ diff: "expert", creature: hard }), { kills: 300, reward: 510 * 300, points: 16 });
  assert.deepEqual(taskReward({ diff: "master", creature: gorerilla, kills: "500", exp: 1500000 }), { kills: 500, reward: 1500000, points: 27 });
  assert.equal(taskReward({ diff: "master", creature: gorerilla, kills: 500 }).reward, 2699 * 500);
});
