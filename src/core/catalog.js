// Creature lookup and task pools, built once from creatures.json.
import { norm, slugify } from "./text.js";
import { DIFFICULTIES, POOL_BIT, ALL_POOLS } from "../data/rules.js";

// The pool bitmask for a difficulty, or every pool for "all".
export const poolBits = (diff) => (diff === "all" ? ALL_POOLS : POOL_BIT[diff] || 0);

// Is the creature in that difficulty's task pool ("all": any pool)?
export const creatureInPool = (c, diff) => !!(c && c.m & poolBits(diff));

// The difficulties whose pool has the creature, easiest first.
export const poolsOf = (c) => DIFFICULTIES.filter((d) => c.m & POOL_BIT[d]);

// The hardest pool the creature is in (the difficulty it's scored at under "all").
export const topPool = (c) => (c.m & POOL_BIT.master ? "master" : c.m & POOL_BIT.expert ? "expert" : c.m & POOL_BIT.adept ? "adept" : "beginner");

// creatures: creatures.json records {n, c, m, w?, r?, t?}. Returns
//   list      creatures in file order: {name, key (norm of the name), slug, cls, m, w, r, tier}
//   bySlug    slug → creature
//   byName    norm(name) → creature; also the TibiaWiki title (without a "(...)" suffix) when it differs and no
//             creature has that name
//   inPool(slug, diff), poolOf(diff) → creatures in that pool, in file order
//   killKey(kill)  a logged kill's key: its slug when that's a known creature, else "n:" + norm(its name)
//   nameKey(name)  a typed name's key: the creature's slug when the name matches one, else "n:" + norm(name)
export function makeCatalog(creatures) {
  const list = [], bySlug = {}, byName = {};
  creatures.forEach((d) => {
    const c = { name: d.n, key: norm(d.n), slug: slugify(d.n), cls: d.c, m: d.m, w: d.w, r: d.r, tier: d.t };
    list.push(c);
    bySlug[c.slug] = c;
    byName[c.key] = c;
    if (d.w) { const alt = norm(d.w.replace(/\s*\(.*\)$/, "")); if (!byName[alt]) byName[alt] = c; }
  });
  return {
    list, bySlug, byName,
    inPool: (slug, diff) => creatureInPool(bySlug[slug], diff),
    poolOf: (diff) => list.filter((c) => creatureInPool(c, diff)),
    killKey: (k) => (k.slug && bySlug[k.slug] ? k.slug : "n:" + norm(k.name || "")),
    nameKey: (name) => { const c = byName[norm(name || "")]; return c ? c.slug : "n:" + norm(name || ""); },
  };
}
