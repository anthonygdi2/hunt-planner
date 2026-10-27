// The golden capture without a page: everything tests/golden.test.js records for each character, difficulty and goal
// (facts, creature numbers, the Task board model, planner chains, spot values), computed by app/model.js from the
// fixture backup's documents read through the store readers, with the clock at `now`. UI text isn't part of it.
import { makeCatalog } from "../../src/core/catalog.js";
import { slugify } from "../../src/core/text.js";
import { rewardPerKill } from "../../src/core/rewards.js";
import { weightedValue } from "../../src/core/score.js";
import { readRecords, readSessions, readCreatureDocs, readPlState, readMarks, readOccs, readUserSpots } from "../../src/store/schema.js";
import { makeModel, makePlanCache } from "../../src/app/model.js";

// The goal mixer's presets (F2), each captured as the character's goal.
export { PRESETS as GOALS } from "../../src/core/score.js";
import { PRESETS as GOALS } from "../../src/core/score.js";
export const DIFFS = ["all", "beginner", "adept", "expert", "master"];
const M_KEYS = ["hours", "rewardXph", "weeklyXph", "xp", "profit", "bestiaryCharm", "wardenCharm", "otherCharm", "charm", "bounty"];
const CLASSES = { all: 15, beginner: 1, adept: 2, expert: 4, master: 8 };

const pick = (o, keys) => { if (!o) return o == null ? null : o; const r = {}; keys.forEach((k) => { if (o[k] !== undefined) r[k] = o[k]; }); return r; };
const calibOut = (c) => c && Object.assign(pick(c, ["kill", "exp", "offset", "nKill", "nExp", "nProfit", "hours"]),
  { spots: c.spots.map((s) => Object.assign({ spot: s.e.spot, entry: s.e.id }, pick(s, ["hours", "kill", "exp", "profit", "pph"]))) });
// Documents in path order, as the page's db returns them.
const docs = (o) => Object.keys(o || {}).sort().map((id) => ({ id, data: () => JSON.parse(JSON.stringify(o[id])) }));

// One character's state as the app reads it.
function characterState(c, catalog, data, creatureDocs, advanced) {
  const known = (slug) => !!catalog.bySlug[slug], pl = c.planner || {};
  return { catalog, reference: data.reference, profile: JSON.parse(JSON.stringify(c.profile)), sessions: readSessions(docs(c.sessions)), entries: readRecords(docs(c.entries)),
    advanced, creatures: creatureDocs, spotMeta: {}, expTable: data.creatureExp, userSpots: readUserSpots(docs(c.spots)),
    planner: { state: readPlState(pl.state, known), marks: readMarks(docs(pl.marks)), occupancy: readOccs(docs(pl.occupancy)) } };
}

function characterFacts(M, state) {
  const d = M.derived, out = {};
  out.calib = calibOut(d.calib);
  out.calibOther = {};
  Object.keys(d.calibOther).sort().forEach((v) => { out.calibOther[v] = calibOut(d.calibOther[v]); });
  out.xpBoost = d.xpBoost; out.raidP = d.raidP; out.raidInfo = d.raidInfo; out.refSpotSrc = d.refSpotSrc;
  out.spotRates = {};
  Object.keys(d.spotKph).forEach((s) => { out.spotRates[s] = { kph: d.spotKph[s], xph: d.spotEco[s].xph, pph: d.spotEco[s].pph }; });
  out.weekly = pick(M.weekly(), ["difficulty", "weekStart", "slots", "current", "exp", "override", "formula"]);
  out.weeklyRows = M.weeklyRows().map((r) => pick(r, ["i", "name", "key", "killsLeft", "done", "open"]));
  out.weeklyNow = d.weeklyNow;
  out.weeklyBonus = {};
  Object.keys(d.spotKph).forEach((s) => { out.weeklyBonus[s] = M.weeklyBonus(s, 1); });
  out.spotIndex = M.spotIndex().list.map((sp) => Object.assign(pick(sp, ["id", "name", "aliases", "vocations", "teams", "levelMin", "levelMax", "own"]),
    { sessions: sp.sessions.length, creatures: Object.keys(sp.creatures), entries: sp.entries.map((e) => e.id || e.spot) }));
  out.plannerHeld = M.held();
  out.plannerToday = M.today();
  return out;
}

