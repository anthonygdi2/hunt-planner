// Bounty task rewards: exp per kill, a whole task's reward and bounty points, and learning Challenging creatures' rates.
import { TASK, KIND_MULT, REWARD_PER_KILL, CHALLENGING_MASTER_REWARD } from "../data/rules.js";

// Silver/Gold multiplier for an offer kind (normal when unknown).
export const kindMult = (kind) => (Object.prototype.hasOwnProperty.call(KIND_MULT, kind) ? KIND_MULT[kind] : 1);
// The task size to assume when an offer's kills aren't known: the middle of the difficulty's range.
export const defaultKills = (diff) => (TASK[diff].minKills + TASK[diff].maxKills) / 2;
// Challenging creatures on Master have their own reward rate.
export const isChallengingMaster = (diff, c) => diff === "master" && !!c && c.cls === "C";

// Adds a list of observations into the running kill and exp totals.
const addUp = (acc, obs) => { (obs || []).forEach((o) => { if (o.kills > 0 && o.perKill > 0) { acc.k += o.kills; acc.x += o.perKill * o.kills; } }); return acc; };
// The kill-weighted average reward per kill seen for one creature; null before any.
export function challengingRate(obs) {
  if (!Array.isArray(obs) || !obs.length) return null;
  const { k, x } = addUp({ k: 0, x: 0 }, obs);
  return k ? x / k : null;
}

// Exp per required kill before Silver or Gold: {perKill}, or for Challenging creatures on Master {perKill, seen: true}
// from that creature's logged offers, else {perKill, estimate: true} from the average over every Challenging creature
// logged (chalRates: slug → [{kills, perKill, ...}]), or rules' CHALLENGING_MASTER_REWARD before any.
export function rewardPerKill(diff, c, chalRates) {
  if (isChallengingMaster(diff, c)) {
    const own = challengingRate((chalRates || {})[c.slug]);
    if (own) return { perKill: own, seen: true };
    const all = chalRates || {}, acc = { k: 0, x: 0 };
    Object.keys(all).forEach((s) => addUp(acc, all[s]));
    return { perKill: acc.k ? acc.x / acc.k : CHALLENGING_MASTER_REWARD, estimate: true };
  }
  return { perKill: REWARD_PER_KILL[diff] || 0 };
}

// chalRates with one more offer seen on the Task board ({kills, exp shown in game, kind, level, at}): its rate per kill
// (exp ÷ Silver/Gold multiplier ÷ kills, two decimals) replaces any equal observation, and the creature keeps its
// latest 8. Null when the offer isn't usable (no creature, kills or exp).
export function learnChallenging(chalRates, c, offer) {
  const { kills, exp, kind } = offer;
  if (!c || !(kills > 0) || !(exp > 0)) return null;
  const perKill = exp / kindMult(kind) / kills, all = Object.assign({}, chalRates);
  const list = (all[c.slug] || []).filter((o) => !(o.kills === kills && Math.abs(o.perKill - perKill) < 0.01));
  list.push({ kills, exp, kind: kind || "normal", perKill: Math.round(perKill * 100) / 100, level: offer.level, at: offer.at });
  all[c.slug] = list.slice(-8);
  return all;
}

// One bounty task's whole reward: {kills, reward (exp, with Silver/Gold), points (with Silver/Gold)}. kills defaults to
// the middle of the range; exp is the reward shown in game, used as is for Challenging creatures on Master.
export function taskReward({ diff, creature, kills, kind, exp, chalRates }) {
  const t = TASK[diff], k = Number(kills) > 0 ? Number(kills) : defaultKills(diff), mult = kindMult(kind);
  const reward = isChallengingMaster(diff, creature) && exp > 0 ? Number(exp) : rewardPerKill(diff, creature, chalRates).perKill * k * mult;
  return { kills: k, reward, points: t.points * mult };
}
