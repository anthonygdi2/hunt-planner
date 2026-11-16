// The compute pipeline (docs/ARCHITECTURE.md): one pure function from the app's state to everything derived from it.
// Each stage is a core call whose output feeds the next.
import { VOCATIONS } from "../data/rules.js";
import { readSources, readGoal, readHuntSources, readTalisman } from "../store/schema.js";
import { topPool } from "../core/catalog.js";
import { raidRate, spotRates, sessionSpot, xpField, deriveRates } from "../core/rates.js";
import { splitHunts } from "../core/spots.js";
import { norm, slugify } from "../core/text.js";
import { pickReference, calibrate, referenceSpots, referenceUse } from "../core/reference.js";
import { weeklyBonus } from "../core/weekly.js";
import { weeklyState, openWeeklyTasks } from "./weekly.js";
import { metrics } from "../core/metrics.js";
import { pickSpot, effective } from "../core/numbers.js";
import { scoringWeights, scoreList, tierScores } from "../core/score.js";

// A character's own hunts among the shared ones: those it logged (by.pid), all of them without a pid.
export const ownHunts = (sessions, pid) => (pid ? sessions.filter((x) => !x.by || !x.by.pid || x.by.pid === pid) : sessions);

// state: {catalog (makeCatalog), reference (REFERENCE), profile (the active character's profile document, {} for
// none), pid (its id), sessions (every logged hunt in the storage, shared by all characters, store readHunts),
// userSpots (the spots made for them), entries (slug → entry), advanced (advanced mode: weekly tasks count),
// difficulty ("all" or a task difficulty: the tier list's), planner {state {noAccess}} (optional: the spots the
// character can't go to, spot id → true; a creature's numbers never come from one)}. now: ms.
// Returns {hunts (splitHunts: the hunts that count for the character, and why the rest don't), huntCtx (huntCheck's
// ctx for it), raidP, raidInfo, picks, calib, calibOther, xpBoost, spotKph, spotEco, refActive, refSpotSrc, weeklyNow,
// derived (slug → pickSpot result, fromRef for reference picks), refShadow, metrics, scores (relative), tiers, ctx}.
// ctx(diff) is the metrics context for a difficulty, for callers that need more metrics on the same state.
export function compute(state, now) {
  const { catalog, reference, entries, advanced, difficulty } = state, p = state.profile || {};
  const vocation = p.vocation || VOCATIONS[0], sources = readSources(p), refOn = sources.reference && reference.length > 0, otherOn = refOn && sources.otherVocation;

  // Only the hunts that count for the character feed its numbers, whichever character logged them: logged as its
  // vocation (unless hunts as other vocations are on), near its level, at spots its level reaches.
  const huntCtx = Object.assign({ vocation, level: p.level }, readHuntSources(p));
  const hunts = splitHunts({ reference, sessions: state.sessions, catalog, userSpots: state.userSpots }, huntCtx);
  const sessions = hunts.use;

  const raid = raidRate(sessions, catalog);
  const picks = pickReference(reference, { vocation, level: p.level, enabled: refOn, older: sources.older });
  const cal = calibrate(sessions, picks, catalog);

  // Spot rates: the character's logged spots, then the reference spots it hasn't logged.
  const logged = spotRates(sessions, catalog, sessionSpot, xpField(p.xpMode), state.expTable), spotKph = {}, spotEco = {}, refSpotSrc = {};
  Object.keys(logged).forEach((s) => { spotKph[s] = logged[s].kph; spotEco[s] = { xph: logged[s].xph, pph: logged[s].pph, lph: logged[s].lph }; });
  const refActive = referenceSpots({ picks, calib: cal.calib, calibOther: cal.calibOther, sessions, loggedSpots: spotKph, vocation, otherOn,
    xpMode: p.xpMode, xpBoost: cal.xpBoost, catalog });
  refActive.forEach((a) => {
    if (!a.active) return;
    spotKph[a.e.spot] = a.n.kph;
    spotEco[a.e.spot] = { xph: a.n.xph, pph: a.n.pph, lph: a.n.lph };
    refSpotSrc[a.e.spot] = a.n.src;
  });

  // Open weekly tasks count only in advanced mode.
  const weeklyNow = advanced ? openWeeklyTasks(weeklyState(p, ownHunts(sessions, state.pid), catalog, new Date(now)), catalog) : [];

  const weights = scoringWeights(readGoal(p)), chalRates = p.chalRates && typeof p.chalRates === "object" ? p.chalRates : {};
  const weeklyXph = weeklyNow.length ? (spot, hours, slug, kills) => weeklyBonus(weeklyNow, spot && spotKph[spot], hours, slug, kills) : null;
  const tal = readTalisman(p);
  const ctx = (diff) => ({ diff, chalRates, bestiaryBonus: tal.bestiary, talismanLoot: tal.loot, raidP: raid.p, spotKph, spotEco, expTable: state.expTable, entries, catalog, weeklyXph });
  const diffFor = (c) => (difficulty !== "all" ? difficulty : topPool(c));
  const choose = (c, spots, pin) => { const d = diffFor(c); return pickSpot(spots, pin, { metricFor: (x) => metrics(c, x, ctx(d)), weights }); };

  // Spots the character can't go to, by the name a record carries: a reference or logged spot's id is its name as a
  // slug, a spot the player made has its own id.
  const noAccess = (state.planner && state.planner.state && state.planner.state.noAccess) || {}, users = state.userSpots || {};
  const blockedNames = {};
  Object.keys(noAccess).forEach((id) => { if (users[id] && users[id].name) blockedNames[norm(users[id].name)] = true; });
  const canGo = (rec) => !rec.spot || !(noAccess[slugify(rec.spot)] || blockedNames[norm(rec.spot)]);

  // Each creature's numbers: its logged spots, else reference spots.
  const rates = deriveRates(sessions, { catalog, xpMode: p.xpMode, expTable: state.expTable }), derived = {};
  Object.keys(rates).forEach((slug) => { rates[slug] = rates[slug].filter(canGo); if (!rates[slug].length) delete rates[slug]; });
  Object.keys(rates).forEach((slug) => { derived[slug] = choose(catalog.bySlug[slug], rates[slug], (entries[slug] || {}).pinSpot); });
  const ref = referenceUse(refActive.filter((a) => canGo(a.e)), derived, entries);
  Object.keys(ref.use).forEach((slug) => {
    derived[slug] = choose(catalog.bySlug[slug], ref.use[slug], (entries[slug] || {}).pinSpot);
    derived[slug].fromRef = true;
  });

  // Scores and tiers for the difficulty's pool.
  const res = scoreList(catalog.poolOf(difficulty), (c) => metrics(c, effective(entries[c.slug], derived[c.slug]), ctx(diffFor(c))), weights);
  const tiers = tierScores(res.scores);

  return { hunts, huntCtx, raidP: raid.p, raidInfo: raid.info, picks, calib: cal.calib, calibOther: cal.calibOther, xpBoost: cal.xpBoost, spotKph, spotEco, refActive,
    refSpotSrc, weeklyNow, derived, refShadow: ref.shadow, metrics: res.metrics, scores: tiers.rel, tiers: tiers.tier, ctx };
}
