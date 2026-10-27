// Where to hunt: what a session at a spot is worth, the ranked options, and the chain of steps.
import { norm } from "./text.js";
import { creatureInPool } from "./catalog.js";
import { taskReward, kindMult } from "./rewards.js";
import { bestiaryOf } from "./metrics.js";
import { GOAL_KEYS, weightedValue } from "./score.js";
import { RHO, taskShape, rateThreshold } from "./reroll.js";
import { markAge, markActive, occOdds, orderByOdds } from "./occupancy.js";
import { offerLetter, goWhy, rerollWhy, seeSpotsWhy } from "./explain.js";
import { EN } from "./i18n.js";
import { BOOSTED_EXP_MULT, RAID, TASK, TOKEN_CAP } from "../data/rules.js";

// The chain shows at most this many spots.
export const MAX_STEPS = 5;
// With no session length the plan scores hourly rates; a wasted trip to a taken spot is then costed against a session
// this long when ordering spots by how often they're free.
export const CHECK_HOURS = 2;

// How much today's bonuses raise a spot's hunting exp: each creature's share of the spot's exp (kills/h × base exp from
// ctx.expTable, or kill shares when a creature's exp is unknown) times its own bonus (Boosted Creature, exp Prey), then
// any exp event. today: {boosted (slug), prey [{slug, kind, pct}], event (percent)} or null. Returns {mult, notes}.
export function todayFactor(kph, today, ctx) {
  const out = { mult: 1, notes: [] }, t = ctx.t || EN;
  if (!today) return out;
  const keys = Object.keys(kph), exp = ctx.expTable, byExp = keys.every((k) => exp[k] > 0), w = {};
  let tot = 0, per = 0;
  keys.forEach((k) => { w[k] = kph[k] * (byExp ? exp[k] : 1); tot += w[k]; });
  keys.forEach((k) => {
    let m = 1;
    const name = ctx.catalog.bySlug[k] ? ctx.catalog.bySlug[k].name : k;
    if (today.boosted === k) { m *= BOOSTED_EXP_MULT; out.notes.push(t("{creature} is boosted (double exp)", { creature: name })); }
    (today.prey || []).forEach((p) => { if (p.slug === k && p.kind === "xp" && p.pct > 0) { m *= 1 + p.pct / 100; out.notes.push(t("{creature} prey +{pct}% exp", { creature: name, pct: p.pct })); } });
    per += tot ? w[k] / tot * m : 0;
  });
  if (tot) out.mult = per;
  if (today.event > 0) { out.mult *= 1 + today.event / 100; out.notes.push(t("+{pct}% exp event", { pct: today.event })); }
  return out;
}

// The held offer {slug, kills, done, kind, exp}: its whole reward and bounty points, and the kills still needed.
// ctx: {catalog, chalRates}. Null for no offer or an unknown creature.
export function heldTask(held, diff, ctx) {
  const c = held && ctx.catalog.bySlug[held.slug];
  if (!c) return null;
  const r = taskReward({ diff, creature: c, kills: held.kills, kind: held.kind, exp: held.exp, chalRates: ctx.chalRates });
  return { slug: c.slug, it: c, kills: r.kills, left: Math.max(0, r.kills - (Number(held.done) || 0)), reward: r.reward, points: r.points };
}

