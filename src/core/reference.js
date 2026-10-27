// Reference hunts: choosing the entries for a character, calibrating them against its own sessions, and scaling them.
// A character uses the best entry per spot for its vocation (else "any"), preferring post-rebalance ones. Calibration
// compares its clean sessions at reference spots with the reference and scales every reference spot it hasn't logged.
// Any creature with its own numbers (sessions or manual) ignores the reference. Other vocations' hunts are a third
// tier: calibrated per vocation (the character's sessions at spots that vocation also has a reference for), used only
// for creatures with no own numbers and no reference for the character's vocation, and otherwise listed as unused.
import { norm } from "./text.js";
import { sessHours } from "./rates.js";
import { manualNums } from "./numbers.js";

// Calibration ratios are clamped to this range; a spot's profit offset to ± max(its reference profit, this).
export const REF_CLAMP_LO = 0.2, REF_CLAMP_HI = 1.5, REF_PROFIT_CAP = 500000;
export const clampRatio = (r) => Math.min(REF_CLAMP_HI, Math.max(REF_CLAMP_LO, r));

// Ranking between entries for one spot: vocation match, post-rebalance, date, then the highest level setup (one video
// can show a 200+ and a 400+ lap).
export const refRank = (e, voc) => [e.vocation === voc ? 1 : 0, e.source && e.source.postRebalance === false ? 0 : 1, (e.source && e.source.date) || "", e.levelMin || 0];
export function refBeats(a, b, voc) {
  const x = refRank(a, voc), y = refRank(b, voc);
  for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return x[i] > y[i];
  return false;
}
// Spot key → entry, plus the entries in order; spot names take priority over aliases.
export function refIndex(best) {
  const idx = { by: {}, list: [] };
  Object.keys(best).forEach((k) => { idx.list.push(best[k]); idx.by[k] = best[k]; });
  idx.list.forEach((e) => { (e.aliases || []).forEach((a) => { const k = norm(a); if (k && !idx.by[k]) idx.by[k] = e; }); });
  return idx;
}
// An entry needs a higher level than the character's.
export const refTooHigh = (e, level) => { const lvl = Number(level) || 0; return !!(lvl && e.levelMin && lvl < e.levelMin); };
// The entry's profit is dated: recorded before the rebalance or flagged.
export const profitStale = (e) => !!(e.profitStale || (e.source && e.source.postRebalance === false));
export function staleProfitText(e) { const d = e.source && e.source.date; return (d ? "Profit from " + String(d).slice(0, 4) : "Profit") + ", may be out of date"; }

// The entries a character uses: {by (spot key → entry), list, other: {vocation: {by, list}}} for its vocation (and
// "any") and for every other vocation. Entries above its level, or without spot, raw exp/h, creatures or vocation, are
// skipped, and with older false so are entries recorded before the rebalance. Solo by default (Decision 2026-10-26):
// duo and team entries only with team "any". enabled false (reference hunts off, or none at all): nothing.
export function pickReference(reference, { vocation, level, enabled, older, team }) {
  if (!enabled) return { by: {}, list: [], other: {} };
  const best = {}, other = {};
  reference.forEach((e) => {
    if (!e || !e.spot || !(e.rawXph > 0) || !Array.isArray(e.creatures) || !e.vocation || refTooHigh(e, level)) return;
    if (older === false && e.source && e.source.postRebalance === false) return;
    if (team !== "any" && e.team && e.team !== "solo") return;
    const k = norm(e.spot), m = e.vocation === vocation || e.vocation === "any" ? best : (other[e.vocation] || (other[e.vocation] = {}));
    if (!m[k] || refBeats(e, m[k], vocation)) m[k] = e;
  });
  const own = refIndex(best), out = { by: own.by, list: own.list, other: {} };
  Object.keys(other).forEach((v) => { out.other[v] = refIndex(other[v]); });
  return out;
}

