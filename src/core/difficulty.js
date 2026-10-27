// Which bounty difficulty suits the goal: each difficulty's Task board valued by the reroll model (reroll.js) on one
// scale, as the long-run goal value per hunting hour of taking or rerolling the way the plan does.
import { DIFFICULTIES } from "../data/rules.js";
import { RHO } from "./reroll.js";

// A difficulty is compared only when at least this share of its pool has numbers (the rest count as the reroll
// model's unknown-creature value), and suggested only when it beats the current one by this much.
export const MIN_COVERAGE = 0.25;
export const SUGGEST_GAIN = 0.1;

// models: {diff: reroll.js poolModel on a common scale, or null}; solve(model) → solvePlan's result; tokens (0..10);
// current (the difficulty set now); active (a bounty is being hunted: switching is free, the next board uses it;
// otherwise seeing another difficulty's board takes a token). Returns {current, rows [{diff, size, known, coverage,
// enough, cost (tokens to switch now), needsToken, rate (value per hour), gain (vs the current one, or null)}], best
// (a difficulty worth switching to, or null), free (switching costs nothing now)}.
export function compareDifficulties(models, solve, { tokens, current, active }) {
  const rows = DIFFICULTIES.map((diff) => {
    const m = models[diff], size = m ? m.rows.length : 0, known = m ? m.known : 0, coverage = size ? known / size : 0;
    const enough = !!(m && m.pts && m.best > 0 && coverage >= MIN_COVERAGE);
    const cost = diff === current || active ? 0 : 1, s = tokens - cost;
    return { diff, size, known, coverage, enough, cost, needsToken: enough && s < 0, rate: enough && s >= 0 ? RHO * solve(m).h[s] : null };
  });
  const cur = rows.filter((r) => r.diff === current)[0], base = cur && cur.rate > 0 ? cur.rate : null;
  rows.forEach((r) => { r.gain = base && r.rate != null ? r.rate / base - 1 : null; });
  const others = rows.filter((r) => r.diff !== current && r.rate > 0 && (base ? r.gain >= SUGGEST_GAIN : true)).sort((a, b) => b.rate - a.rate);
  return { current, rows, best: others.length ? others[0].diff : null, free: !!active };
}