// What a session of opts.hours at this spot is worth per hour, holding opts.held: the spot's own exp/h, profit/h and
// charm/h, plus each remaining kill's share of the held task's reward and bounty points and of each open weekly's
// reward (reward / kills left, as the weekly model does), capped at what the session can finish. Travel eats into the
// hunting time but not the session: value = what the hunting hours earn / session hours. With no session length
// (the default): hourly rates, every remaining kill worth reward / kills left with no cap, and no travel.
// nums: spotNumbers(sp). opts: {hours, held, diff, today, travel (spot id → the character's minutes), weekly (open
// weeklies)}. ctx: {catalog, chalRates, entries, bestiaryBonus, raidP, expTable}.
export function spotValue(sp, nums, opts, ctx) {
  if (!nums) return null;
  // Travel: the character's own minutes for this spot, else the spot's meta.
  const own = opts.travel && opts.travel[sp.id], tm = own > 0 ? own : sp.meta.travelMin;
  const rate = !(opts.hours > 0), H = rate ? 1 : opts.hours, travel = tm > 0 ? tm : 0, tf = todayFactor(nums.kph, opts.today, ctx);
  const Hh = rate ? 1 : Math.max(0, H - travel / 60), diff = opts.diff, held = heldTask(opts.held, diff, ctx);
  const v = { id: sp.id, name: sp.name, src: nums.src, entry: nums.entry, profitStale: !!nums.profitStale, hours: rate ? null : H, huntHours: rate ? null : Hh,
    travelMin: travel, kph: nums.kph, xph: nums.xph, pph: nums.pph, held: null, weekly: [], today: tf.notes,
    parts: { hunt: nums.xph * Hh / H, today: nums.xph * (tf.mult - 1) * Hh / H, held: 0, weekly: 0 } };
  let bounty = 0;
  if (held && held.left > 0 && nums.kph[held.slug] > 0) {
    const hk = nums.kph[held.slug], hf = rate ? hk / held.left : Math.min(1, hk * Hh / held.left);
    v.parts.held = held.reward * hf / H;
    bounty = held.points * hf / H;
    v.held = { slug: held.slug, kph: hk, kills: rate ? null : Math.min(held.left, hk * Hh), left: held.left, finishes: !rate && hf >= 1, hoursLeft: held.left / hk };
  }
  (opts.weekly || []).forEach((w) => {
    const k = nums.kph[w.key];
    if (!(k > 0)) return;
    const f = rate ? k / w.rem : Math.min(1, k * Hh / w.rem);
    v.parts.weekly += w.exp * f / H;
    v.weekly.push({ key: w.key, name: w.name, kph: k, kills: rate ? null : Math.min(w.rem, k * Hh), left: w.rem, exp: w.exp * f });
  });
  // Charm as metrics counts it for every creature at a spot; the Talisman's double bestiary only for the held creature.
  let charm = 0;
  const bonus = Number(ctx.bestiaryBonus) || 0, raidP = ctx.raidP;
  Object.keys(nums.kph).forEach((key) => {
    const o = ctx.catalog.bySlug[key];
    if (!o) return;
    const k = nums.kph[key], rec = ctx.entries[key] || {}, b = bestiaryOf(o);
    if (!rec.bestiaryDone) charm += k * b.charmPoints / b.kills * (held && key === held.slug ? 1 + bonus / 100 : 1);
    if (!rec.wardenDone && !o.r && raidP > 0) charm += k * raidP * (rec.bestiaryDone ? RAID.wardenShareDone : RAID.wardenShare) * b.warden;
  });
  v.m = { xp: v.parts.hunt + v.parts.today + v.parts.held + v.parts.weekly, profit: nums.pph != null ? nums.pph * Hh / H : null,
    charm: charm * Hh / H, bounty };
  return v;
}

// Puts spot values (each with m) on the Score's scale: each goal's factor over the best creature in the task pool
// (model: reroll.js poolModel, or null), so spot values (v), creature scores and reroll thresholds share one scale and
// 100 is the best creature on a normal task. With no logged pool yet, the factors are scaled over these spots and 100
// is the best of them. Sets v and score (0..100) on each value. Returns {keys, model (when pooled), ref, pct(v)}.
export function scaleSpots(values, { weights: w, model }) {
  const keys = GOAL_KEYS.filter((g) => w[g] > 0);
  const pooled = !!(model && model.known && model.best > 0), max = {};
  let best = 0;
  keys.forEach((k) => {
    max[k] = pooled ? model.max[k] : 0;
    if (!pooled) values.forEach((x) => { if (x.m[k] != null) max[k] = Math.max(max[k], Math.abs(x.m[k])); });
  });
  values.forEach((x) => { x.v = keys.length ? weightedValue(x.m, w, keys, max) : null; if (x.v != null && x.v > best) best = x.v; });
  const ref = pooled ? model.best : best;
  values.forEach((x) => { x.score = x.v != null && ref > 0 ? Math.round(x.v / ref * 100) : null; });
  return { keys, model: pooled ? model : null, ref, pct: (v) => (ref > 0 ? Math.max(0, Math.round(v / ref * 100)) : 0) };
}
// Best value first; no value last.
export function byValue(a, b) { return (b.v == null ? -Infinity : b.v) - (a.v == null ? -Infinity : a.v); }
// Spot values on the Score's scale, best first. Spots missing a weighted factor (a reference with no profit, say) get
// no score and sort last. scale: scaleSpots' second argument.
export function spotScores(values, scale) {
  const out = values.filter((x) => x);
  scaleSpots(out, scale);
  return out.sort(byValue);
}