// How a character's clean sessions at the spots in `by` compare with the reference. One vote per matched spot, each
// from all clean time logged there, with no minimum length. Ratios are averaged in log space with a prior worth one
// spot at 1.0; the profit offset is averaged the same way and shrunk toward 0. Null when no session matches.
// Returns {kill, exp, offset, nKill, nExp, nProfit, spots [{e, hours, kill, exp, profit, pph}], hours}.
export function calibrateAgainst(sessions, by, catalog) {
  const acc = {};
  sessions.forEach((x) => {
    const h = sessHours(x), e = by[norm((x.spot || "").trim())];
    if (!h || x.breaks || !e || !Array.isArray(x.kills)) return;
    const key = norm(e.spot), a = acc[key] || (acc[key] = { e, hours: 0, raw: 0, bal: 0, kills: {} });
    a.hours += h; a.raw += x.rawXp || 0; a.bal += x.balance || 0;
    x.kills.forEach((k) => { const kk = catalog.killKey(k); a.kills[kk] = (a.kills[kk] || 0) + (k.count || 0); });
  });
  const spots = [];
  let hours = 0, lk = 0, nk = 0, lx = 0, nx = 0;
  Object.keys(acc).forEach((key) => {
    const a = acc[key], e = a.e, s = { e, hours: a.hours, kill: null, exp: null, profit: null, pph: a.bal / a.hours };
    let mine = 0, theirs = 0;
    e.creatures.forEach((c) => { const n = a.kills[c.slug]; if (n > 0 && c.kph > 0) { mine += n / a.hours; theirs += c.kph; } });
    if (theirs > 0) { s.kill = clampRatio(mine / theirs); lk += Math.log(s.kill); nk++; }
    if (a.raw > 0) { s.exp = clampRatio(a.raw / a.hours / e.rawXph); lx += Math.log(s.exp); nx++; }
    hours += a.hours;
    spots.push(s);
  });
  if (!spots.length) return null;
  const K = clampRatio(Math.exp(lk / (nk + 1))), X = clampRatio(Math.exp(lx / (nx + 1)));
  let d = 0, nd = 0;
  spots.forEach((s) => {
    // Newer game systems changed some spawns' loot, so only post-rebalance entries vote on the profit offset.
    if (s.e.profitph == null || profitStale(s.e)) return;
    const cap = Math.max(Math.abs(s.e.profitph), REF_PROFIT_CAP);
    s.profit = Math.max(-cap, Math.min(cap, s.pph - s.e.profitph * K));
    d += s.profit; nd++;
  });
  return { kill: K, exp: X, offset: d / (nd + 1), nKill: nk, nExp: nx, nProfit: nd, spots, hours };
}

// The character's exp bonus: its XP over raw XP across sessions that logged both; 1 when none did.
export function xpBoostOf(sessions) {
  let raw = 0, xp = 0;
  sessions.forEach((x) => { if (x.rawXp > 0 && x.xp > 0) { raw += x.rawXp; xp += x.xp; } });
  return raw > 0 ? xp / raw : 1;
}

// {calib (own vocation, or null), calibOther {vocation: calibration or null}, xpBoost}.
export function calibrate(sessions, picks, catalog) {
  const calibOther = {};
  Object.keys(picks.other).forEach((v) => { calibOther[v] = calibrateAgainst(sessions, picks.other[v].by, catalog); });
  return { calib: picks.list.length ? calibrateAgainst(sessions, picks.by, catalog) : null, calibOther, xpBoost: xpBoostOf(sessions) };
}

// A reference spot's numbers for this character: scaled once calibrated (c), as recorded before that. Exp is
// calibrated in raw terms; XP mode then applies the character's own boost (its XP / raw XP). Dated profit
// (pre-rebalance or flagged profitStale) scales with kills only, without the profit offset. Creatures not in the
// catalog are left out. Returns {src, kph {slug}, total, xph, profitStale, pph}.
export function refNums(e, c, other, { xpMode, xpBoost, catalog }) {
  const K = c ? c.kill : 1, xp = xpMode === "xp", kph = {}, stale = profitStale(e);
  let total = 0, xph = e.rawXph * (c ? c.exp : 1) * (xp ? xpBoost : 1);
  if (!c && xp && e.xph > 0) xph = e.xph;
  e.creatures.forEach((cr) => { if (cr.kph > 0 && catalog.bySlug[cr.slug]) { kph[cr.slug] = cr.kph * K; total += cr.kph; } });
  return { src: other ? (c ? "otherAdj" : "other") : (c ? "refAdj" : "ref"), kph, total: total * K, xph, profitStale: stale,
    pph: e.profitph != null ? e.profitph * K + (c && !stale ? c.offset : 0) : null };
}

