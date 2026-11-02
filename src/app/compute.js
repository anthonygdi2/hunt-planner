// The compute pipeline (docs/ARCHITECTURE.md): one pure function from the app's state to everything derived from it.
// Each stage is a core call whose output feeds the next.
import { VOCATIONS } from "../data/rules.js";
import { readSources, readGoal, readHuntSources } from "../store/schema.js";
import { topPool } from "../core/catalog.js";
import { raidRate, spotRates, sessionSpot, xpField, deriveRates } from "../core/rates.js";
import { splitHunts } from "../core/spots.js";
import { pickReference, calibrate, referenceSpots, referenceUse } from "../core/reference.js";
import { weeklyBonus } from "../core/weekly.js";
import { weeklyState, openWeeklyTasks } from "./weekly.js";
import { metrics } from "../core/metrics.js";
import { pickSpot, effective } from "../core/numbers.js";
import { scoringWeights, scoreList, tierScores } from "../core/score.js";

// state: {catalog (makeCatalog), reference (REFERENCE), profile (the active character's profile document, {} for
// none), sessions (its sessions), userSpots (its own spots), entries (slug → entry), advanced (advanced mode: weekly
// tasks count), difficulty ("all" or a task difficulty: the tier list's)}. now: ms.
// Returns {hunts (splitHunts: the sessions that count, and why the rest don't), raidP, raidInfo, picks, calib, calibOther, xpBoost, spotKph, spotEco, refActive, refSpotSrc, weeklyNow,
// derived (slug → pickSpot result, fromRef for reference picks), refShadow, metrics, scores (relative), tiers, ctx}.
// ctx(diff) is the metrics context for a difficulty, for callers that need more metrics on the same state.
export function compute(state, now) {
  const { catalog, reference, entries, advanced, difficulty } = state, p = state.profile || {};
  const vocation = p.vocation || VOCATIONS[0], sources = readSources(p), refOn = sources.reference && reference.length > 0, otherOn = refOn && sources.otherVocation;

  // Only the hunts that count for the character feed its numbers: logged as its vocation (unless hunts as other
  // vocations are on), at spots its level reaches.
  const hunts = splitHunts({ reference, sessions: state.sessions, catalog, userSpots: state.userSpots }, Object.assign({ vocation, level: p.level }, readHuntSources(p)));
  const sessions = hunts.use;

  const raid = raidRate(sessions, catalog);
  const picks = pickReference(reference, { vocation, level: p.level, enabled: refOn, older: sources.older });
  const cal = calibrate(sessions, picks, catalog);

  // Spot rates: the character's logged spots, then the reference spots it hasn't logged.
  const logged = spotRates(sessions, catalog, sessionSpot, xpField(p.xpMode)), spotKph = {}, spotEco = {}, refSpotSrc = {};
  Object.keys(logged).forEach((s) => { spotKph[s] = logged[s].kph; spotEco[s] = { xph: logged[s].xph, pph: logged[s].pph }; });
  const refActive = referenceSpots({ picks, calib: cal.calib, calibOther: cal.calibOther, sessions, loggedSpots: spotKph, vocation, otherOn,
    xpMode: p.xpMode, xpBoost: cal.xpBoost, catalog });
  refActive.forEach((a) => {
    if (!a.active) return;
    spotKph[a.e.spot] = a.n.kph;
    spotEco[a.e.spot] = { xph: a.n.xph, pph: a.n.pph };
    refSpotSrc[a.e.spot] = a.n.src;
  });

  // Open weekly tasks count only in advanced mode.
  const weeklyNow = advanced ? openWeeklyTasks(weeklyState(p, sessions, catalog, new Date(now)), catalog) : [];

  const weights = scoringWeights(readGoal(p)), chalRates = p.chalRates && typeof p.chalRates === "object" ? p.chalRates : {};
  const weeklyXph = weeklyNow.length ? (spot, hours, slug, kills) => weeklyBonus(weeklyNow, spot && spotKph[spot], hours, slug, kills) : null;
  const ctx = (diff) => ({ diff, chalRates, bestiaryBonus: p.bestiaryBonus, raidP: raid.p, spotKph, entries, catalog, weeklyXph });
  const diffFor = (c) => (difficulty !== "all" ? difficulty : topPool(c));
  const choose = (c, spots, pin) => { const d = diffFor(c); return pickSpot(spots, pin, { metricFor: (x) => metrics(c, x, ctx(d)), weights }); };

  // Each creature's numbers: its logged spots, else reference spots.
  const rates = deriveRates(sessions, { catalog, xpMode: p.xpMode }), derived = {};
  Object.keys(rates).forEach((slug) => { derived[slug] = choose(catalog.bySlug[slug], rates[slug], (entries[slug] || {}).pinSpot); });
  const ref = referenceUse(refActive, derived, entries);
  Object.keys(ref.use).forEach((slug) => {
    derived[slug] = choose(catalog.bySlug[slug], ref.use[slug], (entries[slug] || {}).pinSpot);
    derived[slug].fromRef = true;
  });

  // Scores and tiers for the difficulty's pool.
  const res = scoreList(catalog.poolOf(difficulty), (c) => metrics(c, effective(entries[c.slug], derived[c.slug]), ctx(diffFor(c))), weights);
  const tiers = tierScores(res.scores);

  return { hunts, raidP: raid.p, raidInfo: raid.info, picks, calib: cal.calib, calibOther: cal.calibOther, xpBoost: cal.xpBoost, spotKph, spotEco, refActive,
    refSpotSrc, weeklyNow, derived, refShadow: ref.shadow, metrics: res.metrics, scores: tiers.rel, tiers: tiers.tier, ctx };
}
