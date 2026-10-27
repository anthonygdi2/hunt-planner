// Taken marks and how often a spot is free.

// A mark ({state, at}) counts for this many minutes (the Taken length setting will replace it in F4).
export const MARK_MINUTES = 45;
// Minutes lost checking a taken spot with no travel time of its own.
export const CHECK_MINUTES = 10;

// Minutes since a mark was set at `now` (ms); Infinity without a time.
export function markAge(m, now) { const t = m && m.at ? new Date(m.at).getTime() : NaN; return isFinite(t) ? Math.max(0, (now - t) / 6e4) : Infinity; }
// Is the mark still in effect?
export const markActive = (m, now, minutes) => !!m && markAge(m, now) <= (minutes || MARK_MINUTES);

// The key of a world and UTC hour in a spot's counts: "world|hour".
export function occKey(world, hour) { return String(world || "").trim().toLowerCase() + "|" + hour; }

// The chance a spot is free near `now`'s UTC hour (±1 h) on a world, from counts of Free and Taken marks per spot
// ({spotId: {counts: {"world|hour": [free, taken]}}}). Smoothed toward the spot's rate at all hours, and that toward
// the world's rate across spots (Beta priors worth 2 marks each), so a spot with no marks gets the world's rate.
// Returns {p (0.02..0.98), free, n (marks near this hour), freeAll, nAll}.
export function occOdds(occ, spotId, world, now) {
  const w = String(world || "").trim().toLowerCase(), h = new Date(now).getUTCHours();
  let F = 0, N = 0;
  const tally = (counts, fn) => { Object.keys(counts || {}).forEach((k) => { const i = k.lastIndexOf("|"); if (k.slice(0, i) === w) fn(Number(k.slice(i + 1)), counts[k][0] || 0, counts[k][1] || 0); }); };
  Object.keys(occ || {}).forEach((id) => { tally(occ[id].counts, (hh, f, t) => { F += f; N += f + t; }); });
  const pWorld = (F + 1) / (N + 2);
  let fs = 0, ns = 0, fh = 0, nh = 0;
  tally(occ && occ[spotId] && occ[spotId].counts, (hh, f, t) => {
    const d = Math.abs(hh - h);
    fs += f; ns += f + t;
    if (Math.min(d, 24 - d) <= 1) { fh += f; nh += f + t; }
  });
  const pSpot = (fs + 2 * pWorld) / (ns + 2), pv = (fh + 2 * pSpot) / (nh + 2);
  return { p: Math.min(0.98, Math.max(0.02, pv)), free: fh, n: nh, freeAll: fs, nAll: ns };
}

// Expected value of checking spots in this order ([{v, odds: {p}, travelMin}]) and hunting the first free one: a taken
// spot costs the trip there (its travel minutes, else CHECK_MINUTES) out of a session of `hours`; if all are taken,
// the fallback (a reroll's worth) is left.
export function orderValue(list, hours, fallback) {
  let reach = 1, left = 1, e = 0;
  list.forEach((o) => {
    e += reach * left * o.odds.p * o.v;
    reach *= 1 - o.odds.p;
    left *= Math.max(0.1, 1 - (o.travelMin > 0 ? o.travelMin : CHECK_MINUTES) / 60 / hours);
  });
  return e + reach * left * (fallback || 0);
}
// Starting from best value first, swap neighbours while that raises the expected value. With equal odds and trips it
// stays best value first; a spot that's usually free or close can move ahead of a slightly better one.
export function orderByOdds(list, hours, fallback) {
  let out = list.slice(), better = true, guard = 0;
  while (better && guard++ < 100) {
    better = false;
    for (let i = 0; i + 1 < out.length; i++) {
      const sw = out.slice(); sw[i] = out[i + 1]; sw[i + 1] = out[i];
      if (orderValue(sw, hours, fallback) > orderValue(out, hours, fallback) + 1e-9) { out = sw; better = true; }
    }
  }
  return out;
}
