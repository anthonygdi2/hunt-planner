// Per creature metrics for a goal: what a bounty task on it is worth per hour in exp, profit, charm points and bounty
// points.
import { BESTIARY, RAID, TASK } from "../data/rules.js";
import { defaultKills, rewardPerKill } from "./rewards.js";

// The creature's bestiary: kills to finish, charm points for it, and charm points for its first Echo Warden. Unknown
// classes count as Hard.
export function bestiaryOf(c) {
  const b = BESTIARY[c.cls] || BESTIARY.H;
  return { kills: b.kills, charmPoints: b.charmPoints, warden: b.warden };
}

// Each creature's share of a spot's exp: kph {slug: kills/h} × base exp (expTable {slug: exp}), or of its kills when any
// creature's exp is unknown. Also stands in for its share of the spot's loot (there's no loot value per creature).
// Returns {slug: share}, empty when nothing dies there.
export function expShares(kph, expTable) {
  const keys = Object.keys(kph || {}), exp = expTable || {}, byExp = keys.every((k) => exp[k] > 0), w = {}, out = {};
  let tot = 0;
  keys.forEach((k) => { w[k] = kph[k] * (byExp ? exp[k] : 1); tot += w[k]; });
  if (tot > 0) keys.forEach((k) => { out[k] = w[k] / tot; });
  return out;
}

// The chance a kill of this creature brings its first Echo Warden kill: raid chance × the share of raids a Warden
// leads (higher once the bestiary is done).
const wardenShare = (entry) => (entry.bestiaryDone ? RAID.wardenShareDone : RAID.wardenShare);

// c: a catalog creature. rec: its working numbers {kph, xph, pph, spot} plus its entry's bestiaryDone and wardenDone.
// ctx:
//   diff        the task difficulty
//   kills       the task's kills (default: the middle of the range); mult: Silver/Gold multiplier (default 1)
//   rewardExp   the task reward shown in game, used instead of the per-kill rate (Challenging on Master)
//   chalRates   learned Challenging rates (rewards.js)
//   bestiaryBonus  the Bounty Talisman's double-bestiary chance in percent (bounty creature only)
//   talismanLoot   the Talisman's more-loot chance in percent: the creature's share of its spot's loot/h × the chance
//                  is added to the profit, unless its numbers come from hunts logged on its bounty (rec.taskBonus),
//                  which already include it
//   spotEco     spot → {lph (loot/h, null when unknown)}, and expTable (slug → base exp), for that share
//   raidP       Echo Raid chance per kill
//   spotKph     spot → {slug: kills/h}, for what else dies at rec.spot
//   entries     slug → entry {bestiaryDone, wardenDone}, for those other creatures
//   catalog     makeCatalog(...), for those other creatures' classes and rarity
//   weeklyXph   (spot, hours, slug, kills) → weekly reward share per hour, or null when there are no weekly tasks
// Returns {hours, rewardXph, weeklyXph, xp, profit, talismanLoot, bestiaryCharm?, wardenCharm?, otherCharm?, charm, bounty}; a metric
// is null when its numbers are missing.
export function metrics(c, rec, ctx) {
  rec = rec || {};
  const diff = ctx.diff, t = TASK[diff], kph = rec.kph, m = {};
  const kills = ctx.kills || defaultKills(diff), mult = ctx.mult || 1;
  const hours = kph ? kills / kph : null;
  m.hours = hours;
  let rewardXph = null;
  if (hours) {
    if (ctx.rewardExp != null) rewardXph = ctx.rewardExp / hours;
    else rewardXph = rewardPerKill(diff, c, ctx.chalRates).perKill * kills * mult / hours;
  }
  m.rewardXph = rewardXph;
  m.weeklyXph = ctx.weeklyXph && hours ? ctx.weeklyXph(rec.spot, hours, c.slug, kills) : 0;
  m.xp = rec.xph != null ? rec.xph + (rewardXph || 0) + m.weeklyXph : null;
  m.profit = rec.pph != null ? rec.pph : null;
  m.talismanLoot = 0;
  const tl = Number(ctx.talismanLoot) || 0, eco = rec.spot && ctx.spotEco && ctx.spotEco[rec.spot], at = rec.spot && ctx.spotKph && ctx.spotKph[rec.spot];
  if (m.profit != null && tl > 0 && !rec.taskBonus && eco && eco.lph > 0 && at && at[c.slug] > 0) {
    m.talismanLoot = eco.lph * (expShares(at, ctx.expTable)[c.slug] || 0) * tl / 100;
    m.profit += m.talismanLoot;
  }
  const b = bestiaryOf(c), bonus = Number(ctx.bestiaryBonus) || 0, raidP = ctx.raidP;
  const wardenOpen = !rec.wardenDone && !c.r && raidP > 0;
  if (kph != null) {
    m.bestiaryCharm = rec.bestiaryDone ? 0 : kph * (b.charmPoints / b.kills) * (1 + bonus / 100);
    m.wardenCharm = wardenOpen ? kph * raidP * wardenShare(rec) * b.warden : 0;
    // Hunting a spot also progresses the bestiary (and Echo Warden chances) of everything else killed there. The
    // Talisman's double-bestiary chance only applies to the bounty creature itself.
    let others = 0;
    const sk = rec.spot && ctx.spotKph && ctx.spotKph[rec.spot];
    if (sk) Object.keys(sk).forEach((key) => {
      const o = key !== c.slug && ctx.catalog.bySlug[key];
      if (!o) return;
      const ok = sk[key], orec = (ctx.entries && ctx.entries[key]) || {}, ob = bestiaryOf(o);
      if (!orec.bestiaryDone) others += ok * ob.charmPoints / ob.kills;
      if (!orec.wardenDone && !o.r && raidP > 0) others += ok * raidP * wardenShare(orec) * ob.warden;
    });
    m.otherCharm = others;
    m.charm = m.bestiaryCharm + m.wardenCharm + others;
  } else m.charm = rec.bestiaryDone && !wardenOpen ? 0 : null;
  m.bounty = hours ? t.points * mult / hours : null;
  return m;
}
