// The planner's "Why?" text. Pure: everything comes from the step, the option or the chain's context.
import { fmtBig, fmtSmall, fmtHours, plural, joinAnd } from "./text.js";
import { staleProfitText } from "./reference.js";
import { markAge } from "./occupancy.js";

// "an Elite Knight", "a Royal Paladin".
export function aVoc(v) { return (/^[AEIOU]/.test(v) ? "an " : "a ") + v; }
// Offers are lettered A, B, C as the game shows them.
export const offerLetter = (o) => "ABC"[o.i] || "";
// An offer as the plan names it: "Cobra Assassin (offer B)"; the active bounty by its name.
export function offerLabel(o) { return o.name + (o.i >= 0 && !o.held ? " (offer " + offerLetter(o) + ")" : ""); }

// Why a spot in the lens has no numbers for this character. ctx: {level, vocation, refOn, otherOn}.
export function noNumsWhy(sp, ctx) {
  const lvl = Number(ctx.level) || 0, voc = ctx.vocation;
  if (sp.sessions.length && !sp.entries.length) return "Only sessions with breaks are logged here, so there’s no clean kill rate yet.";
  if (!ctx.refOn) return "Reference hunts are off for this character (Characters).";
  const mins = sp.entries.map((e) => e.levelMin || 0);
  if (lvl && mins.length && Math.min.apply(null, mins) > lvl) return "Needs level " + Math.min.apply(null, mins) + ".";
  if (!sp.entries.some((e) => e.vocation === voc || e.vocation === "any") && !ctx.otherOn) return "Only other vocations’ hunts here, and those are off for this character (Characters).";
  return "No usable numbers for this character yet.";
}

// The chain's context (ctx) for the functions below: {sc: {keys, pct}, pct, tokens, options, chosen, order, offers,
// worth, now, active}, as planChain builds it.

// Why to pick an offer only at the spot: picking it in game makes the other two disappear.
export function pickWhy(offer) {
  return "Pick " + offerLabel(offer) + " once the spot is free: the other offers disappear.";
}

export function oddsText(od) {
  return od.n ? "Free " + od.free + " of " + plural(od.n, "time") + " you checked around this hour" : "Free " + od.freeAll + " of " + plural(od.nAll, "time") + " you checked it";
}

// Where a spot's numbers come from.
export function srcWhy(o) {
  if (o.src === "own") return "From your own sessions here.";
  const e = o.entry || {}, who = o.src === "other" || o.src === "otherAdj" ? aVoc(e.vocation || "other vocation") + "’s reference hunt" : "a reference hunt";
  return "From " + who + (o.src === "refAdj" || o.src === "otherAdj" ? ", adjusted to you." : " not adjusted to you yet, so likely optimistic.") +
    (o.profitStale ? " " + staleProfitText(e) + "." : "");
}

// "Scores 92: 4.8kk exp/h (4.1kk hunting, 540k from Cobra Assassin’s task, 200k from your Silencer weekly task)."
export function partsWhy(o, ctx) {
  const bits = [];
  ctx.sc.keys.forEach((k) => {
    if (k === "xp") {
      const sub = [fmtBig(o.parts.hunt) + " hunting"];
      const some = (x) => x > 0 && fmtBig(x) !== "0";
      if (some(o.parts.today)) sub.push(fmtBig(o.parts.today) + " from today’s boosts");
      if (some(o.parts.held)) sub.push(fmtBig(o.parts.held) + " from the bounty");
      if (some(o.parts.weekly)) sub.push(fmtBig(o.parts.weekly) + " from weekly tasks");
      bits.push(fmtBig(o.m.xp) + " exp/h" + (sub.length > 1 ? " (" + sub.join(", ") + ")" : ""));
    } else if (k === "profit") bits.push(fmtBig(o.m.profit) + " profit/h");
    else if (k === "charm") bits.push(fmtSmall(o.m.charm) + " charm points/h");
    else if (k === "bounty") bits.push(fmtSmall(o.m.bounty) + " bounty points/h");
  });
  let s = "Scores " + ctx.pct(o.v) + (bits.length ? ": " + bits.join(", ") : "") + ".";
  if (o.today && o.today.length) s += " Today: " + joinAnd(o.today) + ".";
  if (o.travelMin && o.hours) s += " Includes " + o.travelMin + " min of travel.";
  if (o.held) s += !o.hours ? " Bounty done in about " + fmtHours(o.held.hoursLeft) + " here." :
    o.held.finishes ? " Finishes the bounty this session." : " About " + Math.round(o.held.kills) + " of " + Math.round(o.held.left) + " bounty kills this session.";
  return s;
}