function creatures(M, state) {
  const d = M.derived, out = {}, cl = CLASSES[state.difficulty];
  let none = 0;
  state.catalog.list.forEach((it) => {
    if (!(it.m & cl)) return;
    const e = M.eff(it), m = d.metrics[it.slug], dv = d.derived[it.slug];
    const has = e.kph != null || e.xph != null || e.pph != null || d.scores[it.slug] != null || (m && m.charm != null) || dv || d.refShadow[it.slug] || e.rating;
    if (!has) { none++; return; }
    out[it.slug] = Object.assign(pick(e, ["src", "spot", "kph", "xph", "pph", "rating", "sample", "sampleHours", "profitStale", "numsAt", "fromSessions"]), {
      refEntry: e.refEntry ? e.refEntry.id : undefined, pinned: dv ? dv.pinned : undefined,
      spots: dv ? dv.spots.map((s) => s.spot + (s.ref ? " [" + s.src + "]" : "")) : undefined,
      unused: d.refShadow[it.slug] ? d.refShadow[it.slug].map((s) => s.spot + " [" + s.unused + "]") : undefined,
      m: pick(m, M_KEYS), score: d.scores[it.slug], tier: d.tiers[it.slug] });
  });
  return { creatures: out, withoutData: none };
}

function boardFacts(M, state) {
  const diff = M.boardDiff(), pm = M.poolModel(diff), set = M.rerollSettings(), p = state.profile;
  const out = { diff, settings: set };
  // The stored offers, valued even when a bounty is picked (the plan then ignores them).
  const named = M.bounty().offers.map((o) => Object.assign({ name: o.slug && state.catalog.bySlug[o.slug] ? state.catalog.bySlug[o.slug].name : "" }, o));
  out.offers = named.map((o, i) => {
    const it = state.catalog.bySlug[slugify(o.name || "")];
    if (!it) return { i, name: o.name || "" };
    const mult = { normal: 1, silver: 2, gold: 4 }[o.kind] || 1;
    const m = M.metricsFor(it, M.eff(it), diff, o.kills || null, mult, diff === "master" && it.cls === "C" && o.exp ? o.exp : null);
    return { i, name: it.name, m: pick(m, M_KEYS), value: pm && pm.known ? weightedValue(m, pm.w, pm.keys, pm.max) : null,
      reward: rewardPerKill(diff, it, p.chalRates && typeof p.chalRates === "object" ? p.chalRates : {}) };
  });
  if (pm) {
    out.model = pick(pm, ["keys", "known", "best", "medKph", "fallback", "nObs", "kinds", "levels", "max"]);
    if (pm.known && pm.best > 0) out.planH = M.rerollPlan(pm, set.hpd).h;
  }
  return out;
}

function plannerFacts(M, state, diff) {
  const ch = M.planChain(M.plannerCtx({ marks: state.planner.marks, diff }));
  return {
    steps: ch.steps.map((s) => ({ kind: s.kind, text: s.text, why: s.why })), notes: ch.notes, tokens: ch.tokens, hours: ch.hours, pool: ch.pool,
    cutoff: ch.cutoff ? ch.cutoff.id : null, skipped: ch.skipped, chosen: ch.chosen.map((o) => o.id),
    options: ch.options.map((o) => [o.id, o.offer ? o.offer.key + " " + o.offer.slug : null, o.v, o.thr, o.mark ? o.mark.state : null, o.odds ? o.odds.p : null]),
  };
}

function spotValues(M, state, diff) {
  const st = state.planner.state, out = {};
  M.spotIndex().list.forEach((sp) => {
    const v = M.spotValue(sp, { hours: st.fixedHours, held: M.held(), diff, today: M.today(), travel: st.travel });
    out[sp.id] = v && Object.assign(pick(v, ["src", "profitStale", "hours", "huntHours", "travelMin", "kph", "xph", "pph", "held", "today", "parts", "m"]),
      { entry: v.entry ? v.entry.id : null, weekly: v.weekly.map((x) => pick(x, ["key", "kph", "kills", "left", "exp"])) });
  });
  return out;
}

// data: {creatures, reference, creatureExp}; fixture: the backup. Returns {characters: {id: {facts, diffs}}}, not yet
// normalized.
export function capture(data, fixture, advanced, now) {
  const catalog = makeCatalog(data.creatures), creatureDocs = readCreatureDocs(docs(fixture.creatures)), cache = makePlanCache();
  const out = { characters: {} };
  for (const id of ["ek", "rp"]) {
    const base = characterState(fixture.characters[id], catalog, data, creatureDocs, advanced), saved = base.profile.goal;
    const model = (difficulty, goal) => {
      const state = Object.assign({}, base, { difficulty, profile: Object.assign({}, base.profile, { goal }) });
      return { M: makeModel(state, null, now, { planCache: cache }), state };
    };
    const c = out.characters[id] = { diffs: {} };
    const f = model("master", saved);
    c.facts = characterFacts(f.M, f.state);
    for (const k of DIFFS) {
      const dv = c.diffs[k] = { goals: {} };
      if (k !== "all") { const s = model(k, saved); dv.spotValues = spotValues(s.M, s.state, k); }
      for (const g of Object.keys(GOALS)) {
        const x = model(k, GOALS[g]), r = creatures(x.M, x.state);
        r.board = boardFacts(x.M, x.state);
        if (k !== "all") r.planner = plannerFacts(x.M, x.state, k);
        dv.goals[g] = r;
      }
    }
  }
  return out;
}
