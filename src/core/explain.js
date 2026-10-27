// The planner's "Why?" text. Pure: everything comes from the step, the option or the chain's context, and the text
// is in the language of the translator passed in (ctx.t, core/i18n.js; English without one).
import { fmtBig, fmtSmall, fmtHours } from "./text.js";
import { markAge } from "./occupancy.js";
import { EN } from "./i18n.js";

// "an Elite Knight", "a Royal Paladin" (English; translations take the bare {voc}).
export function aVoc(v) { return (/^[AEIOU]/.test(v) ? "an " : "a ") + v; }
// Offers are lettered A, B, C as the game shows them.
export const offerLetter = (o) => "ABC"[o.i] || "";
// An offer as the plan names it: "Cobra Assassin (offer B)"; the active bounty by its name.
export function offerLabel(o, t) {
  t = t || EN;
  return o.i >= 0 && !o.held ? t("{name} (offer {letter})", { name: o.name, letter: offerLetter(o) }) : o.name;
}

// Why a spot in the lens has no numbers for this character. ctx: {level, vocation, refOn, otherOn, t}.
export function noNumsWhy(sp, ctx) {
  const t = ctx.t || EN, lvl = Number(ctx.level) || 0, voc = ctx.vocation;
  if (sp.sessions.length && !sp.entries.length) return t("Only sessions with breaks are logged here, so there’s no clean kill rate yet.");
  if (!ctx.refOn) return t("Reference hunts are off for this character (Characters).");
  const mins = sp.entries.map((e) => e.levelMin || 0);
  if (lvl && mins.length && Math.min.apply(null, mins) > lvl) return t("Needs level {level}.", { level: Math.min.apply(null, mins) });
  if (!sp.entries.some((e) => e.vocation === voc || e.vocation === "any") && !ctx.otherOn) return t("Only other vocations’ hunts here, and those are off for this character (Characters).");
  return t("No usable numbers for this character yet.");
}

// The chain's context (ctx) for the functions below: {sc: {keys, pct}, pct, tokens, options, chosen, order, offers,
// worth, now, active, t}, as planChain builds it.

// Why to pick an offer only at the spot: picking it in game makes the other two disappear.
export function pickWhy(offer, t) {
  t = t || EN;
  return t("Pick {offer} once the spot is free: the other offers disappear.", { offer: offerLabel(offer, t) });
}

export function oddsText(od, t) {
  t = t || EN;
  return od.n ? t.n(od.n, "Free {free} of {n} time you checked around this hour", "Free {free} of {n} times you checked around this hour", { free: od.free })
    : t.n(od.nAll, "Free {free} of {n} time you checked it", "Free {free} of {n} times you checked it", { free: od.freeAll });
}

// "Scores 92: 4.84kk exp/h (4.1kk hunting, 540k from the bounty, 200k from weekly tasks), 200k profit/h."
export function partsWhy(o, ctx) {
  const t = ctx.t || EN, bits = [];
  ctx.sc.keys.forEach((k) => {
    if (k === "xp") {
      const sub = [t("{amount} hunting", { amount: fmtBig(o.parts.hunt) })];
      const some = (x) => x > 0 && fmtBig(x) !== "0";
      if (some(o.parts.today)) sub.push(t("{amount} from today’s boosts", { amount: fmtBig(o.parts.today) }));
      if (some(o.parts.held)) sub.push(t("{amount} from the bounty", { amount: fmtBig(o.parts.held) }));
      if (some(o.parts.weekly)) sub.push(t("{amount} from weekly tasks", { amount: fmtBig(o.parts.weekly) }));
      bits.push(t("{amount} exp/h", { amount: fmtBig(o.m.xp) }) + (sub.length > 1 ? " (" + sub.join(", ") + ")" : ""));
    } else if (k === "profit") bits.push(t("{amount} profit/h", { amount: fmtBig(o.m.profit) }));
    else if (k === "charm") bits.push(t("{amount} charm points/h", { amount: fmtSmall(o.m.charm) }));
    else if (k === "bounty") bits.push(t("{amount} bounty points/h", { amount: fmtSmall(o.m.bounty) }));
  });
  let s = bits.length ? t("Scores {score}: {parts}.", { score: ctx.pct(o.v), parts: bits.join(", ") }) : t("Scores {score}.", { score: ctx.pct(o.v) });
  if (o.today && o.today.length) s += " " + t("Today: {boosts}.", { boosts: t.and(o.today) });
  if (o.travelMin && o.hours) s += " " + t("Includes {min} min of travel.", { min: o.travelMin });
  if (o.held) s += " " + (!o.hours ? t("Bounty done in about {time} here.", { time: fmtHours(o.held.hoursLeft) }) :
    o.held.finishes ? t("Finishes the bounty this session.") : t("About {kills} of {left} bounty kills this session.", { kills: Math.round(o.held.kills), left: Math.round(o.held.left) }));
  return s;
}

