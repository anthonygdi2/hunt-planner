// View models: plain data shaped for a screen, so the UI makes no decisions. Phase F adds one per new screen
// (ARCHITECTURE.md, View models); these cover the current screens where it was cheap.

import { VOCATIONS, PREY, PREY_SLOTS, EXP_EVENTS, SLOTS } from "../data/rules.js";
import { readSources, sourcesPreset, SOURCE_PRESETS, readSettings, TAKEN_MINUTES, THEMES, readGoal, readHunting } from "../store/schema.js";
import { GOAL_KEYS, PRESET_IDS, presetOf } from "../core/score.js";
import { plural, fmtBig, fmtHours, fmtSmall, fmtField, pct, joinAnd, norm } from "../core/text.js";
import { creatureInPool, poolsOf, topPool } from "../core/catalog.js";
import { bestiaryOf } from "../core/metrics.js";
import { manualNums, NUM_FIELDS } from "../core/numbers.js";
import { staleProfitText } from "../core/reference.js";
import { slotOdds, slotSuggestions } from "../core/slots.js";
import { aVoc } from "../core/explain.js";
import { parseSession, sessionProblems } from "../core/session.js";
import { weekKey } from "../core/weekly.js";
import { markAge, markActive } from "../core/occupancy.js";
import { isChallengingMaster } from "../core/rewards.js";

// Short vocation names, as players write them.
export const VOC_SHORT = { "Elite Knight": "EK", "Royal Paladin": "RP", "Elder Druid": "ED", "Master Sorcerer": "MS", "Exalted Monk": "EM" };

// A character's name, or "EK 615" until it has one.
export function displayName(p) {
  p = p || {};
  if (p.name && String(p.name).trim()) return String(p.name).trim();
  return (VOC_SHORT[p.vocation] || "Character") + (p.level ? " " + p.level : "");
}

// The header: app name and the character switcher ("Main EK ▾" over "Elite Knight · 615").
export function headerView({ profile }) {
  if (!profile) return { appName: "Hunt Planner", character: null };
  const name = displayName(profile), sub = (profile.vocation || VOCATIONS[0]) + (profile.level ? " · " + profile.level : "");
  return { appName: "Hunt Planner", character: { name, sub, label: "Character: " + name + ", " + (profile.vocation || VOCATIONS[0]) + (profile.level ? " level " + profile.level : "") + ". Change character" } };
}

// First run: the five vocations and a level; ready once the level is a number.
export function firstRunView({ vocation, level }) {
  vocation = VOCATIONS.indexOf(vocation) !== -1 ? vocation : VOCATIONS[0];
  const lvl = String(level || "").replace(/[^0-9]/g, "").slice(0, 4), ready = !!vocation && Number(lvl) > 0;
  return {
    vocations: VOCATIONS.map((v) => ({ name: v, pressed: v === vocation })), level: lvl, ready,
    note: ready ? vocation + ", level " + lvl + ". A name is optional; add one later in Characters." : "Type your level to continue. A name is optional; add one later in Characters.",
  };
}

// The goal mixer (Plan's Goal chip and its editor). goal: the character's weights 0-5 (store readGoal).
const GOAL_ROWS = [["xp", "Exp", "exp per hour"], ["profit", "Profit", "profit per hour"], ["charm", "Charm points", "charm points per hour"], ["bounty", "Bounty points", "bounty points per hour"]];
const PRESET_LABELS = { exp: "Exp", profit: "Profit", mostly: "Mostly exp, some profit", balanced: "Balanced", charm: "Charm points", bounty: "Bounty points" };
export function goalMixView(goal) {
  const preset = presetOf(goal), total = GOAL_KEYS.reduce((a, k) => a + goal[k], 0);
  const split = GOAL_ROWS.filter(([k]) => goal[k] > 0).map(([key, name]) => ({ key, name, pct: Math.round(goal[key] / total * 100) }));
  return {
    chip: { label: "Goal", value: preset === "custom" ? "Custom mix" : PRESET_LABELS[preset], set: true },
    intro: "What should a good hunt give you? Start from a preset, then nudge the weights.",
    presets: PRESET_IDS.map((id) => ({ id, label: PRESET_LABELS[id], pressed: id === preset })),
    rows: GOAL_ROWS.map(([key, name, hint]) => ({ key, name, hint, value: goal[key],
      options: [0, 1, 2, 3, 4, 5].map((n) => ({ n, pressed: goal[key] === n, label: name + " weight " + n + (n === 0 ? ", off" : "") })) })),
    split, shareText: total === 0 ? "Nothing weighted yet, so the plan uses Exp." : split.map((p) => p.name + " " + p.pct + "%").join(" · "),
  };
}

// The Bounty chip and its editor. b: the model's bounty(); catalog: makeCatalog(...).
const DIFF_LABELS = [["master", "Master"], ["expert", "Expert"], ["adept", "Adept"], ["beginner", "Beginner"]];
export function bountyView(b, catalog) {
  const c = (slug) => (slug && catalog.bySlug[slug]) || null, name = (slug) => (c(slug) ? c(slug).name : "");
  const tokens = b.tokens == null ? "tokens not set" : plural(b.tokens, "token"), n = b.offers.filter((o) => o.slug).length;
  const active = b.mode === "active" && b.active;
  const chip = active ? { set: true, value: name(b.active.slug) + " · " + tokens }
    : n ? { set: true, value: plural(n, "offer") + " · " + tokens } : b.tokens != null ? { set: true, value: "No offers · " + tokens } : { set: false, value: "" };
  return {
    chip: Object.assign({ label: "Bounty" }, chip), mode: active ? "active" : "offers", difficulty: b.difficulty, tokens: b.tokens,
    difficulties: DIFF_LABELS.map(([value, label]) => ({ value, label })),
    intro: active ? "Your active bounty. Type over anything the game shows differently; kills left feeds the plan."
      : "The three bounty offers on the board. The plan says which to go for; pick it in game once the spot is free.",
    offers: b.offers.map((o, i) => ({ i, letter: "ABC"[i], name: name(o.slug), kills: o.kills, kind: o.kind, exp: o.exp,
      showExp: isChallengingMaster(b.difficulty, c(o.slug)), canPick: !!o.slug })),
    active: active ? { name: name(b.active.slug), kills: b.active.kills, killsLeft: b.active.killsLeft, kind: b.active.kind, exp: b.active.exp,
      showExp: isChallengingMaster(b.difficulty, c(b.active.slug)) } : null,
    note: "Picking makes the other two disappear in game, so pick after checking the spot is free.",
    suggestions: catalog.poolOf(b.difficulty).map((x) => x.name),
  };
}