// The reference spots the character hasn't logged, with their numbers: [{e, n (refNums), tier "voc" | "other",
// active}]. Active ones join the spot rates (weekly advice, charm from other kills there). Another vocation's spot only
// counts where the character's vocation has no reference, one entry per spot (preferring a vocation the character is
// calibrated against, then the usual ranking); with that tier off (otherOn false) it's kept inactive for the creature
// panel's unused rows. loggedSpots: spot name → anything, the character's own logged spot rates.
export function referenceSpots({ picks, calib, calibOther, sessions, loggedSpots, vocation, otherOn, xpMode, xpBoost, catalog }) {
  const out = [], taken = Object.assign({}, loggedSpots), logged = {}, ownSpot = {}, otherBest = {}, opts = { xpMode, xpBoost, catalog };
  sessions.forEach((x) => {
    const s = norm((x.spot || "").trim());
    [picks.by].concat(Object.keys(picks.other).map((v) => picks.other[v].by)).forEach((by) => { if (by[s]) logged[norm(by[s].spot)] = 1; });
  });
  const add = (e, n, tier, active) => { out.push({ e, n, tier, active }); if (active) taken[e.spot] = n.kph; };
  picks.list.forEach((e) => {
    ownSpot[norm(e.spot)] = 1;
    if (logged[norm(e.spot)] || taken[e.spot]) return;
    add(e, refNums(e, calib, false, opts), "voc", true);
  });
  Object.keys(picks.other).forEach((v) => {
    picks.other[v].list.forEach((e) => {
      const k = norm(e.spot), cur = otherBest[k];
      if (ownSpot[k] || logged[k]) return;
      if (!cur || (!!calibOther[v] !== !!calibOther[cur.vocation] ? !!calibOther[v] : refBeats(e, cur, vocation))) otherBest[k] = e;
    });
  });
  Object.keys(otherBest).forEach((k) => {
    const e = otherBest[k];
    if (taken[e.spot]) return;
    add(e, refNums(e, calibOther[e.vocation], true, opts), "other", otherOn);
  });
  return out;
}

// Which reference spots each creature uses. Creatures with no numbers of their own (no derived rates in `own`, no
// manual numbers in `entries`) take reference spots for their vocation, then other vocations' active spots; the rest
// are listed with the reason ("own", "voc" or "off"). Returns {use: {slug: spot numbers[]}, shadow: {slug: [... with
// unused]}}, slugs in the order the spots list them; choosing among `use` is numbers.js's pickSpot.
export function referenceUse(refActive, own, entries) {
  const bySlug = {}, use = {}, shadow = {};
  refActive.forEach((a) => {
    Object.keys(a.n.kph).forEach((slug) => {
      const k = a.n.kph[slug], g = bySlug[slug] || (bySlug[slug] = { voc: [], other: [], off: [] });
      g[a.tier === "voc" ? "voc" : a.active ? "other" : "off"].push({ spot: a.e.spot, ref: true, src: a.n.src, entry: a.e, kph: Math.round(k),
        share: a.n.total ? k / a.n.total : 0, xph: Math.round(a.n.xph), pph: a.n.pph != null ? Math.round(a.n.pph) : null,
        profitStale: a.n.profitStale, hours: 0, n: 0, nBreak: 0, last: null });
    });
  });
  const unused = (list, why) => list.map((c) => { c.unused = why; return c; });
  Object.keys(bySlug).forEach((slug) => {
    const rec = entries[slug] || {}, g = bySlug[slug];
    let pick = null, sh;
    if (own[slug] || manualNums(rec)) sh = unused(g.voc.concat(g.other, g.off), "own");
    else if (g.voc.length) { pick = g.voc; sh = unused(g.other.concat(g.off), "voc"); }
    else if (g.other.length) { pick = g.other; sh = unused(g.off, "off"); }
    else sh = unused(g.off, "off");
    if (sh.length) shadow[slug] = sh;
    if (pick) use[slug] = pick;
  });
  return { use, shadow };
}
