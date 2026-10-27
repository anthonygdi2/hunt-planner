// One creature's working numbers and where they come from.
import { scoreList } from "./score.js";

export const NUM_FIELDS = ["kph", "xph", "pph"];

// Has the player typed any numbers of their own into the creature's entry?
export const manualNums = (r) => !!(r && (r.kph != null || r.xph != null || r.pph != null));

// Which of a creature's candidate spots its numbers come from: the pinned one if there is one, else the only one, else
// the one that scores best for the goal (metricFor(spot) → metrics, weights: read weights), else the highest exp/h.
// Returns {spots, best, pinned}.
export function pickSpot(spots, pin, { metricFor, weights }) {
  let best = null;
  if (pin) spots.forEach((c) => { if (c.spot === pin) best = c; });
  if (!best) {
    if (spots.length === 1) best = spots[0];
    else {
      const res = scoreList(spots.map((c, i) => ({ slug: "s" + i, c })), (x) => metricFor(x.c), weights);
      let bs = -Infinity;
      spots.forEach((c, i) => { const v = res.scores["s" + i]; if (v != null && v > bs) { bs = v; best = c; } });
      if (!best) spots.forEach((c) => { if (!best || c.xph > best.xph) best = c; });
    }
  }
  return { spots, best, pinned: !!(pin && best && best.spot === pin) };
}

// The numbers a creature is scored with: the entry (manual numbers win field by field) filled in from its chosen spot
// (pick: pickSpot's result from its sessions or the reference, or undefined). src says where they come from: "own"
// (manual or sessions), or the reference's "refAdj", "ref", "otherAdj", "other". From sessions, numsAt is the last
// clean session (or when the manual numbers were set) and sample/sampleHours describe it when kills/h is derived.
export function effective(entry, pick) {
  const r = entry || {}, d = pick && pick.best;
  if (!d) return manualNums(r) ? Object.assign({ src: "own" }, r) : r;
  const out = Object.assign({}, r);
  NUM_FIELDS.forEach((k) => { if (out[k] == null) out[k] = d[k]; });
  if (d.ref) { out.src = d.src; out.refEntry = d.entry; out.spot = d.spot; out.numsAt = null; out.profitStale = d.profitStale && out.pph != null; return out; }
  out.src = "own";
  out.numsAt = manualNums(r) ? (r.numsAt || r.updatedAt) : d.last;
  out.fromSessions = true;
  out.spot = d.spot;
  if (r.kph == null) { out.sample = d.sample; out.sampleHours = d.sampleHours; }
  return out;
}