// The Plan screen (F2: Goal; F3: Bounty; F4 adds the rest). model: the active character's model; catalog for names.
export function planView(state, model, catalog) {
  const p = state.profiles[state.pid] || {};
  return { goal: goalMixView(readGoal(p)), bounty: model && catalog ? bountyView(model.bounty(), catalog) : null };
}

const MINUTES_LABEL = { 30: "30 minutes", 45: "45 minutes", 60: "1 hour", 120: "2 hours" };
// How the reference is adjusted to this character, in plain words (Characters page).
export function calibrationText({ sources, calib, calibOther, vocation }) {
  if (!sources.reference) return "Reference hunts are off, so only your own logged hunts are used.";
  const others = Object.keys(calibOther || {}).filter((v) => calibOther[v]);
  const otherPart = !sources.otherVocation ? "" : others.length ? " Other vocations’ references are scaled for " + others.join(", ") + "; the rest are shown as recorded."
    : " Other vocations are shown as recorded until you log one of their spots.";
  if (!calib) return "Not adjusted to you yet: log a clean hunt at a spot that has a reference hunt and every reference is scaled to you." + otherPart;
  const n = calib.spots.length;
  return "Adjusting to you: " + n + " of your logged spots " + (n === 1 ? "has" : "have") + " a reference to compare against. " + vocation + " references are scaled." + otherPart;
}

// Characters and settings (full page). app: {state, profile()}; model: the active character's model, for the
// calibration line (or null before there is one).
export function charactersPageView(state, model) {
  const p = state.profiles[state.pid] || null, sources = readSources(p || {}), settings = readSettings(p || {}, state.planner && state.planner.state);
  const d = model && model.derived;
  return {
    canWrite: state.canWrite && state.status === "ready",
    pills: state.order.map((id) => { const x = state.profiles[id] || {}; return { id, label: displayName(x) + (x.level && x.name ? " · " + x.level : ""), pressed: id === state.pid }; }),
    character: p && { name: p.name || "", vocation: p.vocation || VOCATIONS[0], level: p.level || "", bestiaryBonus: Number(p.bestiaryBonus) || 0, displayName: displayName(p) },
    vocations: VOCATIONS,
    sources: { preset: sourcesPreset(sources), switches: sources,
      presets: [["mine", "Mine only"], ["reference", "+ Reference"], ["everything", "Everything"]].map(([value, label]) => ({ value, label, switches: SOURCE_PRESETS[value] })),
      calibration: p ? calibrationText({ sources, calib: d && d.calib, calibOther: d && d.calibOther, vocation: p.vocation || VOCATIONS[0] }) : "" },
    settings: { world: settings.world || "", takenMinutes: settings.takenMinutes, takenOptions: TAKEN_MINUTES.map((m) => ({ value: m, label: MINUTES_LABEL[m] })) },
    advanced: state.advanced, theme: state.theme, themes: THEMES,
    backupNote: state.local ? "Your data stays in this browser. Download a backup to keep a copy or move it to another device."
      : "Your data is saved to this page and syncs across your devices. A backup is a copy you can keep or restore elsewhere.",
    notice: state.notice,
  };
}


// ---------- the Plan screen (F4) ----------
const HOURS = [[null, "No limit"], [0.5, "30 min"], [1, "1 h"], [1.5, "1.5 h"], [2, "2 h"], [3, "3 h"], [4, "4 h"]];
const PREY_KINDS = [["xp", "Exp"], ["loot", "Loot"], ["damage", "Damage"], ["defense", "Defense"]];
const SOURCE_LABELS = { mine: "Mine only", reference: "+ Reference", everything: "Everything", custom: "Custom" };

// The badges for a spot's numbers: where they come from, how old, how thin. sessions: hunts logged there.
export function sourceBadges(o, sessions) {
  const out = [], e = o.entry || {};
  if (o.src === "own") out.push({ kind: "yours", text: "Yours · " + plural(sessions || 0, "hunt") });
  else if (o.src === "refAdj") out.push({ kind: "refAdj", text: "Reference, adjusted to you" });
  else if (o.src === "ref") out.push({ kind: "ref", text: "Reference" });
  else if (o.src === "other" || o.src === "otherAdj") out.push({ kind: "other", text: "Other vocation" });
  if (e.source && e.source.postRebalance === false) out.push({ kind: "older", text: "Older · before the rebalance" });
  if (o.src === "own" && (o.huntHours != null ? o.huntHours : 0) < 1 && sessions < 2) out.push({ kind: "low", text: "Low sample" });
  return out;
}

