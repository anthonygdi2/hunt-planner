// Per creature metrics for a goal: what a bounty task on it is worth per hour in exp, profit, charm points and bounty
// points.
import { BESTIARY, BOOSTED_LOOT_MULT, KILL_TIME, RAID, TASK } from "../data/rules.js";
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

// Charm points per hour from a creature's bestiary at kph kills/h (already raised by any double-bestiary chance), over
// `hours` of hunting (1 for an hourly rate). rec: its entry {bestiaryDone, bestiaryKills}. The points come when the
// bestiary is finished, so with the kill count typed each kill left is worth points ÷ kills left (as a weekly task's
// kills are), capped at finishing it within those hours; without one, points ÷ the class's total. 0 when done.
export function bestiaryRate(c, rec, kph, hours) {
  const r = rec || {}, b = bestiaryOf(c);
  if (r.bestiaryDone || !(kph > 0)) return 0;
  if (typeof r.bestiaryKills !== "number") return kph * b.charmPoints / b.kills;
  const left = b.kills - r.bestiaryKills, H = hours > 0 ? hours : 1;
  return left > 0 ? b.charmPoints * Math.min(1, kph * H / left) / H : 0;
}

// Each creature's share of the hit points killed at a spot: kph {slug: kills/h} × hit points (hpTable {slug: hit
// points}), which is its share of the time spent killing; the exp shares stand in when any creature's hit points are
// unknown (or there's no table). Returns {slug: share}.
export function hpShares(kph, hpTable, expTable) {
  const keys = Object.keys(kph || {}), hp = hpTable || {};
  return keys.length && keys.every((k) => hp[k] > 0) ? expShares(kph, hp) : expShares(kph, expTable);
}

// What loot bonuses multiply a spot's loot by: each creature's share of the loot (shares: expShares, an estimate) × 2
// when it's the boosted creature (rules.js BOOSTED_LOOT_MULT) × (1 + the sum of its loot chances / 100: loot Preys and
// the Talisman add their chances, rules.js TALISMAN). boosted: a slug or null; chances: {slug: percent}. 1 when nothing
// dies there.
export function lootMult(shares, boosted, chances) {
  const keys = Object.keys(shares || {}), ch = chances || {};
  if (!keys.length) return 1;
  let m = 0;
  keys.forEach((k) => { m += shares[k] * (boosted && k === boosted ? BOOSTED_LOOT_MULT : 1) * (1 + (Number(ch[k]) || 0) / 100); });
  return m;
}

// What damage bonuses multiply a spot's kill rate by (rules.js KILL_TIME): only the time spent killing a creature gets
// shorter, by d / (1 + d) for a bonus of d on it, so the rate is 1 / (1 - killTime x the sum of share x d / (1 + d)).
// shares: each creature's share of the hit points killed (hpShares); bonuses:
// {slug: percent} (the Talisman's damage and damage Preys, added per creature); killTime: the share of the hunt spent
// killing (null: KILL_TIME; 0 where respawn is the limit). 1 with no bonus.
export function killMult(shares, bonuses, killTime) {
  const b = bonuses || {}, sh = shares || {}, f = killTime == null ? KILL_TIME : Math.min(1, Math.max(0, Number(killTime) || 0));
  let cut = 0;
  Object.keys(b).forEach((k) => { const d = (Number(b[k]) || 0) / 100; if (d > 0) cut += (sh[k] || 0) * d / (1 + d); });
  return cut > 0 && f > 0 ? 1 / (1 - f * cut) : 1;
}

// The chance a kill of this creature brings its first Echo Warden kill: raid chance × the share of raids a Warden
// leads (higher once the bestiary is done).
const wardenShare = (entry) => (entry.bestiaryDone ? RAID.wardenShareDone : RAID.wardenShare);

