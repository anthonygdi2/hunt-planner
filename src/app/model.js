// The app's model of one character at one moment: compute()'s result plus the functions screens and view models need
// on top of it (numbers per creature, the reroll model, weekly tasks, the planner). Everything is a function of the
// state, the derived values and `now`, so the same model backs the screens, the view models and the golden capture.
import { VOCATIONS, SLOTS } from "../data/rules.js";
import { compute } from "./compute.js";
import { readSources, readSettings, readGoal, readBounty } from "../store/schema.js";
import { norm } from "../core/text.js";
import { effective } from "../core/numbers.js";
import { metrics } from "../core/metrics.js";
import { poolModel as corePoolModel, readReroll, solvePlan, planKey } from "../core/reroll.js";
import { scoringWeights } from "../core/score.js";
import { weeklyBonus as coreWeeklyBonus, serverDay } from "../core/weekly.js";
import { weeklyState, weeklyTaskRows, openWeeklyTasks } from "./weekly.js";
import { spotIndex as coreSpotIndex, spotNumbers, lensCheck as coreLensCheck } from "../core/spots.js";
import { noNumsWhy as coreNoNumsWhy } from "../core/explain.js";
import { heldTask as coreHeldTask, spotValue as coreSpotValue, scaleSpots, spotScores as coreSpotScores, planOffers as corePlanOffers,
  planOptions as corePlanOptions, planChain as corePlanChain, todayFactor as coreTodayFactor } from "../core/plan.js";
import { GOAL_KEYS } from "../core/score.js";
import { EN } from "../core/i18n.js";

// A reroll plan cache shared across models (solvePlan is the slow part); keyed by planKey.
export function makePlanCache() { return { key: "", plan: null }; }

