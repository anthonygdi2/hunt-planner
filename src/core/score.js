// Goal-weighted scores and S-D tiers. A score is a weighted average of each goal's metric divided by the best value of
// that metric in the list, so the weights' shares are each goal's share of the score.

export const GOAL_KEYS = ["xp", "profit", "charm", "bounty"];
// Weights are whole numbers from 0 to MAX_WEIGHT.
export const MAX_WEIGHT = 5;
const w4 = (xp, profit, charm, bounty) => Object.freeze({ xp, profit, charm, bounty });
// The goal mixer's presets (docs/design/INVENTORY.md, Goal mix), in order.
export const PRESETS = Object.freeze({
  exp: w4(5, 0, 0, 0), profit: w4(0, 5, 0, 0), mostly: w4(4, 2, 0, 0), balanced: w4(3, 3, 0, 0), charm: w4(0, 0, 5, 0), bounty: w4(0, 0, 0, 5),
});
export const PRESET_IDS = Object.keys(PRESETS);
// Tier cut-offs on a creature's score relative to the best one; below the last is D.
export const SCORE_CUTS = [["S", 0.9], ["A", 0.75], ["B", 0.6], ["C", 0.45]];

// Weights as whole numbers within 0..MAX_WEIGHT; anything missing, negative or not a number is 0.
export function readWeights(w) {
  const out = {};
  GOAL_KEYS.forEach((g) => { const v = Math.round(Number((w || {})[g])); out[g] = isFinite(v) && v > 0 ? Math.min(MAX_WEIGHT, v) : 0; });
  return out;
}
// The weights the scores use: with nothing weighted, the plan uses Exp.
export const scoringWeights = (w) => (GOAL_KEYS.some((g) => w[g] > 0) ? w : PRESETS.exp);
// The preset these (read) weights equal, or "custom".
export function presetOf(w) {
  const hit = PRESET_IDS.find((id) => GOAL_KEYS.every((k) => PRESETS[id][k] === w[k]));
  return hit || "custom";
}
// Each goal's share of the score (0..1); all 0 when no weight is set.
export function shares(w) {
  const sum = GOAL_KEYS.reduce((a, g) => a + w[g], 0), out = {};
  GOAL_KEYS.forEach((g) => { out[g] = sum ? w[g] / sum : 0; });
  return out;
}

// One metrics object's weighted value against the given maxima; null if a weighted metric is missing.
export function weightedValue(m, w, keys, max) {
  for (let i = 0; i < keys.length; i++) if (!m || m[keys[i]] == null) return null;
  let s = 0, ws = 0;
  keys.forEach((k) => { s += w[k] * (max[k] ? m[k] / max[k] : 0); ws += w[k]; });
  return s / ws;
}

// list: things with a slug. metricFor(x) → metrics. weights: read weights. Returns {scores: slug → score for those
// with every weighted metric, metrics: slug → metrics}. No weight set: no scores.
export function scoreList(list, metricFor, weights) {
  const w = weights, keys = GOAL_KEYS.filter((g) => w[g] > 0);
  const ms = {}, max = {}, out = {};
  list.forEach((it) => {
    const m = metricFor(it);
    ms[it.slug] = m;
    keys.forEach((k) => { if (m && m[k] != null) { const a = Math.abs(m[k]); if (!(max[k] >= a)) max[k] = a; } });
  });
  if (!keys.length) return { scores: out, metrics: ms };
  list.forEach((it) => {
    const m = ms[it.slug];
    if (!m || !keys.every((k) => m[k] != null)) return;
    let s = 0, ws = 0;
    keys.forEach((k) => { s += w[k] * (max[k] ? m[k] / max[k] : 0); ws += w[k]; });
    out[it.slug] = s / ws;
  });
  return { scores: out, metrics: ms };
}

// Scores relative to the best (rel, 0..1; all 0 when the best isn't positive) and their tiers.
export function tierScores(scores) {
  let best = -Infinity;
  Object.keys(scores).forEach((k) => { if (scores[k] > best) best = scores[k]; });
  const rel = {}, tier = {};
  Object.keys(scores).forEach((k) => {
    const r = best > 0 ? scores[k] / best : 0;
    let t = "D";
    for (let i = 0; i < SCORE_CUTS.length; i++) { if (r >= SCORE_CUTS[i][1]) { t = SCORE_CUTS[i][0]; break; } }
    rel[k] = r;
    tier[k] = t;
  });
  return { rel, tier };
}
