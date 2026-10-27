// The list of spots: reference spots plus the ones a character logged, which ones fit the character, and a spot's
// numbers for it.
import { norm, slugify } from "./text.js";
import { spotRates, xpField } from "./rates.js";
import { refBeats, refNums } from "./reference.js";

// The default lens: a level band around the character's level (a first guess, open question in PLANNER_PLAN.md).
export const LEVEL_BAND = [-100, 150];

// Every spot: reference spots (all vocations and levels, so the lens can filter later), the character's own spots
// (userSpots: {id: {name, parentId?, note?}}; a variation has a parent and is a spot of its own), and spots logged in
// sessions that match none of them. A session with a spotId belongs to that spot; others match by normalized name,
// spot names before aliases. spotMeta: spot id → {travelMin, access, team, notes}. Returns {spots (id → spot), list,
// idOf(name)}; each spot is {id, name, aliases, entries, sessions, names (logged name → count), creatures {slug: 1},
// vocations, teams, levelMin, levelMax, own (only the character's), userMade, parentId, note, meta}.
export function spotIndex({ reference, sessions, catalog, spotMeta, userSpots }) {
  const spots = {}, byKey = {}, list = [];
  const blank = (id, name) => {
    const sp = { id, name, aliases: [], entries: [], sessions: [], names: {}, creatures: {}, vocations: [], teams: [],
      lo: Infinity, hi: 0, own: false, userMade: false, parentId: null, note: null, meta: (spotMeta || {})[id] || {} };
    spots[id] = sp; list.push(sp);
    return sp;
  };
  const addTo = (arr, v) => { if (v && arr.indexOf(v) < 0) arr.push(v); };
  reference.forEach((e) => {
    if (!e || !e.spot) return;
    const id = slugify(e.spot), sp = spots[id] || blank(id, e.spot);
    sp.entries.push(e);
    byKey[norm(e.spot)] = id;
    (e.aliases || []).forEach((a) => { addTo(sp.aliases, a); });
    addTo(sp.vocations, e.vocation);
    addTo(sp.teams, e.team);
    (e.creatures || []).forEach((c) => { if (c && c.slug) sp.creatures[c.slug] = 1; });
    // An entry without a level bound opens that end of the spot's range.
    sp.lo = Math.min(sp.lo, e.levelMin > 0 ? e.levelMin : 0);
    sp.hi = Math.max(sp.hi, e.levelMax > 0 ? e.levelMax : Infinity);
  });
  list.forEach((sp) => { sp.aliases.forEach((a) => { const k = norm(a); if (k && !byKey[k]) byKey[k] = sp.id; }); });
  const users = userSpots || {};
  Object.keys(users).forEach((id) => {
    const u = users[id], sp = spots[id] || blank(id, u.name);
    Object.assign(sp, { own: true, userMade: true, parentId: u.parentId || null, note: u.note || null });
    const k = norm(u.name);
    if (k && !byKey[k]) byKey[k] = id;
  });
  sessions.forEach((x) => {
    const raw = (x.spot || "Unnamed spot").trim(), k = norm(raw);
    let id = x.spotId && spots[x.spotId] ? x.spotId : byKey[k];
    if (!id) { id = byKey[k] = slugify(raw) || "unnamed-spot"; if (!spots[id]) blank(id, raw).own = true; }
    const sp = spots[id];
    sp.sessions.push(x);
    sp.names[raw] = (sp.names[raw] || 0) + 1;
    (x.kills || []).forEach((kl) => { if (kl.slug && catalog.bySlug[kl.slug]) sp.creatures[kl.slug] = 1; });
  });
  list.forEach((sp) => {
    sp.levelMin = sp.lo > 0 && isFinite(sp.lo) ? sp.lo : null;
    sp.levelMax = sp.hi > 0 && isFinite(sp.hi) ? sp.hi : null;
    delete sp.lo; delete sp.hi;
    // A spot only the character knows is named after the name it was logged under most (its own name if it made it).
    if (sp.own && !sp.userMade) Object.keys(sp.names).forEach((n) => { if (sp.names[n] > (sp.names[sp.name] || 0)) sp.name = n; });
  });
  return { spots, list, idOf: (name) => byKey[norm((name || "").trim())] || null };
}

// The character's numbers for a whole spot: its own clean sessions there first, else the reference entry the tier list
// would use (its vocation or "any", then another vocation's), calibrated the same way. Null without either.
// ctx: {catalog, xpMode, refOn, otherOn, picks, calib, calibOther, vocation, xpBoost}.
// Returns {src, kph {slug}, xph, pph, profitStale?, hours, kills, entry}.
export function spotNumbers(sp, ctx) {
  const own = sp.sessions.length ? spotRates(sp.sessions, ctx.catalog, () => sp.id, xpField(ctx.xpMode))[sp.id] : null;
  if (own) return { src: "own", kph: own.kph, xph: own.xph, pph: own.pph, hours: own.hours, kills: own.kills, entry: null };
  if (!ctx.refOn) return null;
  const opts = { xpMode: ctx.xpMode, xpBoost: ctx.xpBoost, catalog: ctx.catalog }, k = norm(sp.name);
  let e = ctx.picks.by[k], n = null;
  if (e && norm(e.spot) === k) n = refNums(e, ctx.calib, false, opts);
  else if (ctx.otherOn) {
    // One other-vocation entry per spot, as referenceSpots picks it: a vocation the character is calibrated against first.
    e = null;
    Object.keys(ctx.picks.other).forEach((v) => {
      const x = ctx.picks.other[v].by[k];
      if (!x || norm(x.spot) !== k) return;
      if (!e || (!!ctx.calibOther[v] !== !!ctx.calibOther[e.vocation] ? !!ctx.calibOther[v] : refBeats(x, e, ctx.vocation))) e = x;
    });
    if (e) n = refNums(e, ctx.calibOther[e.vocation], true, opts);
  }
  return n ? { src: n.src, kph: n.kph, xph: n.xph, pph: n.pph, profitStale: n.profitStale, hours: 0, kills: 0, entry: e } : null;
}

// Whether a spot fits the character: "" when it's in the lens, else "voc" or "level". Logged spots always fit. By
// default: reference spots for its vocation or "any" (any vocation with otherOn or lens.allVocations) whose level range
// overlaps LEVEL_BAND around its level (any level with lens.anyLevel or no level). ctx: {level, vocation, otherOn}.
export function lensCheck(sp, lens, ctx) {
  if (sp.sessions.length) return "";
  lens = lens || {};
  const lvl = Number(ctx.level) || 0, voc = ctx.vocation;
  const es = sp.entries.filter((e) => e.vocation === voc || e.vocation === "any" || lens.allVocations || ctx.otherOn);
  if (!es.length) return "voc";
  if (lens.anyLevel || !lvl) return "";
  const lo = lvl + LEVEL_BAND[0], hi = lvl + LEVEL_BAND[1];
  return es.some((e) => !(e.levelMin > hi) && !(e.levelMax > 0 && e.levelMax < lo)) ? "" : "level";
}