// state: compute()'s state plus {creatures (shared creature settings), planner {state, marks, occupancy}, spotMeta,
// expTable (PL_EXP)}. derived: compute(state, now), or null to compute it here. opts.planCache: makePlanCache().
export function makeModel(state, derived, now, opts) {
  const d = derived || compute(state, now), p = state.profile || {}, catalog = state.catalog, entries = state.entries, t = state.t || EN;
  const cache = (opts && opts.planCache) || makePlanCache(), at = new Date(now);
  const pl = state.planner || {}, plState = pl.state || {};
  const vocation = p.vocation || VOCATIONS[0], sources = readSources(p), refOn = sources.reference && state.reference.length > 0, otherOn = refOn && sources.otherVocation;
  const settings = readSettings(p, plState);

  const weights = () => scoringWeights(readGoal(p));
  const chalRates = () => (p.chalRates && typeof p.chalRates === "object" ? p.chalRates : {});
  const slots = () => {
    const sl = p.slots || {}, known = (x) => catalog.bySlug[x];
    return { preferred: Array.isArray(sl.preferred) ? sl.preferred.filter(known).slice(0, SLOTS.max) : [],
      unwanted: Array.isArray(sl.unwanted) ? sl.unwanted.filter(known).slice(0, SLOTS.max) : [] };
  };
  const minLevelFor = (c) => { const doc = (state.creatures || {})[c.slug], v = doc && doc.minLevel && doc.minLevel[vocation]; return typeof v === "number" && v > 0 ? v : null; };
  const lockedFor = (c) => { const ml = minLevelFor(c), lvl = Number(p.level) || 0; return !!(ml && lvl && lvl < ml); };
  const ratingOf = (c) => { const r = entries[c.slug]; return (r && r.rating) || null; };
  const eff = (c) => effective(entries[c.slug], d.derived[c.slug]);
  const metricsFor = (c, rec, diff, kills, mult, rewardExp) => metrics(c, rec, Object.assign(d.ctx(diff), { kills, mult, rewardExp }));
  const boardDiff = () => (state.difficulty === "all" ? "master" : state.difficulty);
  // The bounty (store readBounty): difficulty, reroll tokens, offers or the active bounty.
  const bounty = () => readBounty(plState, p, { known: (s) => !!catalog.bySlug[s], slugOf: (name) => { const c = catalog.byName[norm(name || "")]; return c ? c.slug : null; } });
  // Reroll settings: tokens from the bounty; hours per day and the unknown-creature assumption from the profile.
  const rerollSettings = () => { const b = bounty(); return readReroll(Object.assign({}, p.reroll, { left: b.tokens })); };
  const poolModels = {};
  const poolModel = (diff) => {
    if (!(diff in poolModels)) {
      const sl = slots();
      poolModels[diff] = corePoolModel(diff, { weights: weights(), preferred: sl.preferred, unwanted: sl.unwanted, unknown: rerollSettings().unknown,
        rewardObs: (p.rewardObs || {})[diff] || [],
        pool: catalog.poolOf(diff).map((c) => ({ it: c, e: eff(c), blocked: ratingOf(c) === "X" || lockedFor(c) })),
        metricsFor: (it, e, kills, mult) => metricsFor(it, e, diff, kills, mult) });
    }
    return poolModels[diff];
  };
  const rerollPlan = (model, hpd) => {
    const key = planKey(model, hpd);
    if (cache.key !== key) { cache.key = key; cache.plan = solvePlan(model, hpd); }
    return cache.plan;
  };
  // The offers being chosen from (none once a bounty is picked), as {slug, name, kills, kind, exp}.
  const boardOffers = () => {
    const b = bounty();
    return b.mode === "active" ? [] : b.offers.map((o) => Object.assign({ name: o.slug && catalog.bySlug[o.slug] ? catalog.bySlug[o.slug].name : "" }, o));
  };

  // Weekly kill tasks.
  const weekly = () => weeklyState(p, state.sessions, catalog, at);
  const weeklyRows = () => weeklyTaskRows(weekly(), catalog);
  const openWeeklies = () => openWeeklyTasks(weekly(), catalog);
  const weeklyBonus = (spot, hours, selfSlug, selfKills) => coreWeeklyBonus(d.weeklyNow, spot && d.spotKph[spot], hours, selfSlug, selfKills);

  // The planner.
  // The active bounty as the plan values it: {slug, kills, done (kills − kills left), killsLeft, kind, exp}; null while
  // choosing offers.
  const held = () => {
    const a = bounty().active;
    if (!a || bounty().mode !== "active") return null;
    const kills = a.kills || a.killsLeft;
    return { slug: a.slug, kills, done: kills != null && a.killsLeft != null ? kills - a.killsLeft : 0, killsLeft: a.killsLeft, kind: a.kind, exp: a.exp };
  };
  const today = () => {
    // The boosted creature changes at every server save, so yesterday's entry doesn't count.
    const t = plState.today || {};
    return { boosted: t.boostedDay === serverDay(now) ? t.boosted : null, prey: t.prey || [], event: t.event || 0 };
  };
  const todayFactor = (kph, td) => coreTodayFactor(kph, td, { catalog, expTable: state.expTable, t });
  const spotIndex = () => coreSpotIndex({ reference: state.reference, sessions: state.sessions, catalog, spotMeta: state.spotMeta, userSpots: state.userSpots });
  const spotNums = (sp) => spotNumbers(sp, { catalog, xpMode: p.xpMode, refOn, otherOn, picks: d.picks, calib: d.calib, calibOther: d.calibOther, vocation, xpBoost: d.xpBoost });
  const heldTask = (h, diff) => coreHeldTask(h, diff, { catalog, chalRates: chalRates() });
  const spotValue = (sp, o) => {
    o = o || {};
    const nums = spotNums(sp);
    if (!nums) return null;
    return coreSpotValue(sp, nums, { hours: o.hours, held: o.held, diff: o.diff || boardDiff(), today: o.today, travel: o.travel, weekly: o.weekly || openWeeklies() },
      { catalog, chalRates: chalRates(), entries, bestiaryBonus: p.bestiaryBonus, raidP: d.raidP, expTable: state.expTable, t });
  };
  const scaleArgs = (diff) => { const w = weights(); return { weights: w, model: GOAL_KEYS.some((k) => w[k] > 0) ? poolModel(diff) : null }; };
  const plScale = (values, diff) => scaleSpots(values, scaleArgs(diff));
  const spotScores = (values, diff) => coreSpotScores(values, scaleArgs(diff || boardDiff()));
  const planOffers = (board, h, diff) => corePlanOffers(board, h, diff, catalog);
  const lensCheck = (sp, lens) => coreLensCheck(sp, lens, { level: p.level, vocation, otherOn });
  const noNumsWhy = (sp) => coreNoNumsWhy(sp, { level: p.level, vocation, refOn, otherOn, t });
  const planOptions = (o) => {
    o = o || {};
    const diff = o.diff || boardDiff(), H = o.hours > 0 ? o.hours : null, wk = o.weekly || openWeeklies();
    const offers = planOffers(o.offers || boardOffers(), o.held, diff), idx = o.index || spotIndex();
    const po = corePlanOptions({ index: idx, offers, hours: H, team: o.team,
      inLens: (sp) => lensCheck(sp, o.lens),
      valueAt: (sp, offer) => spotValue(sp, { hours: H, held: offer, diff, weekly: wk, today: o.today, travel: o.travel }),
      scale: (all) => plScale(all, diff) });
    po.diff = diff;
    return po;
  };
  const planChain = (o) => {
    o = o || {};
    const set = rerollSettings(), po = planOptions(o);
    return corePlanChain(po, { t, diff: po.diff, now: o.now != null ? o.now : now, marks: o.marks, tokens: o.tokens != null ? o.tokens : set.left,
      tokensUnknown: o.tokensUnknown, hpd: set.hpd, solve: rerollPlan, occupancy: o.occupancy, world: o.world, markMinutes: settings.takenMinutes });
  };
  // The planner's own context for planChain and planOptions: its saved session length, difficulty, held offer, today's
  // bonuses, travel times, occupancy and world (from the character settings).
  const plannerCtx = (extra) => Object.assign({ hours: plState.fixedHours, tokensUnknown: !rerollSettings().hasLeft, diff: bounty().difficulty, held: held(), today: today(),
    travel: plState.travel, occupancy: pl.occupancy, world: settings.world }, extra || {});

  return { derived: d, now, sources, settings, bounty, weights, chalRates, slots, minLevelFor, lockedFor, ratingOf, eff, metricsFor, boardDiff, rerollSettings, poolModel, rerollPlan,
    boardOffers, weekly, weeklyRows, openWeeklies, weeklyBonus, held, today, todayFactor, spotIndex, spotNums, heldTask, spotValue, plScale, spotScores,
    planOffers, lensCheck, noNumsWhy, planOptions, planChain, plannerCtx };
}