// c: a catalog creature. rec: its working numbers {kph, xph, pph, spot} plus its entry's bestiaryDone, bestiaryKills
// (the typed kill count, when there is one: bestiaryRate) and wardenDone.
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
//   entries     slug → entry {bestiaryDone, bestiaryKills, wardenDone}, for those other creatures
//   talismanDamage  the Talisman's damage bonus in percent: the creature's kill rate at its spot, and the spot's exp
//                  and profit with it, are raised by killMult (its share of that spot), unless its numbers come from
//                  hunts logged on its bounty before bonuses were recorded (rec.taskBonus)
//   killTime    (spot name) -> the share of a hunt there spent killing, or null for the default (killMult)
//   hpTable     slug -> hit points, for the creature's share of the killing at its spot (hpShares)
//   catalog     makeCatalog(...), for those other creatures' classes and rarity
//   weeklyXph   (spot, hours, slug, kills) → weekly reward share per hour, or null when there are no weekly tasks
// Returns {hours, rewardXph, weeklyXph, xp, profit, talismanLoot, killBonus? (what the Talisman's damage adds to the
// kill rate, as a fraction, when it does), bestiaryCharm?, wardenCharm?, otherCharm?, charm, bounty}; a metric is null
// when its numbers are missing.
export function metrics(c, rec, ctx) {
  rec = rec || {};
  const diff = ctx.diff, t = TASK[diff], m = {};
  // The Talisman's damage on this creature: faster kills at its spot, by its share of what dies there.
  const td = Number(ctx.talismanDamage) || 0, at0 = rec.spot && ctx.spotKph && ctx.spotKph[rec.spot];
  const dShare = at0 && at0[c.slug] > 0 ? hpShares(at0, ctx.hpTable, ctx.expTable)[c.slug] : rec.share;
  const km = td > 0 && !rec.taskBonus && rec.kph > 0 && dShare > 0 ? killMult({ [c.slug]: dShare }, { [c.slug]: td }, ctx.killTime ? ctx.killTime(rec.spot) : null) : 1;
  if (km > 1) { rec = Object.assign({}, rec, { kph: rec.kph * km, xph: rec.xph != null ? rec.xph * km : rec.xph, pph: rec.pph != null ? rec.pph * km : rec.pph }); m.killBonus = km - 1; }
  const kph = rec.kph;
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
    m.talismanLoot = eco.lph * km * (expShares(at, ctx.expTable)[c.slug] || 0) * tl / 100;
    m.profit += m.talismanLoot;
  }
  const b = bestiaryOf(c), bonus = Number(ctx.bestiaryBonus) || 0, raidP = ctx.raidP;
  const wardenOpen = !rec.wardenDone && !c.r && raidP > 0;
  if (kph != null) {
    m.bestiaryCharm = bestiaryRate(c, rec, kph * (1 + bonus / 100), 1);
    m.wardenCharm = wardenOpen ? kph * raidP * wardenShare(rec) * b.warden : 0;
    // Hunting a spot also progresses the bestiary (and Echo Warden chances) of everything else killed there. The
    // Talisman's double-bestiary chance only applies to the bounty creature itself.
    let others = 0;
    const sk = rec.spot && ctx.spotKph && ctx.spotKph[rec.spot];
    if (sk) Object.keys(sk).forEach((key) => {
      const o = key !== c.slug && ctx.catalog.bySlug[key];
      if (!o) return;
      const ok = sk[key], orec = (ctx.entries && ctx.entries[key]) || {}, ob = bestiaryOf(o);
      others += bestiaryRate(o, orec, ok, 1);
      if (!orec.wardenDone && !o.r && raidP > 0) others += ok * raidP * wardenShare(orec) * ob.warden;
    });
    m.otherCharm = others;
    m.charm = m.bestiaryCharm + m.wardenCharm + others;
  } else m.charm = rec.bestiaryDone && !wardenOpen ? 0 : null;
  m.bounty = hours ? t.points * mult / hours : null;
  return m;
}