// Why the n-th Go step: its value, how it compares with the bounty's best spot, the reroll threshold, marks and odds.
export function goWhy(o, n, ctx) {
  const t = ctx.t || EN;
  let s = partsWhy(o, ctx);
  const task = ctx.options.filter((x) => x.held && !(x.mark && x.mark.state === "taken"))[0];
  const by = (x) => { const d = ctx.pct(o.v) - ctx.pct(x.v); return d >= 1 ? t("by {points}", { points: d }) : t("by a hair"); };
  // A spot without the bounty creature (or any offer's creature) that still outranks every spot with one says why, once.
  const ignoreLead = !o.held && ctx.offers.length > 0 && ctx.chosen.filter((x) => !x.held)[0] === o && (!task || o.v > task.v);
  const best = task && { spot: task.name, score: ctx.pct(task.v), by: by(task) };
  if (ignoreLead && ctx.active) s += " " + (task ? t("{creature} isn’t here, but this beats its best spot, {spot} ({score}), {by}.", Object.assign({ creature: ctx.active.name }, best)) :
    t("{creature} isn’t at any spot with numbers.", { creature: ctx.active.name }));
  else if (ignoreLead) s += " " + (task ? t("No offer’s creature is here, but this beats the best spot with one, {spot} ({score}), {by}.", best) :
    t("No offer’s creature is at a spot with numbers."));
  if (o.thr != null) s += " " + (ctx.pct(o.thr) < 1 ? t("A reroll can’t beat it.") :
    t.n(ctx.tokens, "A reroll is worth {score} with {n} token left.", "A reroll is worth {score} with {n} tokens left.", { score: ctx.pct(o.thr) }));
  if (o.mark && o.mark.state === "free") s += " " + t("Marked free {min} min ago.", { min: Math.round(markAge(o.mark, ctx.now)) });
  if (o.odds && o.odds.nAll) s += " " + oddsText(o.odds, t) + ".";
  // A better-scoring spot this one is checked before, including one pushed off the end of the list.
  const passed = ctx.order.slice(ctx.order.indexOf(o) + 1).filter((x) => x.v > o.v && !(o.mark && o.mark.state === "free"))[0];
  if (passed && o.odds && passed.odds) s += " " + (o.odds.p > passed.odds.p + 0.05 ? t("It comes before {spot} ({score}) because it’s more often free.", { spot: passed.name, score: ctx.pct(passed.v) })
    : t("It comes before {spot} ({score}) because it’s quicker to check.", { spot: passed.name, score: ctx.pct(passed.v) }));
  if (o.offer && !o.offer.held) s += " " + pickWhy(o.offer, t);
  return s;
}

// Why the chain ends with a reroll.
export function rerollWhy(cutoff, skipped, ctx) {
  const t = ctx.t || EN;
  let s = "";
  if (cutoff) s = t("The next spot, {spot} ({score}), is worth less than a reroll ({reroll}).", { spot: cutoff.name, score: ctx.pct(cutoff.v), reroll: ctx.pct(cutoff.thr) });
  else if (!ctx.options.length) s = t("None of your spots has numbers for this character yet.");
  else s = skipped.length && !ctx.chosen.length ? t("Every spot worth checking is marked taken.") : t("Every spot worth checking is on this list.");
  if (ctx.active) s += " " + t("Rerolling drops {creature}.", { creature: ctx.active.name });
  return s;
}

// Why the chain ends by pointing at Spots.
export function seeSpotsWhy({ unknown, tokens, model, t }) {
  t = t || EN;
  if (unknown) return t("Set your reroll tokens (Bounty) to compare with a reroll.");
  if (tokens === 0) return t("No reroll tokens left.");
  if (!model) return t("Log some hunts to compare with a reroll.");
  return "";
}