// Why the n-th Go step: its value, what it beats, the reroll threshold, marks and odds, and where the numbers come from.
export function goWhy(o, n, ctx) {
  let s = partsWhy(o, ctx);
  const next = ctx.chosen[n + 1], left = plural(ctx.tokens, "token");
  const task = ctx.options.filter((x) => x.held && !(x.mark && x.mark.state === "taken"))[0];
  const margin = (x) => { const d = ctx.pct(o.v) - ctx.pct(x.v); return d >= 1 ? "by " + d : "by a hair"; };
  // A spot without the bounty creature (or any offer's creature) that still outranks every spot with one says why, once.
  const ignoreLead = !o.held && ctx.offers.length > 0 && ctx.chosen.filter((x) => !x.held)[0] === o && (!task || o.v > task.v);
  if (ignoreLead && ctx.active) s += task ? " " + ctx.active.name + " isn’t here, but this beats its best spot, " + task.name + " (" + ctx.pct(task.v) + "), " + margin(task) + "." :
    " " + ctx.active.name + " isn’t at any spot with numbers.";
  else if (ignoreLead) s += task ? " No offer’s creature is here, but this beats the best spot with one, " + task.name + " (" + ctx.pct(task.v) + "), " + margin(task) + "." :
    " No offer’s creature is at a spot with numbers.";
  if (o.thr != null) s += ctx.pct(o.thr) < 1 ? " A reroll can’t beat it." : " A reroll is worth " + ctx.pct(o.thr) + " with " + left + " left.";
  if (o.mark && o.mark.state === "free") s += " Marked free " + Math.round(markAge(o.mark, ctx.now)) + " min ago.";
  if (o.odds && o.odds.nAll) s += " " + oddsText(o.odds) + ".";
  // A better-scoring spot this one is checked before, including one pushed off the end of the list.
  const passed = ctx.order.slice(ctx.order.indexOf(o) + 1).filter((x) => x.v > o.v && !(o.mark && o.mark.state === "free"))[0];
  if (passed && o.odds && passed.odds) s += " It comes before " + passed.name + " (" + ctx.pct(passed.v) + ") because " +
    (o.odds.p > passed.odds.p + 0.05 ? "it’s more often free" : "it’s quicker to check") + ".";
  if (o.offer && !o.offer.held) s += " " + pickWhy(o.offer);
  return s;
}

// Why the chain ends with a reroll.
export function rerollWhy(cutoff, skipped, ctx) {
  let s = "";
  if (cutoff) s = "The next spot, " + cutoff.name + " (" + ctx.pct(cutoff.v) + "), is worth less than a reroll (" + ctx.pct(cutoff.thr) + ").";
  else if (!ctx.options.length) s = "None of your spots has numbers for this character yet.";
  else s = skipped.length && !ctx.chosen.length ? "Every spot worth checking is marked taken." : "Every spot worth checking is on this list.";
  if (ctx.active) s += " Rerolling drops " + ctx.active.name + ".";
  return s;
}

// Why the chain ends by pointing at Spots.
export function seeSpotsWhy({ unknown, tokens, model }) {
  if (unknown) return "Set your reroll tokens (Bounty) to compare with a reroll.";
  if (tokens === 0) return "No reroll tokens left.";
  if (!model) return "Log some hunts to compare with a reroll.";
  return "";
}