// state: the app state; model: the active character's model; catalog; now (ms).
export function planScreenView(state, model, catalog, now) {
  const p = state.profiles[state.pid] || {}, pl = state.planner || {}, st = pl.state || {};
  const base = planView(state, model, catalog), settings = readSettings(p, st), sources = readSources(p), hunting = readHunting(st);
  const name = (slug) => (slug && catalog.bySlug[slug] ? catalog.bySlug[slug].name : "");
  const idx = model.spotIndex(), spotName = (id) => (idx.spots[id] ? idx.spots[id].name : id), sessionsAt = (id) => (idx.spots[id] ? idx.spots[id].sessions.length : 0);

  // The chain.
  const ch = model.planChain(model.plannerCtx({ marks: pl.marks }));
  const bountyLine = (s) => (!s.offer ? null : s.offer.held ? "Kills here count for your bounty: " + s.offer.name
    : "For offer " + "ABC"[s.offer.i] + ": " + s.offer.name + ". Pick it once you see the spot is free.");
  const card = (s) => { const o = s.option; return { id: o.id, title: s.text, name: o.name, bounty: bountyLine(s), exp: fmtBig(o.m.xp), profit: o.m.profit != null ? fmtBig(o.m.profit) : "–",
    badges: sourceBadges(o, sessionsAt(o.id)), why: s.why, offer: s.offer && !s.offer.held ? { i: s.offer.i, letter: "ABC"[s.offer.i], name: s.offer.name } : null }; };
  const go = ch.steps.filter((s) => s.kind === "go").map(card), last = ch.steps[ch.steps.length - 1], b = model.bounty();
  const end = last.kind === "reroll" ? { kind: "reroll", title: "Reroll and re-plan",
    line: (last.dropsBounty ? "Drops your bounty for three new offers. " : "") + plural(last.tokens, "token") + " left. Or see Spots for more.", why: last.why }
    : { kind: "seeSpots", title: last.text.replace(/^Taken\? → /, ""), line: b.tokens === 0 ? "No reroll tokens left. Every spot, sorted for your goal." : "Every spot, sorted for your goal.", why: last.why };
  const notices = ch.steps.filter((s) => s.kind === "finish" || s.kind === "claim").map((s) => ({ kind: s.kind, text: s.text, why: s.why }));
  const first = go[0] || null;
  const refNote = first && (first.badges[0] || {}).kind !== "yours" && (first.badges[0] || {}).kind !== "refAdj" ? "Top players’ numbers, likely more than you’ll get, until a logged hunt adjusts them." : null;

  // Taken spots: marks still in effect.
  const taken = Object.keys(pl.marks || {}).filter((id) => pl.marks[id].state === "taken" && markActive(pl.marks[id], now, settings.takenMinutes)).map((id) => {
    const age = Math.round(markAge(pl.marks[id], now)), left = Math.max(1, Math.ceil(settings.takenMinutes - markAge(pl.marks[id], now)));
    return { id, name: spotName(id), meta: "Marked " + (age < 1 ? "just now" : age + " min ago") + " · clears in " + left + " min" };
  });

  // Hunting now: with offers still to choose, the offer this spot is for is the one to pick now.
  let huntingView = null;
  if (hunting) {
    const opt = ch.options.filter((o) => o.id === hunting.spotId)[0], off = opt && opt.offer && !opt.offer.held ? opt.offer : null;
    huntingView = { spotId: hunting.spotId, name: spotName(hunting.spotId), pick: off ? { i: off.i, letter: "ABC"[off.i], name: off.name } : null };
  }

  // The other chips and their editors.
  const wk = model.weekly(), rows = model.weeklyRows().filter((r) => r.name), done = rows.filter((r) => r.done);
  const weekly = { chip: rows.length && wk.current ? { set: true, value: done.length + " of " + wk.slots + " done" } : { set: false, value: "" },
    rows: wk.current ? rows.map((r) => ({ i: r.i, name: r.name, left: r.killsLeft, done: r.done })) : [] };
  const t = model.today(), prey = (t.prey || []).filter((q) => q.slug);
  const todayParts = [t.boosted ? name(t.boosted) + " boosted" : null, prey.length ? plural(prey.length, "prey", "preys") : null, t.event ? "+" + t.event + "% event" : null].filter(Boolean);
  const today = { chip: todayParts.length ? { set: true, value: todayParts.join(" · ") } : { set: false, value: "" },
    boosted: name(t.boosted), prey: ((st.today || {}).prey || []).map((q, i) => ({ i, name: name(q.slug), kind: q.kind, pct: q.pct,
      kinds: PREY_KINDS.map(([value, label]) => ({ value, label })), sizes: preySizes(q.kind) })),
    canAddPrey: ((st.today || {}).prey || []).length < PREY_SLOTS, event: t.event || 0,
    events: [{ value: 0, label: "No exp event" }, { value: EXP_EVENTS.double, label: "Double experience (+" + EXP_EVENTS.double + "%)" }]
      .concat(EXP_EVENTS.world.map((x) => ({ value: x, label: "World bonus +" + x + "%" }))), names: catalog.list.map((c) => c.name) };
  const time = { chip: st.fixedHours ? { set: true, value: (HOURS.filter((x) => x[0] === st.fixedHours)[0] || [0, st.fixedHours + " h"])[1] } : { set: false, value: "" },
    value: st.fixedHours || null, options: HOURS.map(([value, label]) => ({ value, label })) };
  const preset = sourcesPreset(sources);
  const data = { chip: { set: true, value: SOURCE_LABELS[preset] }, preset,
    presets: ["mine", "reference", "everything"].map((value) => ({ value, label: SOURCE_LABELS[value], switches: SOURCE_PRESETS[value] })) };

  return Object.assign(base, { weekly, today, time, data, steps: { first, fallbacks: go.slice(1), end, notices, refNote, notes: ch.notes }, taken, hunting: huntingView });
}
function preySizes(kind) { const r = PREY[kind] || PREY.xp, out = []; for (let v = r.lo; v <= r.hi; v += r.step) out.push({ value: v, label: v + "%" }); return out; }

