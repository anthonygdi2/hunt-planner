// Preferred and Unwanted lists: board odds and suggestions. Odds follow the community model in rules.js (Preferred
// creatures weighted, Unwanted ones removed, three offers per board). Unofficial.
import { SLOTS } from "../data/rules.js";

// pool: the difficulty's pool [{slug}]; slots {preferred, unwanted} (slugs); isGood(slug): a creature worth getting
// (S or A for the goal, not avoided, not above the character's level). Returns {poolSize, unwanted, preferred (slots
// that are in the pool), N (pool after Unwanted), W (total draw weight)} and, with Preferred creatures, pAny (a board
// shows at least one), pEach (one given Preferred creature), pBase (that creature without a slot); with good creatures,
// good (how many) and pGood (a board shows at least one).
export function slotOdds(pool, slots, isGood) {
  const inPool = {};
  pool.forEach((c) => { inPool[c.slug] = 1; });
  const unw = slots.unwanted.filter((s) => inPool[s]), pref = slots.preferred.filter((s) => inPool[s]);
  const PW = SLOTS.preferredWeight, OFFERS = SLOTS.offers;
  const N = pool.length - unw.length, k = pref.length, W = N + (PW - 1) * k;
  const out = { poolSize: pool.length, unwanted: unw.length, preferred: k, N, W };
  if (k) {
    out.pAny = 1 - Math.pow(1 - PW * k / W, OFFERS);
    out.pEach = 1 - Math.pow(1 - PW / W, OFFERS);
    out.pBase = 1 - Math.pow(1 - 1 / N, OFFERS);
  }
  const good = pool.filter((c) => unw.indexOf(c.slug) === -1 && isGood(c.slug));
  if (good.length) {
    const wg = good.reduce((a, c) => a + (pref.indexOf(c.slug) !== -1 ? PW : 1), 0);
    out.good = good.length;
    out.pGood = 1 - Math.pow(1 - wg / W, OFFERS);
  }
  return out;
}

// Creatures to suggest for a list, best first, at most n: [{it, key, why}]. pool: creatures [{slug, name}]; taken:
// slugs already in either list; info(it) → {avoided, locked, minLevel, score: {tier, rel} or undefined}. Preferred: S, A
// or B creatures that aren't avoided or above level, by score. Unwanted: avoided, then above level, then D creatures
// (lowest score first).
export function slotSuggestions(which, pool, taken, info, n) {
  const scored = pool.filter((it) => taken.indexOf(it.slug) === -1).map((it) => {
    const x = info(it), sc = x.score;
    let key, why;
    if (which === "preferred") {
      if (x.avoided || x.locked || !sc || sc.tier === "C" || sc.tier === "D") return null;
      key = sc.rel; why = "Score " + sc.tier;
    } else {
      if (x.avoided) { key = 3; why = "Avoided"; }
      else if (x.locked) { key = 2; why = "Needs level " + x.minLevel; }
      else if (sc && sc.tier === "D") { key = 1 + (1 - sc.rel) / 2; why = "Score D"; }
      else return null;
    }
    return { it, key, why };
  }).filter(Boolean);
  scored.sort((a, b) => b.key - a.key || a.it.name.localeCompare(b.it.name));
  return scored.slice(0, n);
}
