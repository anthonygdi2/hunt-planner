// The reroll model: what a fresh Task board is worth with s tokens left, and whether to take an offer or reroll.
// Values are goal scores per hour (score.js weightedValue against the pool's best metrics); a task's value is earned
// over its hours, and future hours are discounted by RHO per hour.
import { TASK, TOKEN_CAP, SLOTS, KIND_MULT } from "../data/rules.js";
import { GOAL_KEYS, weightedValue } from "./score.js";

// Discount rate per hour of hunting: how much less a task finished later is worth.
export const RHO = 1 / 40;
// Silver/Gold odds are only used once this many boards have been logged for a difficulty.
export const MIN_BOARD_OBS = 10;
const MULTS = [KIND_MULT.normal, KIND_MULT.silver, KIND_MULT.gold];

// The stored reroll settings ({left, hpd, unknown}) read: tokens left (0..TOKEN_CAP), hours played per day (default 3),
// how to value creatures with no numbers ("poor" 0, "below" the 25th percentile, "average" the median), and whether
// tokens were ever set.
export function readReroll(r) {
  r = r || {};
  const left = Math.max(0, Math.min(TOKEN_CAP, parseInt(r.left, 10) || 0));
  const hpd = Number(r.hpd) > 0 ? Number(r.hpd) : 3;
  return { left, hpd, unknown: r.unknown === "below" || r.unknown === "average" ? r.unknown : "poor", hasLeft: r.left != null };
}

// Three kill counts standing in for an offer's unknown size: the middle of each third of the range.
export function killLevels(diff) { const t = TASK[diff], d = t.maxKills - t.minKills; return [t.minKills + d / 6, t.minKills + d / 2, t.minKills + 5 * d / 6]; }

// The distribution of offers on a board for this difficulty.
// ctx: weights (read weights); pool [{it (creature with a slug), e (its numbers), blocked (avoided or above level)}];
// preferred, unwanted (slugs); metricsFor(it, e, kills?, mult?) → metrics at this difficulty; unknown (readReroll's);
// rewardObs [{kind}] (logged boards). Returns null with no goal; else {keys, w, max, rows [{it, e, m, w, blocked?,
// v1?}], known (creatures with a value), diff} and, when any is known, best, medKph, fallback, nObs, kinds
// [normal, silver, gold odds], levels and pts [{p, v, T}] (probability, value, task hours).
// scale: each goal key's best metric to score against instead of this pool's own (commonMax), so pools compare.
export function poolModel(diff, { weights: w, pool, preferred, unwanted, metricsFor, unknown, rewardObs, scale }) {
  const keys = GOAL_KEYS.filter((g) => w[g] > 0);
  if (!keys.length) return null;
  const unw = {}, pref = {}, blocked = [];
  unwanted.forEach((x) => { unw[x] = 1; });
  preferred.forEach((x) => { pref[x] = 1; });
  const rows = [], max = {};
  pool.forEach((p) => {
    if (unw[p.it.slug]) return;
    const e = p.e, m = metricsFor(p.it, e);
    keys.forEach((k) => { if (m[k] != null) { const a = Math.abs(m[k]); if (!(max[k] >= a)) max[k] = a; } });
    rows.push({ it: p.it, e, m, w: pref[p.it.slug] ? SLOTS.preferredWeight : 1 });
    blocked.push(!!p.blocked);
  });
  const own = Object.assign({}, max);
  if (scale) keys.forEach((k) => { if (scale[k] > 0) max[k] = scale[k]; });
  const known = [], kphs = [];
  rows.forEach((r, i) => {
    if (r.e.kph > 0) kphs.push(r.e.kph);
    if (blocked[i]) { r.blocked = true; return; }
    r.v1 = weightedValue(r.m, w, keys, max);
    if (r.v1 != null) known.push(r.v1);
  });
  // How many of the player's Preferred and Unwanted creatures are in this pool (they're what the odds above use).
  const lists = { preferred: rows.filter((r) => r.w > 1).length, unwanted: pool.filter((p) => unw[p.it.slug]).length };
  const model = { keys, w, max, own, rows, known: known.length, diff, lists };
  if (!known.length) return model;
  known.sort((a, b) => a - b);
  kphs.sort((a, b) => a - b);
  model.best = known[known.length - 1];
  model.medKph = kphs.length ? kphs[Math.floor(kphs.length / 2)] : null;
  model.fallback = unknown === "poor" ? 0 : known[Math.round((unknown === "average" ? 0.5 : 0.25) * (known.length - 1))];
  const obs = rewardObs || [];
  let ns = 0, ng = 0;
  obs.forEach((o) => { if (o.kind === "silver") ns++; else if (o.kind === "gold") ng++; });
  model.nObs = obs.length;
  model.kinds = obs.length >= MIN_BOARD_OBS ? [1 - (ns + ng) / obs.length, ns / obs.length, ng / obs.length] : [1, 0, 0];
  model.levels = killLevels(diff);
  let W = 0, unkW = 0;
  const pts = [];
  rows.forEach((r) => { W += r.w; });
  rows.forEach((r) => {
    if (!r.blocked && r.v1 == null) { unkW += r.w; return; }
    const kph = r.e.kph > 0 ? r.e.kph : model.medKph;
    [0, 1, 2].forEach((k) => {
      if (!(model.kinds[k] > 0)) return;
      model.levels.forEach((K) => {
        let v = r.blocked ? 0 : weightedValue(metricsFor(r.it, r.e, K, MULTS[k]), w, keys, max);
        if (v == null) v = r.v1;
        pts.push({ p: r.w / W * model.kinds[k] / 3, v, T: kph ? K / kph : null });
      });
    });
  });
  if (unkW) model.levels.forEach((K) => { pts.push({ p: unkW / W / 3, v: model.fallback, T: model.medKph ? K / model.medKph : null }); });
  model.pts = pts;
  return model;
}