// ---------- the Weekly screen (F5) ----------
const DAY = 864e5;
const fmtDay = (iso) => new Date(iso + "T12:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
// w: the model's weekly(); rows: weeklyRows(); now (ms). The week's dates, difficulty and slots, one row per slot.
export function weeklyView(w, rows, catalog, now) {
  const thisWeek = weekKey(new Date(now)), start = w.current && w.weekStart ? w.weekStart : thisWeek;
  const next = new Date(Date.parse(start + "T08:00:00Z") + 7 * DAY).toISOString().slice(0, 10);
  const slots = [];
  for (let i = 0; i < w.slots; i++) { const r = rows[i] || {}; slots.push({ i, name: r.name || "", killsLeft: r.killsLeft == null ? "" : r.killsLeft, done: !!r.done }); }
  return {
    intro: "Week of " + fmtDay(start) + ". New tasks Monday, " + fmtDay(next) + ", at server save. Kills aren’t counted here: type kills left and tick Done when you claim a task in game.",
    stale: !w.current, staleText: "A new week started at Monday’s server save. Last week’s tasks don’t count any more.",
    difficulty: w.difficulty, difficulties: DIFF_LABELS.map(([value, label]) => ({ value, label })), slots: w.slots,
    slotOptions: [{ value: 6, label: "6" }, { value: 9, label: "9 (with expansion)" }],
    rows: slots, doneCount: slots.filter((r) => r.done).length, reward: w.exp ? fmtBig(w.exp) + " exp each" : "Set your level to see the reward.",
    how: "Spots with open weekly creatures score higher. Done tasks stop counting. Delivery tasks don’t affect where to hunt, so they aren’t listed.",
    names: catalog.list.map((c) => c.name),
  };
}

// ---------- Log a clean hunt (F6) ----------
// draft: the page's own state {text, where "known" | "new", spotId, name, parentId, note, raids {name: n}}; model and
// catalog for the spots and numbers; advanced: show raid counts.
export function logView(draft, model, catalog, advanced) {
  const p = draft.text ? parseSession(draft.text, catalog) : null, problem = draft.text ? sessionProblems(p) : "";
  const idx = model.spotIndex(), byName = (a, b) => a.name.localeCompare(b.name);
  const parents = idx.list.filter((s) => !s.parentId).slice().sort(byName);
  const spots = [];
  parents.forEach((s) => {
    spots.push({ value: s.id, label: s.name + (s.userMade ? " (yours)" : "") });
    idx.list.filter((v) => v.parentId === s.id).sort(byName).forEach((v) => spots.push({ value: v.id, label: s.name + " · " + v.name + " (yours)" }));
  });
  const ok = p && !problem;
  const exp = ok ? ((p.rawXp != null ? p.rawXp : p.xp) || 0) / p.hours : null, profit = ok && p.balance != null ? p.balance / p.hours : null;
  const nameTaken = draft.where === "new" && draft.name && idx.idOf(draft.name) && !(idx.spots[idx.idOf(draft.name)] || {}).userMade;
  const where = draft.where === "new" ? "new" : "known", spotId = draft.spotId && idx.spots[draft.spotId] ? draft.spotId : (spots[0] || {}).value || null;
  const kills = ok ? p.kills.slice().sort((a, b) => b.count - a.count) : [];
  const creatures = kills.map((k) => k.name);
  return {
    text: draft.text || "", problem,
    read: ok ? "Read it: " + fmtHours(p.hours) + ", " + plural(p.kills.length, "creature type") + "." : "",
    preview: ok ? p : null, where, spotId, spots, parents: [{ value: "", label: "None, it’s a new spot" }].concat(parents.map((s) => ({ value: s.id, label: s.name }))),
    name: draft.name || "", parentId: draft.parentId || "", note: draft.note || "",
    nameHint: nameTaken ? "There’s already a spot called that. Pick it under Known spot, or give this one its own name." : "",
    creaturesLine: creatures.length ? "Creatures come from your paste: " + joinAnd(creatures) + "." : "",
    exp: exp != null ? fmtBig(exp) : "–", profit: profit != null ? fmtBig(profit) : "–",
    kph: kills.map((k) => ({ name: k.name, perHour: Math.round(k.count / p.hours) + "/h" })),
    saveText: where === "new" ? "Adds " + (draft.name ? "“" + draft.name.trim() + "”" : "the spot") + " to Spots and the plan with your numbers (Yours · 1 hunt, low sample)" + (draft.parentId ? ", listed under its parent too." : ".") :
      "Updates this spot’s numbers (Yours) and how the reference is adjusted to you.",
    raids: advanced && ok ? kills.map((k) => ({ name: k.name, value: (draft.raids || {})[k.name] || "" })) : null,
    canSave: !!ok && (where === "known" ? !!spotId : !!(draft.name && draft.name.trim()) && !nameTaken),
  };
}

// ---------- Spots and the spot page (F7) ----------
const SORTS = [["score", "Score"], ["exp", "Exp/h"], ["profit", "Profit/h"]];
export const BADGE_LEGEND = [
  { kind: "yours", name: "Yours", text: "from your own logged hunts." },
  { kind: "refAdj", name: "Reference, adjusted to you", text: "a published hunt, scaled by how your logged hunts compare." },
  { kind: "ref", name: "Reference", text: "a published hunt as recorded, likely more than you’ll get." },
  { kind: "other", name: "Other vocation", text: "another vocation’s hunt, used only when nothing better exists." },
  { kind: "older", name: "Older", text: "recorded before the last rebalance." },
  { kind: "low", name: "Low sample", text: "one or two hunts, so treat it as a rough guide." },
];
// Every spot's value as the plan sees it (bounty and weekly counted in), once per model and lens: planOptions is the
// slow part, and the model is rebuilt on every state change.
const spotsMemo = new WeakMap();
function spotOptions(model, lens) {
  const key = (lens.allVocations ? "v" : "") + (lens.anyLevel ? "l" : "");
  let m = spotsMemo.get(model);
  if (!m) { m = {}; spotsMemo.set(model, m); }
  if (!m[key]) {
    const po = model.planOptions(model.plannerCtx({ lens })), byId = {};
    po.options.forEach((o) => { byId[o.id] = o; });
    m[key] = { idx: po.idx, byId };
  }
  return m[key];
}
// Spots marked taken and still in effect: id → minutes until the mark clears.
function takenLeft(state, now) {
  const p = state.profiles[state.pid] || {}, pl = state.planner || {}, mins = readSettings(p, pl.state).takenMinutes, out = {};
  Object.keys(pl.marks || {}).forEach((id) => {
    const m = pl.marks[id];
    if (m.state === "taken" && markActive(m, now, mins)) out[id] = Math.max(1, Math.ceil(mins - markAge(m, now)));
  });
  return out;
}
// What the bounty and the weekly tasks make of each creature: "bounty", "offer B" or "weekly".
function creatureTags(model) {
  const b = model.bounty(), tags = {};
  model.openWeeklies().forEach((w) => { tags[w.key] = "weekly"; });
  if (b.mode === "active" && b.active) tags[b.active.slug] = "bounty";
  else b.offers.forEach((o, i) => { if (o.slug) tags[o.slug] = "offer " + "ABC"[i]; });
  return tags;
}
// Only duo or team hunts are recorded at this spot (the plan counts solo hunts).
const teamOnly = (sp) => sp.entries.length > 0 && !sp.sessions.length && sp.entries.every((e) => e.team && e.team !== "solo");
const perHourPair = (o) => fmtBig(o.m.xp) + " exp/h · " + (o.m.profit != null ? fmtBig(o.m.profit) : "–") + " profit/h";
// A spot's creatures, most kills per hour first (as listed when there are no numbers).
const byKph = (kph, creatures) => (kph ? Object.keys(kph).filter((s) => kph[s] > 0).sort((a, b) => kph[b] - kph[a]) : Object.keys(creatures));

// The Spots list. ui: {query, sort "score" | "exp" | "profit", allVocations, anyLevel, hideTaken, limit}; now (ms).
export function spotsView(state, model, catalog, ui, now) {
  const lens = { allVocations: !!ui.allVocations, anyLevel: !!ui.anyLevel }, sort = ui.sort || "score";
  const { idx, byId } = spotOptions(model, lens), taken = takenLeft(state, now), tags = creatureTags(model), q = norm(ui.query || "");
  const name = (slug) => (catalog.bySlug[slug] ? catalog.bySlug[slug].name : slug);
  const tagText = (t) => (t === "bounty" ? "your bounty" : t === "weekly" ? "weekly task" : t);
  const matches = (sp) => !q || norm(sp.name).indexOf(q) !== -1 || sp.aliases.some((a) => norm(a).indexOf(q) !== -1) ||
    Object.keys(sp.creatures).some((s) => norm(name(s)).indexOf(q) !== -1);
  const all = idx.list.filter((sp) => !model.lensCheck(sp, lens) && !(ui.hideTaken && taken[sp.id]) && matches(sp));
  const key = (sp) => { const o = byId[sp.id]; return !o ? null : sort === "exp" ? o.m.xp : sort === "profit" ? o.m.profit : o.v; };
  all.sort((a, b) => { const x = key(a), y = key(b); return x == null && y == null ? a.name.localeCompare(b.name) : x == null ? 1 : y == null ? -1 : y - x; });
  const limit = ui.limit > 0 ? ui.limit : 50;
  const rows = all.slice(0, limit).map((sp) => {
    const o = byId[sp.id], parent = sp.parentId && idx.spots[sp.parentId];
    const cr = byKph(o && o.kph, sp.creatures).slice(0, 5).map((s) => name(s) + (tags[s] ? " (" + tagText(tags[s]) + ")" : ""));
    return { id: sp.id, name: sp.name, sub: parent ? "Your variation of " + parent.name : sp.userMade ? "Your spot" : null,
      score: o && o.score != null ? String(o.score) : null, numbers: o ? perHourPair(o) : null,
      none: o ? null : teamOnly(sp) ? "Only duo or team hunts recorded here" : "Not enough data for your vocation",
      creatures: cr.join(", "), badges: o ? sourceBadges(o, sp.sessions.length) : [],
      taken: taken[sp.id] ? "Taken · clears in " + taken[sp.id] + " min" : null };
  });
  return {
    query: ui.query || "", sort, sorts: SORTS.map(([value, label]) => ({ value, label })),
    toggles: [["allVocations", "All vocations"], ["anyLevel", "Any level"], ["hideTaken", "Hide taken"]].map(([k, label]) => ({ key: k, label, on: !!ui[k] })),
    count: plural(all.length, "spot") + ". Score is the hourly rate for your goal mix, with your bounty and weekly tasks counted in.",
    rows, more: Math.max(0, all.length - limit),
    empty: all.length ? "" : q ? "No spot or creature matches “" + String(ui.query).trim() + "”." : "No spots fit. Try All vocations or Any level.",
    legend: BADGE_LEGEND,
  };
}

const fmtMonth = (iso) => new Date(String(iso).slice(0, 10) + "T12:00:00Z").toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
const levelRange = (e) => (e.levelMin ? "level " + e.levelMin + (e.levelMax ? "–" + e.levelMax : "+") : e.levelMax ? "up to level " + e.levelMax : "any level");

// One spot's page. id: the spot; ui: {lens (the Spots list's), armed (a session id, or "spot", awaiting a second
// tap)}; now (ms); advanced: Advanced mode. Null when there's no such spot.
export function spotView(state, model, catalog, id, ui, now, advanced) {
  ui = ui || {};
  let opts = spotOptions(model, ui.lens || {});
  if (!opts.byId[id]) opts = spotOptions(model, { allVocations: true, anyLevel: true });
  const idx = opts.idx, sp = idx.spots[id];
  if (!sp) return null;
  const p = state.profiles[state.pid] || {}, o = opts.byId[id] || null, nums = model.spotNums(sp), d = model.derived;
  const vocation = p.vocation || VOCATIONS[0], tags = creatureTags(model), taken = takenLeft(state, now);
  const name = (slug) => (catalog.bySlug[slug] ? catalog.bySlug[slug].name : slug);
  const parent = sp.parentId && idx.spots[sp.parentId], goal = goalMixView(readGoal(p)).chip.value;

  const scoreLine = o && o.score != null ? "Score " + o.score + " for " + displayName(p) + " · " + goal
    : o ? "No score: this spot is missing a number your goal mix weighs (" + goal + ")."
    : teamOnly(sp) ? "No score: only duo or team hunts are recorded here, and the plan counts solo hunts." : model.noNumsWhy(sp);
  const creatures = byKph(nums && nums.kph, sp.creatures).map((s) => ({ slug: s, name: name(s), perHour: nums && nums.kph[s] ? "≈ " + Math.round(nums.kph[s]) + "/h" : "",
    tag: tags[s] === "bounty" ? "Your bounty" : tags[s] === "weekly" ? "Weekly task" : tags[s] ? "Bounty " + tags[s] : null, gold: !!tags[s] && tags[s] !== "weekly" }));

  // Where the numbers come from: hunts here, the reference hunt (used, or the one that would be), the rest skipped.
  const hrs = sp.sessions.reduce((a, x) => a + (Number(x.hours) || 0), 0);
  const hunts = !sp.sessions.length ? "None yet. Log one clean hunt and these become your own numbers."
    : plural(sp.sessions.length, "hunt") + ", " + fmtHours(hrs) + " in all." + (nums && nums.src === "own" ? " These numbers come from them." : " They have breaks, so they don’t give a clean rate.");
  const refNums = nums && nums.src === "own" ? model.spotNums(Object.assign({}, sp, { sessions: [] })) : nums;
  const e = (refNums && refNums.entry) || null;
  const mineVoc = (x) => x.vocation === vocation || x.vocation === "any";
  let reference = null;
  if (e) {
    const src = e.source || {}, recXp = p.xpMode === "xp" && e.xph > 0 ? e.xph : e.rawXph;
    const calib = e.vocation === vocation || e.vocation === "any" ? d.calib : (d.calibOther || {})[e.vocation];
    const n = calib && calib.spots ? calib.spots.length : 0;
    reference = {
      who: e.vocation + (e.team && e.team !== "solo" ? " " + e.team : "") + ", " + levelRange(e) + ", from " + (src.who ? src.who + "’s video" : "a published video") +
        (src.date ? " (" + fmtMonth(src.date) + ")" : "") + (src.postRebalance === false ? ", before the rebalance" : ""),
      url: src.url || null,
      recorded: "As recorded: " + fmtBig(recXp) + " exp/h · " + (e.profitph != null ? fmtBig(e.profitph) : "–") + " profit/h",
      adjusted: nums.src === "own" ? "Not used while you have your own hunts here."
        : refNums.src === "refAdj" || refNums.src === "otherAdj" ? "Adjusted to you: " + fmtBig(refNums.xph) + " · " + (refNums.pph != null ? fmtBig(refNums.pph) : "–") +
          ", from how your " + plural(n, "logged spot") + " compare" + (n === 1 ? "s" : "") + " to " + (n === 1 ? "its reference." : "their references.")
        : mineVoc(e) ? "Not adjusted to you yet: log a clean hunt at any spot with a reference and every reference is scaled to you."
        : "Not adjusted to you yet: log a clean hunt at a spot with " + aVoc(e.vocation) + " reference and that vocation’s hunts are scaled to you.",
    };
  }
  const skipped = sp.entries.filter((x) => x !== e).map((x) => {
    const why = mineVoc(x) ? (Number(p.level) && x.levelMin > Number(p.level) ? "needs level " + x.levelMin : "another hunt here fits you better")
      : e && mineVoc(e) ? aVoc(vocation) + " hunt exists" : "another hunt here fits you better";
    return x.vocation + " reference, " + levelRange(x) + " (skipped: " + why + ")";
  });

  const varRow = (v) => {
    const vo = opts.byId[v.id] || null;
    return { id: v.id, name: v.name, score: vo && vo.score != null ? String(vo.score) : null, numbers: vo ? perHourPair(vo) : "No numbers yet",
      meta: [v.note, "Yours · " + plural(v.sessions.length, "hunt"), v.sessions.length < 2 ? "low sample" : null].filter(Boolean).join(" · ") };
  };
  const raidsOf = (x) => (x.raidsBy && typeof x.raidsBy === "object" ? x.raidsBy : {});
  const when = (x) => String(x.start || x.end || "");
  const sessions = sp.sessions.filter((x) => x.id).slice().sort((a, b) => when(b).localeCompare(when(a))).map((x) => {
    const H = Number(x.hours) || 0, xp = x.rawXp != null ? x.rawXp : x.xp, raids = raidsOf(x);
    return { id: x.id, date: when(x) ? fmtDay(when(x).slice(0, 10)) : "Undated", length: H ? fmtHours(H) : "–",
      exp: H && xp != null ? fmtBig(xp / H) + " exp/h" : "– exp/h", profit: H && x.balance != null ? fmtBig(x.balance / H) + " profit/h" : "– profit/h",
      breaks: !!x.breaks, armed: ui.armed === x.id, raidsBy: raids,
      raids: advanced ? (x.kills || []).map((k) => { const n = k.name || name(k.slug); return { name: n, value: raids[n] != null ? String(raids[n]) : "" }; }) : null };
  });
  const variations = idx.list.filter((v) => v.parentId === id);
  return {
    id, name: sp.name, sub: parent ? "Your variation of " + parent.name : sp.userMade ? "Your spot" : null, parentId: parent ? parent.id : null,
    scoreLine, exp: o ? fmtBig(o.m.xp) : nums ? fmtBig(nums.xph) : "–",
    profit: o ? (o.m.profit != null ? fmtBig(o.m.profit) : "–") : nums && nums.pph != null ? fmtBig(nums.pph) : "–",
    badges: o ? sourceBadges(o, sp.sessions.length) : nums ? sourceBadges(nums, sp.sessions.length) : [],
    taken: taken[id] ? "Taken · clears in " + taken[id] + " min" : null,
    creatures, sources: { hunts, reference, skipped },
    variations: sp.parentId ? null : variations.map(varRow), canVary: !sp.parentId,
    sessions, emptySessions: "No sessions logged at this spot. Only clean, break-free hunts belong here.",
    own: advanced && sp.userMade ? { name: sp.name, armed: ui.armed === "spot",
      deleteText: "Deletes this spot" + (sp.sessions.length ? " and its " + plural(sp.sessions.length, "hunt") : "") +
        (variations.length ? "; its " + plural(variations.length, "variation") + " stay as spots of their own" : "") + "." } : null,
  };
}

// ---------- Creatures and the creature page (F8) ----------
const TIER_IDS = ["S", "A", "B", "C", "D"];
const CLASS_NAME = { E: "Easy", M: "Medium", H: "Hard", C: "Challenging" };
const DIFF_NAME = { all: "All", master: "Master", expert: "Expert", adept: "Adept", beginner: "Beginner" };
export const CREATURE_DIFFS = ["master", "expert", "adept", "beginner", "all"];
const pct100 = (r) => String(Math.round(r * 100));
// "Hard bestiary · Expert and Master tasks".
const classLine = (c) => CLASS_NAME[c.cls] + " bestiary · " + joinAnd(poolsOf(c).map((x) => DIFF_NAME[x])) + " tasks";
// The wiki page for a creature (its TibiaWiki title when it differs from the name).
const wikiUrl = (c) => "https://tibia.fandom.com/wiki/" + encodeURIComponent((c.w || c.name).replace(/ /g, "_")).replace(/%27/g, "'");
// Where a creature's working numbers come from, as a badge.
function numbersBadge(e) {
  if (e.src === "own") return { kind: "yours", text: "Yours" };
  if (e.src === "refAdj") return { kind: "refAdj", text: "Reference, adjusted to you" };
  if (e.src === "ref") return { kind: "ref", text: "Reference" };
  if (e.src === "other" || e.src === "otherAdj") return { kind: "other", text: "Other vocation" };
  return null;
}

// The Creatures screen: tiers S–D and Avoid (or the table) for one difficulty and the goal mix. model: the active
// character's model for that difficulty (app.modelFor). ui: {difficulty, mode "tiers" | "table", query, lists (the
// Preferred / Unwanted editor open), add {preferred, unwanted} (what's typed in each list's field)}.
export function creaturesView(state, model, catalog, ui) {
  const p = state.profiles[state.pid] || {}, d = model.derived, diff = ui.difficulty, sl = model.slots(), tags = creatureTags(model), q = norm(ui.query || "");
  const pool = catalog.poolOf(diff).filter((c) => !q || c.key.indexOf(q) !== -1);
  const item = (c) => {
    const avoid = model.ratingOf(c) === "X", ml = model.lockedFor(c) ? model.minLevelFor(c) : null, e = model.eff(c), m = d.metrics[c.slug] || {};
    const pref = sl.preferred.indexOf(c.slug) !== -1, unw = sl.unwanted.indexOf(c.slug) !== -1, tag = tags[c.slug];
    const marks = [tag === "bounty" ? "your bounty" : tag && tag !== "weekly" ? tag : null, tag === "weekly" ? "weekly task" : null, pref ? "Preferred" : null, unw ? "Unwanted" : null,
      ml ? "needs level " + ml : null].filter(Boolean);
    return { slug: c.slug, name: c.name, tier: d.tiers[c.slug] || null, score: d.scores[c.slug] != null ? pct100(d.scores[c.slug]) : null, avoid, preferred: pref, unwanted: unw,
      bounty: tag && tag !== "weekly" ? tag : null, locked: ml, marks, label: c.name + (marks.length ? ", " + marks.join(", ") : ""),
      spot: e.spot || "–", exp: m.xp != null ? fmtBig(m.xp) : "–", profit: m.profit != null ? fmtBig(m.profit) : "–", badge: numbersBadge(e), rel: d.scores[c.slug] };
  };
  const items = pool.map(item), byScore = (a, b) => (b.rel == null ? -1 : b.rel) - (a.rel == null ? -1 : a.rel) || a.name.localeCompare(b.name);
  const tiers = TIER_IDS.map((t) => ({ id: t, label: "Tier " + t, items: items.filter((x) => !x.avoid && x.tier === t).sort(byScore) }));
  tiers.push({ id: "X", label: "Avoid", items: items.filter((x) => x.avoid).sort(byScore) });
  const unscored = items.filter((x) => !x.avoid && !x.tier).sort((a, b) => a.name.localeCompare(b.name));
  return {
    sub: DIFF_NAME[diff] + (diff === "all" ? " tasks" : " bounties") + " · " + displayName(p),
    intro: "How good each creature is as a bounty for your goal mix (" + goalMixView(readGoal(p)).chip.value + ").",
    difficulty: diff, difficulties: CREATURE_DIFFS.map((value) => ({ value, label: DIFF_NAME[value] })), mode: ui.mode === "table" ? "table" : "tiers", query: ui.query || "",
    tiers, unscored, unscoredText: plural(unscored.length, "creature") + " without numbers yet",
    table: items.slice().sort(byScore),
    empty: items.length ? "" : q ? "No creature matches “" + String(ui.query).trim() + "”." : "No creatures in this pool.",
    lists: ui.lists ? slotsView(state, model, catalog, diff === "all" ? "master" : diff, ui.add || {}) : null,
  };
}

// The Preferred and Unwanted lists (the in-game ones) with board odds and suggestions, for a task difficulty.
// add: {preferred, unwanted}, what's typed in each field.
export function slotsView(state, model, catalog, diff, add) {
  const p = state.profiles[state.pid] || {}, sl = model.slots(), d = model.derived, pool = catalog.poolOf(diff);
  const st = {};
  Object.keys(d.tiers).forEach((k) => { st[k] = { tier: d.tiers[k], rel: d.scores[k] }; });
  const info = (c) => ({ avoided: model.ratingOf(c) === "X", locked: model.lockedFor(c), minLevel: model.minLevelFor(c), score: st[c.slug] });
  const taken = sl.preferred.concat(sl.unwanted);
  const list = (which) => {
    const rows = sl[which].map((slug) => {
      const c = catalog.bySlug[slug], x = info(c), bits = [];
      let warn = false;
      if (!creatureInPool(c, diff)) { bits.push("Not in the " + DIFF_NAME[diff] + " pool, so this slot does nothing there"); warn = true; }
      if (x.locked) { bits.push("Needs level " + x.minLevel); warn = true; }
      if (x.score) bits.push("Score " + x.score.tier);
      if (x.avoided) bits.push("Avoided");
      if (!bits.length) bits.push("No hunt data yet");
      return { slug, name: c.name, why: bits.join(", "), warn };
    });
    const full = rows.length >= SLOTS.max, q = norm((add || {})[which] || "");
    return {
      which, title: which === "preferred" ? "Preferred" : "Unwanted", rows, empty: Math.max(0, SLOTS.max - rows.length), full,
      suggestions: full ? [] : slotSuggestions(which, pool, taken, info, 5).map((s) => ({ slug: s.it.slug, name: s.it.name, why: s.why })),
      none: full ? "All five slots are filled." : which === "preferred" ? "Log hunts to get suggestions." : "Mark creatures Avoid or set minimum levels to get suggestions.",
      typed: (add || {})[which] || "",
      matches: q && !full ? pool.filter((c) => taken.indexOf(c.slug) === -1 && c.key.indexOf(q) !== -1).slice(0, 6).map((c) => ({ slug: c.slug, name: c.name })) : [],
    };
  };
  const so = slotOdds(pool, sl, (slug) => { const c = catalog.bySlug[slug], x = info(c); return !x.locked && !x.avoided && !!(x.score && (x.score.tier === "S" || x.score.tier === "A")); });
  const oneIn = (v) => (v > 0 ? " (about 1 board in " + (1 / v < 10 ? Math.round(10 / v) / 10 : Math.round(1 / v)) + ")" : "");
  const odds = [displayName(p) + " on " + DIFF_NAME[diff] + " tasks: " + so.poolSize + " creatures in the pool" + (so.unwanted ? ", " + so.unwanted + " removed by Unwanted" : "") + "."];
  if (so.preferred) {
    odds.push(pct(so.pAny) + " of boards show at least one of your Preferred creatures" + oneIn(so.pAny) + ".");
    odds.push("Each Preferred creature shows up on about " + pct(so.pEach) + " of boards, versus " + pct(so.pBase) + " without a slot.");
  } else odds.push("Add Preferred creatures to see how often they’ll show up on your board.");
  if (so.good) odds.push("Boards with at least one S or A creature for you (" + so.good + " of them): about " + pct(so.pGood) + oneIn(so.pGood) + ".");
  return { difficulty: diff, intro: "Mirror the lists you set in game: Preferred creatures show up more often, Unwanted ones never. Five of each.",
    preferred: list("preferred"), unwanted: list("unwanted"), odds, note: "Odds follow a community model of the board, not official numbers." };
}

// One creature's page. model: the model for the Creatures screen's difficulty (diff); ui: {notes (a draft)};
// advanced: Advanced mode. Null for an unknown creature.
export function creatureView(state, model, catalog, slug, diff, ui, advanced) {
  const c = catalog.bySlug[slug];
  if (!c) return null;
  ui = ui || {};
  const p = state.profiles[state.pid] || {}, d = model.derived, entry = state.entries[slug] || {}, e = model.eff(c), sl = model.slots(), tags = creatureTags(model);
  // Its own task difficulty when the list shows all tasks, or when it isn't in that pool.
  const cdiff = diff !== "all" && creatureInPool(c, diff) ? diff : topPool(c), m = model.metricsFor(c, e, cdiff) || {};
  const idx = model.spotIndex(), dash = "–", tag = tags[c.slug];
  const b = bestiaryOf(c);
  const bestiary = b.kills.toLocaleString("en-US") + " kills for " + b.charmPoints + " charm points." + (c.r ? " It’s a rare creature, so it can’t start Echo Raids and has no Echo Warden bonus."
    : " Your first Echo Warden kill gives " + b.warden + " more. Wardens lead " + (entry.bestiaryDone ? "20%" : "10%") + " of Echo Raids" + (entry.bestiaryDone ? " now that the bestiary is finished." : ", 20% once the bestiary is finished."));

  // Where the numbers come from.
  let source = "No numbers yet: log a clean hunt where it lives, or switch on reference hunts (Characters).";
  if (e.src === "own") source = !e.fromSessions ? "From numbers you typed (Advanced)." : (manualNums(entry) ? "From numbers you typed and your hunts at " : "From your hunts at ") + e.spot + ".";
  else if (e.refEntry) {
    const ev = e.refEntry.vocation, who = (e.refEntry.source || {}).who;
    source = (e.src === "refAdj" ? "A reference hunt at " + e.spot + ", adjusted to you" : e.src === "ref" ? "A reference hunt at " + e.spot + ", as recorded"
      : aVoc(ev) + "’s reference hunt at " + e.spot + (e.src === "otherAdj" ? ", adjusted to you" : ", as recorded")) + (who ? " (" + who + ")" : "") + "." +
      (e.src === "ref" ? " Log a hunt at any reference spot to adjust these to you." : e.src === "other" ? " Log a hunt at a spot that also has " + aVoc(ev) + " reference to adjust them." : "") +
      (e.profitStale ? " " + staleProfitText(e.refEntry) + "." : "");
  }

  // Its spots: the ones its numbers can come from (the used one first), then reference spots not used and why.
  const dv = d.derived[slug], shadow = (d.refShadow || {})[slug] || [], best = dv ? dv.best : null;
  const UNUSED = { own: "Not used: you have your own numbers.", voc: "Not used: there’s a reference for your vocation.", off: "Not used: other vocations’ hunts are switched off." };
  const spots = (dv ? dv.spots : []).concat(shadow).slice().sort((x, y) => (y === best) - (x === best) || (!!x.ref - !!y.ref) || y.xph - x.xph).map((s) => {
    const sm = model.metricsFor(c, Object.assign({}, entry, { kph: s.kph, xph: s.xph, pph: s.pph, spot: s.spot }), cdiff) || {};
    const used = s === best, unused = shadow.indexOf(s) !== -1;
    return { name: s.spot, id: idx.idOf(s.spot), kph: s.kph != null ? Math.round(s.kph) + "/h" : dash, exp: sm.xp != null ? fmtBig(sm.xp) + " exp/h" : dash,
      profit: s.pph != null ? fmtBig(s.pph) + " profit/h" : dash, used, badge: s.ref ? numbersBadge(s) : { kind: "yours", text: "Yours" },
      note: used ? (dv.pinned ? "Used (pinned)." : "Used.") : unused ? UNUSED[s.unused] || UNUSED.own
        : s.ref ? "" : fmtHours(s.hours) + " logged" + (s.nBreak ? " + " + s.nBreak + " with breaks" : "") + "." };
  });

  const ml = model.minLevelFor(c), voc = p.vocation || VOCATIONS[0];
  return {
    slug, name: c.name, classLine: classLine(c), wiki: wikiUrl(c),
    scoreLine: d.tiers[slug] ? "Tier " + d.tiers[slug] + " · score " + pct100(d.scores[slug]) + " on " + DIFF_NAME[diff] + " tasks" : "Not scored: " + (e.kph == null && e.xph == null ? "no numbers yet." : "missing a number your goal mix weighs."),
    marks: [tag === "bounty" ? "Your bounty" : tag && tag !== "weekly" ? "Bounty " + tag : null, tag === "weekly" ? "Weekly task" : null, model.lockedFor(c) ? "Needs level " + ml + " for " + voc + "s" : null].filter(Boolean),
    stats: [["Exp/h", m.xp != null ? fmtBig(m.xp) : dash], ["Profit/h", m.profit != null ? fmtBig(m.profit) : dash], ["Kills/h", e.kph != null ? String(Math.round(e.kph)) : dash],
      ["Task time", m.hours ? fmtHours(m.hours) : dash], ["Charm/h", m.charm != null ? fmtSmall(m.charm) : dash], ["Bounty pts/h", m.bounty != null ? fmtSmall(m.bounty) : dash]].map(([label, value]) => ({ label, value })),
    badge: numbersBadge(e), source, weekly: m.weeklyXph > 0 ? "Exp/h includes " + fmtBig(m.weeklyXph) + " from open weekly tasks at " + e.spot + "." : "",
    spots, noSpots: "No hunts or reference spots for it yet.",
    preferred: sl.preferred.indexOf(slug) !== -1, unwanted: sl.unwanted.indexOf(slug) !== -1, avoid: model.ratingOf(c) === "X",
    listsNote: "Preferred and Unwanted mirror the in-game lists (five each). Avoid keeps it out of your tiers and the plan’s offers.",
    bestiary, bestiaryDone: !!entry.bestiaryDone, wardenDone: !!entry.wardenDone, rare: !!c.r,
    notes: ui.notes != null ? ui.notes : entry.notes || "",
    advanced: advanced ? {
      nums: NUM_FIELDS.map((k) => ({ key: k, label: k === "kph" ? "Kills/h" : k === "xph" ? "Exp/h" : "Profit/h", value: fmtField(k, entry[k]) })),
      pin: dv ? { value: dv.pinned ? best.spot : "", options: [{ value: "", label: "Best for my goal" + (dv.pinned ? "" : " (" + best.spot + ")") }].concat(dv.spots.map((s) => ({ value: s.spot, label: s.spot }))) } : null,
      minLevel: ml ? String(ml) : "", minLevelLabel: "Usable from level (" + voc + "s)",
    } : null,
    updated: entry.updatedAt ? "Last edited " + fmtDay(entry.updatedAt.slice(0, 10)) : "",
  };
}
