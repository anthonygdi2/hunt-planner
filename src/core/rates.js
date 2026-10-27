// Rates from logged sessions: per creature and spot, per spot, and the Echo Raid chance.
import { RAID } from "../data/rules.js";

// A session's length in hours, 0 when unknown.
export const sessHours = (x) => (x && x.hours > 0 ? x.hours : 0);
// The spot a session was logged at, as typed ("Unnamed spot" when blank).
export const sessionSpot = (x) => (x.spot || "Unnamed spot").trim();
// The exp field a character's numbers use: "xp" (with bonuses) or "rawXp".
export const xpField = (xpMode) => (xpMode === "xp" ? "xp" : "rawXp");

// The Echo Raid chance per kill: rules' prior blended with the raids logged on sessions (raidsBy {slug: n} or a raids
// total); rare creatures' kills don't count, since they can't start raids. Returns {p, info: {raids, kills, n sessions}
// or null when no session has raids logged}.
export function raidRate(sessions, catalog) {
  let raids = 0, kills = 0, n = 0;
  sessions.forEach((x) => {
    if (!Array.isArray(x.kills)) return;
    const hasBy = x.raidsBy && typeof x.raidsBy === "object", hasTotal = typeof x.raids === "number";
    if (!hasBy && !hasTotal) return;
    n++;
    raids += hasBy ? Object.keys(x.raidsBy).reduce((a, k) => a + (Number(x.raidsBy[k]) || 0), 0) : x.raids;
    x.kills.forEach((k) => { const c = k.slug && catalog.bySlug[k.slug]; if (!(c && c.r)) kills += k.count || 0; });
  });
  return { p: (raids + RAID.priorPerKill * RAID.priorKills) / (kills + RAID.priorKills), info: n ? { raids, kills, n } : null };
}

// Per spot (sessions grouped by keyOf(session)): each creature's kills/h (its share of all kills × the clean kill
// rate, keyed by catalog.killKey), and exp/h (the `mode` field) and profit/h per kill scaled the same way, plus clean
// hours and kills. Spots with no clean time are left out.
export function spotRates(sessions, catalog, keyOf, mode) {
  const acc = {}, out = {};
  sessions.forEach((x) => {
    const h = sessHours(x);
    if (!h || !Array.isArray(x.kills)) return;
    let tot = 0;
    x.kills.forEach((k) => { tot += k.count || 0; });
    if (!tot) return;
    const s = keyOf(x), a = acc[s] || (acc[s] = { kills: {}, total: 0, xp: 0, bal: 0, cTotal: 0, cHours: 0 });
    a.total += tot; a.xp += (x[mode] != null ? x[mode] : (x.rawXp || 0)); a.bal += x.balance || 0;
    x.kills.forEach((k) => { const key = catalog.killKey(k); a.kills[key] = (a.kills[key] || 0) + (k.count || 0); });
    if (!x.breaks) { a.cTotal += tot; a.cHours += h; }
  });
  Object.keys(acc).forEach((s) => {
    const a = acc[s];
    if (!(a.cHours > 0)) return;
    const spk = a.cTotal / a.cHours, kph = {};
    Object.keys(a.kills).forEach((slug) => { kph[slug] = a.kills[slug] / a.total * spk; });
    out[s] = { kph, xph: a.xp / a.total * spk, pph: a.bal / a.total * spk, hours: a.cHours, kills: a.cTotal };
  });
  return out;
}

// Each known creature's numbers at every spot it was logged at: slug → [{spot, taskBonus, n, nBreak, hours, share,
// kph, xph, pph, last, sample, sampleHours}]. The kill rate comes from clean sessions only; exp, profit and kill share
// are taken per kill from every session (breaks included), then scaled by the clean kill rate. When the creature was
// the session's bounty task at a spot (with clean time), only those sessions count there (taskBonus). Creatures
// with no clean time anywhere are left out.
export function deriveRates(sessions, { catalog, xpMode }) {
  const mode = xpField(xpMode), acc = {};
  const blank = () => ({ kills: 0, cKills: 0, total: 0, n: 0, xp: 0, bal: 0, cTotal: 0, cHours: 0, nClean: 0, last: null });
  sessions.forEach((x) => {
    const h = sessHours(x);
    if (!h || !Array.isArray(x.kills)) return;
    let total = 0;
    x.kills.forEach((k) => { total += k.count || 0; });
    if (!total) return;
    const spot = sessionSpot(x), clean = !x.breaks;
    x.kills.forEach((k) => {
      if (!k.slug || !catalog.bySlug[k.slug]) return;
      const c = acc[k.slug] || (acc[k.slug] = {});
      const sp = c[spot] || (c[spot] = { all: blank(), task: blank() });
      [sp.all].concat(x.task === k.slug ? [sp.task] : []).forEach((b) => {
        b.kills += k.count || 0; b.total += total; b.n++;
        if (clean) b.cKills += k.count || 0;
        b.xp += (x[mode] != null ? x[mode] : (x.rawXp || 0)); b.bal += x.balance || 0;
        if (clean) { b.cTotal += total; b.cHours += h; b.nClean++; if (!b.last || x.end > b.last) b.last = x.end; }
      });
    });
  });
  const result = {};
  Object.keys(acc).forEach((slug) => {
    const spots = [];
    Object.keys(acc[slug]).forEach((name) => {
      const sp = acc[slug][name], useTask = sp.task.cHours > 0, b = useTask ? sp.task : sp.all;
      if (!(b.cHours > 0)) return;
      const spotKph = b.cTotal / b.cHours, perKill = (v) => v / b.total * spotKph;
      spots.push({ spot: name, taskBonus: useTask, n: b.n, nBreak: b.n - b.nClean, hours: b.cHours, share: b.kills / b.total,
        kph: Math.round(b.kills / b.total * spotKph), xph: Math.round(perKill(b.xp)), pph: Math.round(perKill(b.bal)), last: b.last, sample: b.cKills, sampleHours: b.cHours });
    });
    if (spots.length) result[slug] = spots;
  });
  return result;
}