// The board's offers in the task pool, plus the held offer if it isn't one of them. The held one carries its progress
// (kills done). Each: {key, i (board position, -1 for the held one off the board), slug, name, kills, kind, exp, done,
// held}.
export function planOffers(board, held, diff, catalog) {
  const out = [];
  (board || []).forEach((o, i) => {
    const c = o && (o.slug ? catalog.bySlug[o.slug] : catalog.byName[norm(o.name || "")]);
    if (!c || !creatureInPool(c, diff)) return;
    out.push({ key: "o" + i, i, slug: c.slug, name: c.name, kills: o.kills, kind: o.kind, exp: o.exp, done: 0, held: false });
  });
  const h = held && catalog.bySlug[held.slug];
  if (h) {
    const on = out.filter((o) => o.slug === h.slug && (!o.kills || !held.kills || Number(o.kills) === Number(held.kills)))[0];
    if (on) { on.held = true; on.done = Number(held.done) || 0; if (!on.kills) on.kills = held.kills; }
    else out.push({ key: "held", i: -1, slug: h.slug, name: h.name, kills: held.kills, kind: held.kind, exp: held.exp, done: Number(held.done) || 0, held: true });
  }
  return out;
}

// Every spot in the lens valued holding each offer; a spot's option is its best offer to hold (ties go to the offer
// worth most where its creature lives, then the one already held). Best first, on the Score's scale.
// args: {index (spotIndex), offers (planOffers), hours, team ("solo" default, or "any"), inLens(sp) → "" when in,
// valueAt(sp, offer or null) → spotValue or null, scale(values) → scaleSpots' result}.
// Returns {options, offers, sc, worth (offer key → its best value), idx, hours}.
export function planOptions({ index, offers, hours, team, inLens, valueAt, scale }) {
  const H = hours > 0 ? hours : null, t0 = team || "solo";
  const perSpot = [];
  let all = [];
  index.list.forEach((sp) => {
    if (inLens(sp)) return;
    const vals = (offers.length ? offers : [null]).map((o) => {
      const v = valueAt(sp, o);
      if (v) v.offer = o;
      return v;
    }).filter((v) => v);
    if (!vals.length) return;
    // Solo by default: a reference recorded as a duo or team hunt (or the spot's meta saying so) needs team "any".
    const t = sp.meta.team || (vals[0].entry && vals[0].entry.team) || "solo";
    if (t0 !== "any" && t !== "solo") return;
    vals.forEach((v) => { v.team = t; });
    perSpot.push(vals);
    all = all.concat(vals);
  });
  const sc = scale(all);
  // Each offer's worth: its best value at a spot where its creature lives.
  const worth = {};
  all.forEach((v) => { if (v.held && v.v != null && !(worth[v.offer.key] >= v.v)) worth[v.offer.key] = v.v; });
  const rank = (o) => (o ? (worth[o.key] != null ? worth[o.key] : -Infinity) : 0);
  const options = [];
  perSpot.forEach((vals) => {
    let best = null;
    vals.forEach((v) => {
      if (v.v == null) return;
      if (!best || v.v > best.v + 1e-12 || (Math.abs(v.v - best.v) <= 1e-12 &&
        (rank(v.offer) > rank(best.offer) || (rank(v.offer) === rank(best.offer) && v.offer && v.offer.held && !best.offer.held)))) best = v;
    });
    if (best) options.push(best);
  });
  options.sort(byValue);
  return { options, offers, sc, worth, idx: index, hours: H };
}