// A task of T hours for someone playing hpd hours a day: its discount over those hours (dT), the discounted length
// (A), and how many tokens it brings (a whole, fr the chance of one more: the task's own plus the daily claims).
export function taskShape(T, hpd) {
  T = T > 0 ? T : 1;
  const dT = Math.exp(-RHO * T), inc = 1 + T / hpd, a = Math.floor(inc);
  return { T, dT, A: (1 - dT) / RHO, a, fr: inc - a };
}
export function contValue(h, s, q) { return (1 - q.fr) * h[Math.min(TOKEN_CAP, s + q.a)] + q.fr * h[Math.min(TOKEN_CAP, s + q.a + 1)]; }
// Taking a task worth v per hour of shape q with s tokens: its value now plus the board after it.
export function takeValue(h, s, v, q) { return v * q.A + q.dT * contValue(h, s, q); }
// A cache key for solvePlan's inputs.
export function planKey(model, hpd) { return hpd + "|" + model.pts.map((p) => p.p.toFixed(6) + ":" + p.v.toFixed(6) + ":" + (p.T || 0).toFixed(4)).join(","); }

// Value of facing a fresh board with s tokens (h[s], s = 0..TOKEN_CAP): take the best of 3 offers (its value earned
// over the task's hours, plus tokens gained), or spend a token to redraw. Value iteration until it settles.
export function solvePlan(model, hpd) {
  const pts = model.pts.map((p) => { const q = taskShape(p.T, hpd); q.p = p.p; q.v = p.v; return q; });
  const n = pts.length, qv = new Array(n), idx = [];
  let h = [];
  for (let z = 0; z <= TOKEN_CAP; z++) h.push(0);
  for (let i0 = 0; i0 < n; i0++) idx.push(i0);
  const scale = Math.max(1e-9, model.best / RHO);
  for (let iter = 0; iter < 2000; iter++) {
    const nh = [];
    let dm = 0;
    for (let s = 0; s <= TOKEN_CAP; s++) {
      for (let i = 0; i < n; i++) qv[i] = s > 0 && !(pts[i].v > 0) ? -Infinity : takeValue(h, s, pts[i].v, pts[i]);
      idx.sort((a, b) => qv[a] - qv[b]);
      const R = s > 0 ? nh[s - 1] : -Infinity;
      let c = 0, prev = 0, e = 0;
      for (let j = 0; j < n; j++) { c += pts[idx[j]].p; let c3 = Math.min(1, c); c3 = c3 * c3 * c3; if (c3 > prev) e += (c3 - prev) * Math.max(qv[idx[j]], R); prev = c3; }
      nh.push(e); dm = Math.max(dm, Math.abs(e - h[s]));
    }
    h = nh;
    if (dm < 1e-5 * scale) break;
  }
  return { h, pts, hpd };
}

// One scale for several pool models: each goal key's largest metric over their pools.
export function commonMax(models) {
  const out = {};
  models.forEach((m) => { if (m) Object.keys(m.own).forEach((k) => { if (!(out[k] >= m.own[k])) out[k] = m.own[k]; }); });
  return out;
}

// The chance a fresh board with s tokens has an offer worth more than q0 to take.
export function beatChance(plan, s, q0) {
  let F = 0;
  plan.pts.forEach((q) => { if (!(q.v > 0) || takeValue(plan.h, s, q.v, q) <= q0 + 1e-12) F += q.p; });
  F = Math.min(1, F);
  return 1 - F * F * F;
}
// The value per hour a task of shape q needs to beat rerolling with s tokens.
export function rateThreshold(plan, s, q) { return (plan.h[s - 1] - q.dT * contValue(plan.h, s, q)) / q.A; }