// "Where should I hunt right now?" as steps. Options (planOptions' result) run best first, skipping spots marked taken
// lately, until one is worth less than a reroll; spots marked free lately move to the front. The chain then ends with
// Reroll, or with no tokens, Hunt.
// ctx: {diff, now (ms), marks (spot id → {state, at}), tokens (0..TOKEN_CAP), tokensUnknown (rerolls left never set),
// hpd (hours per day), solve(model, hpd) → reroll plan, occupancy (counts, optional), world, markMinutes}.
// Returns {steps [{kind, text, why, ...}], notes, options, chosen, skipped, cutoff, tokens, hours, pct, pool}.
export function planChain(po, ctx) {
  const now = ctx.now, marks = ctx.marks || {}, unknown = !!ctx.tokensUnknown;
  const tokens = Math.max(0, Math.min(TOKEN_CAP, Math.floor(ctx.tokens)));
  const options = po.options, offers = po.offers, sc = po.sc, worth = po.worth, H = po.hours, pct = sc.pct;

  // The reroll threshold for each option, on the same scale. Hunting the held task's creature is the Take decision for
  // the kills left at that spot's rate; a spot without it is measured against what a fresh board is worth per hour
  // (the same threshold for a task with no end).
  const plan = !unknown && sc.model && sc.model.pts && tokens > 0 ? ctx.solve(sc.model, ctx.hpd) : null;
  options.forEach((o) => {
    o.thr = !plan ? null : o.held ? rateThreshold(plan, tokens, taskShape(o.held.left / o.held.kph, ctx.hpd)) : RHO * plan.h[tokens - 1];
    o.mark = markActive(marks[o.id], now, ctx.markMinutes) ? marks[o.id] : null;
  });
  const skipped = [];
  let keep = [], cutoff = null;
  for (let i = 0; i < options.length; i++) {
    const o = options[i];
    if (o.thr != null && o.v < o.thr) { cutoff = o; break; }
    if (o.mark && o.mark.state === "taken") { skipped.push({ id: o.id, name: o.name, mins: Math.round(markAge(o.mark, now)) }); continue; }
    keep.push(o);
  }
  // With occupancy counts, spots worth checking go in the order with the best expected value.
  if (ctx.occupancy) {
    keep.forEach((o) => { o.odds = occOdds(ctx.occupancy, o.id, ctx.world, now); });
    keep = orderByOdds(keep, H || CHECK_HOURS, plan ? RHO * plan.h[tokens - 1] : 0);
  }
  keep = keep.filter((o) => o.mark && o.mark.state === "free").concat(keep.filter((o) => !(o.mark && o.mark.state === "free")));
  const chosen = keep.slice(0, MAX_STEPS), more = keep.length > chosen.length;

  // The active bounty, when one is picked (planOffers marks it held); otherwise the offers being chosen from.
  const active = offers.filter((o) => o.held)[0] || null;
  const t = ctx.t || EN, steps = [], why = { sc, pct, tokens, options, chosen, order: keep, offers, worth, now, active, t };
  if (active && Number(active.kills) > 0 && active.done >= Number(active.kills)) steps.push({ kind: "finish", offer: active, text: t("Claim {creature}’s task reward", { creature: active.name }),
    why: t("No kills left. Claiming it pays the reward, {points} bounty points and a reroll token; then choose from new offers.", { points: TASK[ctx.diff].points * kindMult(active.kind) }) });
  if (tokens === 0 && !unknown) steps.push({ kind: "claim", text: t("Claim your daily reroll token if you haven’t today, then re-plan"),
    why: t("You have no reroll tokens left. Each day gives one to claim, and each finished bounty gives another.") });
  chosen.forEach((o, n) => {
    const bounty = !o.offer ? null : o.offer.held ? t("counts for your active bounty") : t("for offer {letter}, pick once the spot is free", { letter: offerLetter(o.offer) });
    steps.push({ kind: "go", option: o, offer: o.offer || null, bounty, taken: n > 0, text: n ? t("Taken? → {spot}", { spot: o.name }) : t("Go to {spot}", { spot: o.name }), why: goWhy(o, n, why) });
  });
  // The end of the chain: label is its text without the "Taken? →" lead.
  const end = (label) => ({ label, text: chosen.length ? t("Taken? → {spot}", { spot: label }) : label });
  if (more) steps.push(Object.assign({ kind: "seeSpots", taken: true, why: t("More spots still beat a reroll than fit here.") }, end(t("See Spots for more"))));
  else if (plan) steps.push(Object.assign({ kind: "reroll", taken: chosen.length > 0, tokens, dropsBounty: !!active, why: rerollWhy(cutoff, skipped, why) }, end(t("Reroll and re-plan"))));
  else steps.push(Object.assign({ kind: "seeSpots", taken: chosen.length > 0, why: seeSpotsWhy({ unknown, tokens, model: !!sc.model, t }) },
    end(skipped.length && !chosen.length ? t("See Spots for more, or free a spot below") : t("See Spots for more"))));
  const notes = skipped.map((x) => t("Skipped {spot}: marked taken {min} min ago.", { spot: x.name, min: x.mins }));
  return { steps, notes, options, chosen, skipped, cutoff, tokens, hours: H, pct,
    pool: sc.model ? { known: sc.model.known, size: sc.model.rows.length } : null };
}
