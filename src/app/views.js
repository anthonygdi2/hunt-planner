// View models: plain data shaped for a screen, so the UI makes no decisions. Visible text is in the current language
// (app/lang.js): strings are written in English and translated with t(); tables keep English marked with _() and are
// translated where they're shown.

import { VOCATIONS, PREY, PREY_SLOTS, EXP_EVENTS, SLOTS } from "../data/rules.js";
import { readSources, sourcesPreset, SOURCE_PRESETS, readSettings, TAKEN_MINUTES, THEMES, readGoal, readHunting } from "../store/schema.js";
import { GOAL_KEYS, PRESET_IDS, presetOf } from "../core/score.js";
import { fmtBig, fmtHours, fmtSmall, fmtField, pct, norm } from "../core/text.js";
import { creatureInPool, poolsOf, topPool } from "../core/catalog.js";
import { bestiaryOf } from "../core/metrics.js";
import { manualNums, NUM_FIELDS } from "../core/numbers.js";
import { staleProfitText } from "../core/reference.js";
import { slotOdds, slotSuggestions } from "../core/slots.js";
import { aVoc } from "../core/explain.js";
import { parseSession, sessionProblems } from "../core/session.js";
import { weekKey, serverDay } from "../core/weekly.js";
import { markAge, markActive } from "../core/occupancy.js";
import { isChallengingMaster } from "../core/rewards.js";
import { t, _, translator, locale } from "./lang.js";
import { LANGS } from "../core/i18n.js";

// The language options, each in its own language.
const langOptions = () => LANGS.map(([value, label]) => ({ value, label }));

// Short vocation names, as players write them.
export const VOC_SHORT = { "Elite Knight": "EK", "Royal Paladin": "RP", "Elder Druid": "ED", "Master Sorcerer": "MS", "Exalted Monk": "EM" };

// A character's name, or "EK 615" until it has one.
export function displayName(p) {
  p = p || {};
  if (p.name && String(p.name).trim()) return String(p.name).trim();
  return (VOC_SHORT[p.vocation] || t("Character")) + (p.level ? " " + p.level : "");
}

// The header: app name and the character switcher ("Main EK ▾" over "Elite Knight · 615").
export function headerView({ profile }) {
  if (!profile) return { appName: "Hunt Planner", character: null };
  const name = displayName(profile), voc = profile.vocation || VOCATIONS[0], sub = voc + (profile.level ? " · " + profile.level : "");
  return { appName: "Hunt Planner", character: { name, sub,
    label: profile.level ? t("Character: {name}, {voc} level {level}. Change character", { name, voc, level: profile.level }) : t("Character: {name}, {voc}. Change character", { name, voc }) } };
}

// First run: the five vocations and a level; ready once the level is a number.
export function firstRunView({ vocation, level, lang }) {
  vocation = VOCATIONS.indexOf(vocation) !== -1 ? vocation : VOCATIONS[0];
  const lvl = String(level || "").replace(/[^0-9]/g, "").slice(0, 4), ready = !!vocation && Number(lvl) > 0;
  return {
    vocations: VOCATIONS.map((v) => ({ name: v, pressed: v === vocation })), level: lvl, ready, lang, langs: langOptions(),
    note: ready ? t("{voc}, level {level}.", { voc: vocation, level: lvl }) : t("Type your level to continue."),
  };
}

// The goal mixer (Plan's Goal chip and its editor). goal: the character's weights 0-5 (store readGoal).
const GOAL_ROWS = [["xp", _("Exp")], ["profit", _("Profit")], ["charm", _("Charm points")], ["bounty", _("Bounty points")]];
const PRESET_LABELS = { exp: _("Exp"), profit: _("Profit"), mostly: _("Mostly exp, some profit"), balanced: _("Balanced"), charm: _("Charm points"), bounty: _("Bounty points") };
export function goalMixView(goal) {
  const preset = presetOf(goal), total = GOAL_KEYS.reduce((a, k) => a + goal[k], 0);
  const split = GOAL_ROWS.filter(([k]) => goal[k] > 0).map(([key, name]) => ({ key, name: t(name), pct: Math.round(goal[key] / total * 100) }));
  return {
    chip: { label: t("Goal"), value: preset === "custom" ? t("Custom mix") : t(PRESET_LABELS[preset]), set: true },
    presets: PRESET_IDS.map((id) => ({ id, label: t(PRESET_LABELS[id]), pressed: id === preset })),
    rows: GOAL_ROWS.map(([key, name]) => ({ key, name: t(name), value: goal[key],
      options: [0, 1, 2, 3, 4, 5].map((n) => ({ n, pressed: goal[key] === n, label: n === 0 ? t("{goal} weight 0, off", { goal: t(name) }) : t("{goal} weight {n}", { goal: t(name), n }) })) })),
    split, shareText: total === 0 ? t("Nothing weighted yet, so the plan uses Exp.") : split.map((p) => p.name + " " + p.pct + "%").join(" · "),
  };
}

// The Bounty chip and its editor. b: the model's bounty(); catalog: makeCatalog(...).
const DIFF_LABELS = [["master", _("Master")], ["expert", _("Expert")], ["adept", _("Adept")], ["beginner", _("Beginner")]];
const diffOptions = () => DIFF_LABELS.map(([value, label]) => ({ value, label: t(label) }));
// slots: the model's {preferred, unwanted} lists (slugs), or none.
export function bountyView(b, catalog, slots) {
  const sl = slots || { preferred: [], unwanted: [] };
  const mark = (slug) => (!slug ? null : sl.preferred.indexOf(slug) !== -1 ? { kind: "pref", text: "★ " + t("Preferred") }
    : sl.unwanted.indexOf(slug) !== -1 ? { kind: "unw", text: "⊘ " + t("Unwanted") } : null);
  const c = (slug) => (slug && catalog.bySlug[slug]) || null, name = (slug) => (c(slug) ? c(slug).name : "");
  const tokens = b.tokens == null ? t("tokens not set") : b.assumed ? t.n(b.tokens, "{n} token (assumed)", "{n} tokens (assumed)") : t.n(b.tokens, "{n} token", "{n} tokens");
  const n = b.offers.filter((o) => o.slug).length;
  const active = b.mode === "active" && b.active;
  const chip = active ? { set: true, value: name(b.active.slug) + " · " + tokens }
    : n ? { set: true, value: t.n(n, "{n} offer", "{n} offers") + " · " + tokens } : b.tokens != null ? { set: true, value: t("No offers") + " · " + tokens } : { set: false, value: "" };
  return {
    chip: Object.assign({ label: t("Bounty"), warn: b.tokens === 0 }, chip), mode: active ? "active" : "offers", difficulty: b.difficulty, tokens: b.tokens,
    tokensNote: b.assumed ? t("Assumed. Set what you have in game.") : b.tokens === 0 ? t("None left: the plan won’t suggest a reroll.") : "",
    difficulties: diffOptions(),
    intro: active ? t("Your active bounty, as the game shows it.") : t("The three offers on your board."),
    lists: sl.preferred.length || sl.unwanted.length ? t("★ Preferred {preferred} of {max} · ⊘ Unwanted {unwanted} of {max}", { preferred: sl.preferred.length, unwanted: sl.unwanted.length, max: SLOTS.max })
      : t("Preferred and Unwanted lists: not set"),
    offers: b.offers.map((o, i) => ({ i, letter: "ABC"[i], name: name(o.slug), kills: o.kills, kind: o.kind, exp: o.exp, mark: mark(o.slug),
      showExp: isChallengingMaster(b.difficulty, c(o.slug)), canPick: !!o.slug })),
    active: active ? { name: name(b.active.slug), kills: b.active.kills, killsLeft: b.active.killsLeft, kind: b.active.kind, exp: b.active.exp,
      showExp: isChallengingMaster(b.difficulty, c(b.active.slug)) } : null,
    note: t("Pick in game only once the spot is free: the other offers disappear."),
    suggestions: catalog.poolOf(b.difficulty).map((x) => x.name),
  };
}

// The Plan screen (F2: Goal; F3: Bounty; F4 adds the rest). model: the active character's model; catalog for names.
export function planView(state, model, catalog) {
  const p = state.profiles[state.pid] || {};
  return { goal: goalMixView(readGoal(p)), bounty: model && catalog ? bountyView(model.bounty(), catalog, model.slots()) : null };
}

const MINUTES_LABEL = { 30: _("30 minutes"), 45: _("45 minutes"), 60: _("1 hour"), 120: _("2 hours") };
// How the reference is adjusted to this character, in plain words (Characters page).
export function calibrationText({ sources, calib, calibOther }) {
  if (!sources.reference) return t("Reference hunts are off, so only your own logged hunts are used.");
  const others = Object.keys(calibOther || {}).filter((v) => calibOther[v]);
  if (!calib) return t("Not adjusted to you yet: log a clean hunt at a spot with a reference hunt.");
  return sources.otherVocation && others.length
    ? t.n(calib.spots.length, "Adjusted to you from {n} logged spot (other vocations too: {others}).", "Adjusted to you from {n} logged spots (other vocations too: {others}).", { others: others.join(", ") })
    : t.n(calib.spots.length, "Adjusted to you from {n} logged spot.", "Adjusted to you from {n} logged spots.");
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
      presets: [["mine", _("Mine only")], ["reference", _("+ Reference")], ["everything", _("Everything")]].map(([value, label]) => ({ value, label: t(label), switches: SOURCE_PRESETS[value] })),
      calibration: p ? calibrationText({ sources, calib: d && d.calib, calibOther: d && d.calibOther }) : "" },
    settings: { world: settings.world || "", takenMinutes: settings.takenMinutes, takenOptions: TAKEN_MINUTES.map((m) => ({ value: m, label: t(MINUTES_LABEL[m]) })) },
    advanced: state.advanced, theme: state.theme, themes: THEMES, lang: state.lang, langs: langOptions(),
    langNote: state.lang && state.lang !== "en" ? t("Translations are new: if something reads wrong, please report it.") : "",
    backupNote: state.local ? t("Your data stays in this browser. A backup moves it to another device.") : t("Your data syncs across your devices."),
    notice: state.notice,
  };
}


// ---------- the Plan screen (F4) ----------
const HOURS = [[null, _("No limit")], [0.5, "30 min"], [1, "1 h"], [1.5, "1.5 h"], [2, "2 h"], [3, "3 h"], [4, "4 h"]];
const PREY_KINDS = [["xp", _("Exp")], ["loot", _("Loot")], ["damage", _("Damage")], ["defense", _("Defense")]];
const SOURCE_LABELS = { mine: _("Mine only"), reference: _("+ Reference"), everything: _("Everything"), custom: _("Custom") };

// The badges for a spot's numbers: where they come from, how old, how thin. sessions: hunts logged there.
export function sourceBadges(o, sessions) {
  const out = [], e = o.entry || {};
  if (o.src === "own") out.push({ kind: "yours", text: t.n(sessions || 0, "Yours · {n} hunt", "Yours · {n} hunts") });
  else if (o.src === "refAdj") out.push({ kind: "refAdj", text: t("Reference, adjusted to you") });
  else if (o.src === "ref") out.push({ kind: "ref", text: t("Reference") });
  else if (o.src === "other" || o.src === "otherAdj") out.push({ kind: "other", text: t("Other vocation") });
  if (e.source && e.source.postRebalance === false) out.push({ kind: "older", text: t("Older · before the rebalance") });
  if (o.src === "own" && (o.huntHours != null ? o.huntHours : 0) < 1 && sessions < 2) out.push({ kind: "low", text: t("Low sample") });
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
  // Only when the spot has the bounty's (or the offer's) creature.
  const bountyLine = (s) => (!s.offer || !s.option.held ? null : s.offer.held ? t("Counts for your bounty: {creature}", { creature: s.offer.name })
    : t("For offer {letter}: {creature}. Pick it once the spot is free.", { letter: "ABC"[s.offer.i], creature: s.offer.name }));
  const card = (s) => { const o = s.option; return { id: o.id, title: s.text, name: o.name, bounty: bountyLine(s), exp: fmtBig(o.m.xp), profit: o.m.profit != null ? fmtBig(o.m.profit) : "–",
    badges: sourceBadges(o, sessionsAt(o.id)), why: s.why, offer: s.offer && !s.offer.held ? { i: s.offer.i, letter: "ABC"[s.offer.i], name: s.offer.name } : null }; };
  const go = ch.steps.filter((s) => s.kind === "go").map(card), last = ch.steps[ch.steps.length - 1], b = model.bounty();
  const end = last.kind === "reroll" ? { kind: "reroll", title: last.label,
    line: (last.dropsBounty ? t("Drops your bounty.") + " " : "") + t.n(last.tokens, "{n} token left.", "{n} tokens left."), why: last.why }
    : { kind: "seeSpots", title: last.label, line: b.tokens === 0 ? t("No reroll tokens left.") : t("Every spot, best first."), why: last.why };
  // At 0 tokens the player confirms it once per server day (the daily token may be waiting); it replaces the claim step.
  const tokenCheck = b.tokens === 0 && !b.assumed && b.zeroChecked !== serverDay(now) ? { title: t("Out of reroll tokens?"),
    text: t("At 0 the plan can’t suggest a reroll. Claim today’s free token on the Task Board if you haven’t, then set how many you have.") } : null;
  const notices = ch.steps.filter((s) => s.kind === "finish").map((s) => ({ kind: s.kind, text: s.text, why: s.why }));
  const first = go[0] || null;
  const refNote = first && (first.badges[0] || {}).kind !== "yours" && (first.badges[0] || {}).kind !== "refAdj" ? t("Top players’ numbers: expect less until you log a hunt.") : null;

  // Taken spots: marks still in effect.
  const taken = Object.keys(pl.marks || {}).filter((id) => pl.marks[id].state === "taken" && markActive(pl.marks[id], now, settings.takenMinutes)).map((id) => {
    const age = Math.round(markAge(pl.marks[id], now)), left = Math.max(1, Math.ceil(settings.takenMinutes - markAge(pl.marks[id], now)));
    return { id, name: spotName(id), meta: (age < 1 ? t("Marked just now") : t("Marked {min} min ago", { min: age })) + " · " + t("clears in {min} min", { min: left }) };
  });

  // Hunting now: with offers still to choose, the offer this spot is for is the one to pick now.
  let huntingView = null;
  if (hunting) {
    const opt = ch.options.filter((o) => o.id === hunting.spotId)[0], off = opt && opt.offer && !opt.offer.held ? opt.offer : null;
    huntingView = { spotId: hunting.spotId, name: spotName(hunting.spotId), pick: off ? { i: off.i, letter: "ABC"[off.i], name: off.name } : null };
  }

  // The other chips and their editors.
  const wk = model.weekly(), rows = model.weeklyRows().filter((r) => r.name), done = rows.filter((r) => r.done);
  const anyTask = wk.current && wk.any && (wk.any.killsLeft != null || wk.any.done) ? { left: wk.any.killsLeft, done: wk.any.done } : null;
  const weekly = { chip: (rows.length || anyTask) && wk.current ? { set: true, value: t("{done} of {slots} done", { done: done.length, slots: wk.slots }) } : { set: false, value: "" },
    rows: wk.current ? rows.map((r) => ({ i: r.i, name: r.name, left: r.killsLeft, done: r.done })) : [], any: anyTask };
  const td = model.today(), prey = (td.prey || []).filter((q) => q.slug);
  const todayParts = [td.boosted ? t("{creature} boosted", { creature: name(td.boosted) }) : null, prey.length ? t.n(prey.length, "{n} prey", "{n} preys") : null,
    td.event ? t("+{pct}% event", { pct: td.event }) : null].filter(Boolean);
  const today = { chip: todayParts.length ? { set: true, value: todayParts.join(" · ") } : { set: false, value: "" },
    boosted: name(td.boosted), prey: ((st.today || {}).prey || []).map((q, i) => ({ i, name: name(q.slug), kind: q.kind, pct: q.pct,
      kinds: PREY_KINDS.map(([value, label]) => ({ value, label: t(label) })), sizes: preySizes(q.kind) })),
    canAddPrey: ((st.today || {}).prey || []).length < PREY_SLOTS, event: td.event || 0,
    events: [{ value: 0, label: t("No exp event") }, { value: EXP_EVENTS.double, label: t("Double experience (+{pct}%)", { pct: EXP_EVENTS.double }) }]
      .concat(EXP_EVENTS.world.map((x) => ({ value: x, label: t("World bonus +{pct}%", { pct: x }) }))), names: catalog.list.map((c) => c.name) };
  const hourLabel = (h) => { const x = HOURS.filter((y) => y[0] === h)[0]; return x ? t(x[1]) : h + " h"; };
  const time = { chip: st.fixedHours ? { set: true, value: hourLabel(st.fixedHours) } : { set: false, value: "" },
    value: st.fixedHours || null, options: HOURS.map(([value, label]) => ({ value, label: t(label) })) };
  const preset = sourcesPreset(sources);
  const data = { chip: { set: true, value: t(SOURCE_LABELS[preset]) }, preset,
    presets: ["mine", "reference", "everything"].map((value) => ({ value, label: t(SOURCE_LABELS[value]), switches: SOURCE_PRESETS[value] })) };

  return Object.assign(base, { weekly, today, time, data, steps: { first, fallbacks: go.slice(1), end, notices, tokenCheck, refNote, notes: ch.notes }, taken, hunting: huntingView });
}
function preySizes(kind) { const r = PREY[kind] || PREY.xp, out = []; for (let v = r.lo; v <= r.hi; v += r.step) out.push({ value: v, label: v + "%" }); return out; }

// ---------- the Weekly screen (F5) ----------
const DAY = 864e5;
const fmtDay = (iso) => new Date(iso + "T12:00:00Z").toLocaleDateString(locale(), { month: "short", day: "numeric", timeZone: "UTC" });
// w: the model's weekly(); rows: weeklyRows(); now (ms). The week's dates, difficulty and slots, one row per slot.
export function weeklyView(w, rows, catalog, now) {
  const thisWeek = weekKey(new Date(now)), start = w.current && w.weekStart ? w.weekStart : thisWeek;
  const next = new Date(Date.parse(start + "T08:00:00Z") + 7 * DAY).toISOString().slice(0, 10);
  const slots = [];
  for (let i = 0; i < w.slots; i++) { const r = rows[i] || {}; slots.push({ i, name: r.name || "", killsLeft: r.killsLeft == null ? "" : r.killsLeft, done: !!r.done }); }
  return {
    intro: t("Week of {start} · new tasks {next}", { start: fmtDay(start), next: fmtDay(next) }),
    stale: !w.current, staleText: t("A new week has started."),
    difficulty: w.difficulty, difficulties: diffOptions(), slots: w.slots,
    slotOptions: [{ value: 6, label: "6" }, { value: 9, label: t("9 (with expansion)") }],
    any: { killsLeft: w.any && w.any.killsLeft != null ? w.any.killsLeft : "", done: !!(w.any && w.any.done) },
    rows: slots, doneCount: slots.filter((r) => r.done).length, reward: w.exp ? t("{exp} exp each", { exp: fmtBig(w.exp) }) : t("Set your level to see the reward."),
    names: catalog.list.map((c) => c.name),
  };
}

// ---------- Log a clean hunt (F6) ----------
// draft: the page's own state {text, where "known" | "new", spotId, name, parentId, note, raids {name: n}}; model and
// catalog for the spots and numbers; advanced: show raid counts.
export function logView(draft, model, catalog, advanced) {
  const p = draft.text ? parseSession(draft.text, catalog) : null, problem = draft.text ? sessionProblems(p, translator()) : "";
  const idx = model.spotIndex(), byName = (a, b) => a.name.localeCompare(b.name);
  const parents = idx.list.filter((s) => !s.parentId).slice().sort(byName);
  const spots = [];
  parents.forEach((s) => {
    spots.push({ value: s.id, label: s.userMade ? t("{spot} (yours)", { spot: s.name }) : s.name });
    idx.list.filter((v) => v.parentId === s.id).sort(byName).forEach((v) => spots.push({ value: v.id, label: t("{spot} (yours)", { spot: s.name + " · " + v.name }) }));
  });
  const ok = p && !problem;
  const exp = ok ? ((p.rawXp != null ? p.rawXp : p.xp) || 0) / p.hours : null, profit = ok && p.balance != null ? p.balance / p.hours : null;
  const nameTaken = draft.where === "new" && draft.name && idx.idOf(draft.name) && !(idx.spots[idx.idOf(draft.name)] || {}).userMade;
  const where = draft.where === "new" ? "new" : "known", spotId = draft.spotId && idx.spots[draft.spotId] ? draft.spotId : (spots[0] || {}).value || null;
  const kills = ok ? p.kills.slice().sort((a, b) => b.count - a.count) : [];
  return {
    text: draft.text || "", problem,
    read: ok ? t.n(p.kills.length, "Read it: {time}, {n} creature type.", "Read it: {time}, {n} creature types.", { time: fmtHours(p.hours) }) : "",
    preview: ok ? p : null, where, spotId, spots, parents: [{ value: "", label: t("None, it’s a new spot") }].concat(parents.map((s) => ({ value: s.id, label: s.name }))),
    name: draft.name || "", parentId: draft.parentId || "", note: draft.note || "",
    nameHint: nameTaken ? t("There’s already a spot called that. Pick it under Known spot, or give this one its own name.") : "",
    exp: exp != null ? fmtBig(exp) : "–", profit: profit != null ? fmtBig(profit) : "–",
    kph: kills.map((k) => ({ name: k.name, perHour: Math.round(k.count / p.hours) + "/h" })),
    raids: advanced && ok ? kills.map((k) => ({ name: k.name, value: (draft.raids || {})[k.name] || "" })) : null,
    canSave: !!ok && (where === "known" ? !!spotId : !!(draft.name && draft.name.trim()) && !nameTaken),
  };
}

// ---------- Spots and the spot page (F7) ----------
const SORTS = [["score", _("Score")], ["exp", _("Exp/h")], ["profit", _("Profit/h")]];
const LEGEND = [
  ["yours", _("Yours"), _("from your own logged hunts.")],
  ["refAdj", _("Reference, adjusted to you"), _("a published hunt, scaled by how your logged hunts compare.")],
  ["ref", _("Reference"), _("a published hunt as recorded, likely more than you’ll get.")],
  ["other", _("Other vocation"), _("another vocation’s hunt, used only when nothing better exists.")],
  ["older", _("Older"), _("recorded before the last rebalance.")],
  ["low", _("Low sample"), _("one or two hunts, so treat it as a rough guide.")],
];
// What the source badges mean, in the current language.
export const badgeLegend = () => LEGEND.map(([kind, name, text]) => ({ kind, name: t(name), text: t(text) }));
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
// What the bounty and the weekly tasks make of each creature: {kind "bounty" | "offer" | "weekly", letter}.
function creatureTags(model) {
  const b = model.bounty(), tags = {};
  model.openWeeklies().forEach((w) => { tags[w.key] = { kind: "weekly" }; });
  if (b.mode === "active" && b.active) tags[b.active.slug] = { kind: "bounty" };
  else b.offers.forEach((o, i) => { if (o.slug) tags[o.slug] = { kind: "offer", letter: "ABC"[i] }; });
  return tags;
}
// A tag in running text ("your bounty", "offer B", "weekly task") and as a label ("Your bounty", "Bounty offer B", "Weekly task").
const tagText = (g) => (!g ? null : g.kind === "bounty" ? t("your bounty") : g.kind === "weekly" ? t("weekly task") : t("offer {letter}", { letter: g.letter }));
const tagLabel = (g) => (!g ? null : g.kind === "bounty" ? t("Your bounty") : g.kind === "weekly" ? t("Weekly task") : t("Bounty offer {letter}", { letter: g.letter }));
// Only duo or team hunts are recorded at this spot (the plan counts solo hunts).
const teamOnly = (sp) => sp.entries.length > 0 && !sp.sessions.length && sp.entries.every((e) => e.team && e.team !== "solo");
const perHourPair = (o) => t("{exp} exp/h · {profit} profit/h", { exp: fmtBig(o.m.xp), profit: o.m.profit != null ? fmtBig(o.m.profit) : "–" });
// A spot's creatures, most kills per hour first (as listed when there are no numbers).
const byKph = (kph, creatures) => (kph ? Object.keys(kph).filter((s) => kph[s] > 0).sort((a, b) => kph[b] - kph[a]) : Object.keys(creatures));
const takenText = (min) => t("Taken · clears in {min} min", { min });

// The Spots list. ui: {query, sort "score" | "exp" | "profit", allVocations, anyLevel, hideTaken, limit}; now (ms).
export function spotsView(state, model, catalog, ui, now) {
  const lens = { allVocations: !!ui.allVocations, anyLevel: !!ui.anyLevel }, sort = ui.sort || "score";
  const { idx, byId } = spotOptions(model, lens), taken = takenLeft(state, now), tags = creatureTags(model), q = norm(ui.query || "");
  const name = (slug) => (catalog.bySlug[slug] ? catalog.bySlug[slug].name : slug);
  const matches = (sp) => !q || norm(sp.name).indexOf(q) !== -1 || sp.aliases.some((a) => norm(a).indexOf(q) !== -1) ||
    Object.keys(sp.creatures).some((s) => norm(name(s)).indexOf(q) !== -1);
  const all = idx.list.filter((sp) => !model.lensCheck(sp, lens) && !(ui.hideTaken && taken[sp.id]) && matches(sp));
  const key = (sp) => { const o = byId[sp.id]; return !o ? null : sort === "exp" ? o.m.xp : sort === "profit" ? o.m.profit : o.v; };
  all.sort((a, b) => { const x = key(a), y = key(b); return x == null && y == null ? a.name.localeCompare(b.name) : x == null ? 1 : y == null ? -1 : y - x; });
  const limit = ui.limit > 0 ? ui.limit : 50;
  const rows = all.slice(0, limit).map((sp) => {
    const o = byId[sp.id], parent = sp.parentId && idx.spots[sp.parentId];
    const cr = byKph(o && o.kph, sp.creatures).slice(0, 5).map((s) => name(s) + (tags[s] ? " (" + tagText(tags[s]) + ")" : ""));
    return { id: sp.id, name: sp.name, sub: parent ? t("Your variation of {spot}", { spot: parent.name }) : sp.userMade ? t("Your spot") : null,
      score: o && o.score != null ? String(o.score) : null, numbers: o ? perHourPair(o) : null,
      none: o ? null : teamOnly(sp) ? t("Only duo or team hunts recorded here") : t("Not enough data for your vocation"),
      creatures: cr.join(", "), badges: o ? sourceBadges(o, sp.sessions.length) : [],
      taken: taken[sp.id] ? takenText(taken[sp.id]) : null };
  });
  return {
    query: ui.query || "", sort, sorts: SORTS.map(([value, label]) => ({ value, label: t(label) })),
    toggles: [["allVocations", _("All vocations")], ["anyLevel", _("Any level")], ["hideTaken", _("Hide taken")]].map(([k, label]) => ({ key: k, label: t(label), on: !!ui[k] })),
    count: t.n(all.length, "{n} spot", "{n} spots"),
    rows, more: Math.max(0, all.length - limit),
    empty: all.length ? "" : q ? t("No spot or creature matches “{query}”.", { query: String(ui.query).trim() }) : t("No spots fit. Try All vocations or Any level."),
    legend: badgeLegend(),
  };
}

const fmtMonth = (iso) => new Date(String(iso).slice(0, 10) + "T12:00:00Z").toLocaleDateString(locale(), { month: "short", year: "numeric", timeZone: "UTC" });
const levelRange = (e) => (e.levelMin ? (e.levelMax ? t("level {min}–{max}", { min: e.levelMin, max: e.levelMax }) : t("level {min}+", { min: e.levelMin }))
  : e.levelMax ? t("up to level {max}", { max: e.levelMax }) : t("any level"));

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

  const scoreLine = o && o.score != null ? t("Score {score} for {name} · {goal}", { score: o.score, name: displayName(p), goal })
    : o ? t("No score: this spot is missing a number your goal mix weighs ({goal}).", { goal })
    : teamOnly(sp) ? t("No score: only duo or team hunts are recorded here, and the plan counts solo hunts.") : model.noNumsWhy(sp);
  const creatures = byKph(nums && nums.kph, sp.creatures).map((s) => ({ slug: s, name: name(s), perHour: nums && nums.kph[s] ? "≈ " + Math.round(nums.kph[s]) + "/h" : "",
    tag: tagLabel(tags[s]), gold: !!tags[s] && tags[s].kind !== "weekly" }));

  // Where the numbers come from: hunts here, the reference hunt (used, or the one that would be), the rest skipped.
  const hrs = sp.sessions.reduce((a, x) => a + (Number(x.hours) || 0), 0);
  const hunts = !sp.sessions.length ? t("None yet.") : nums && nums.src === "own" ? t.n(sp.sessions.length, "{n} hunt, {time}.", "{n} hunts, {time}.", { time: fmtHours(hrs) })
    : t.n(sp.sessions.length, "{n} hunt, {time}, all with breaks: no clean rate.", "{n} hunts, {time}, all with breaks: no clean rate.", { time: fmtHours(hrs) });
  const refNums = nums && nums.src === "own" ? model.spotNums(Object.assign({}, sp, { sessions: [] })) : nums;
  const e = (refNums && refNums.entry) || null;
  const mineVoc = (x) => x.vocation === vocation || x.vocation === "any";
  let reference = null;
  if (e) {
    const src = e.source || {}, recXp = p.xpMode === "xp" && e.xph > 0 ? e.xph : e.rawXph;
    const calib = e.vocation === vocation || e.vocation === "any" ? d.calib : (d.calibOther || {})[e.vocation];
    const n = calib && calib.spots ? calib.spots.length : 0;
    const from = src.who ? t("from {who}’s video", { who: src.who }) : t("from a published video");
    reference = {
      who: e.vocation + (e.team && e.team !== "solo" ? " " + e.team : "") + ", " + levelRange(e) + ", " + from +
        (src.date ? " (" + fmtMonth(src.date) + ")" : "") + (src.postRebalance === false ? ", " + t("before the rebalance") : ""),
      url: src.url || null,
      recorded: t("As recorded: {exp} exp/h · {profit} profit/h", { exp: fmtBig(recXp), profit: e.profitph != null ? fmtBig(e.profitph) : "–" }),
      adjusted: nums.src === "own" ? t("Not used: you have your own hunts here.")
        : refNums.src === "refAdj" || refNums.src === "otherAdj" ? t.n(n, "Adjusted to you: {exp} · {profit}, from how your {n} logged spot compares to its reference.",
          "Adjusted to you: {exp} · {profit}, from how your {n} logged spots compare to their references.", { exp: fmtBig(refNums.xph), profit: refNums.pph != null ? fmtBig(refNums.pph) : "–" })
        : t("Not adjusted to you yet."),
    };
  }
  const skipped = sp.entries.filter((x) => x !== e).map((x) => {
    const why = mineVoc(x) ? (Number(p.level) && x.levelMin > Number(p.level) ? t("needs level {level}", { level: x.levelMin }) : t("another hunt here fits you better"))
      : e && mineVoc(e) ? t("{aVoc} hunt exists", { aVoc: aVoc(vocation), voc: vocation }) : t("another hunt here fits you better");
    return x.vocation + ", " + levelRange(x) + ": " + why;
  });

  const varRow = (v) => {
    const vo = opts.byId[v.id] || null;
    return { id: v.id, name: v.name, score: vo && vo.score != null ? String(vo.score) : null, numbers: vo ? perHourPair(vo) : t("No numbers yet"),
      meta: [v.note, t.n(v.sessions.length, "Yours · {n} hunt", "Yours · {n} hunts"), v.sessions.length < 2 ? t("low sample") : null].filter(Boolean).join(" · ") };
  };
  const raidsOf = (x) => (x.raidsBy && typeof x.raidsBy === "object" ? x.raidsBy : {});
  const when = (x) => String(x.start || x.end || "");
  const sessions = sp.sessions.filter((x) => x.id).slice().sort((a, b) => when(b).localeCompare(when(a))).map((x) => {
    const H = Number(x.hours) || 0, xp = x.rawXp != null ? x.rawXp : x.xp, raids = raidsOf(x);
    return { id: x.id, date: when(x) ? fmtDay(when(x).slice(0, 10)) : t("Undated"), length: H ? fmtHours(H) : "–",
      exp: t("{amount} exp/h", { amount: H && xp != null ? fmtBig(xp / H) : "–" }), profit: t("{amount} profit/h", { amount: H && x.balance != null ? fmtBig(x.balance / H) : "–" }),
      breaks: !!x.breaks, armed: ui.armed === x.id, raidsBy: raids,
      raids: advanced ? (x.kills || []).map((k) => { const n = k.name || name(k.slug); return { name: n, value: raids[n] != null ? String(raids[n]) : "" }; }) : null };
  });
  const variations = idx.list.filter((v) => v.parentId === id);
  const ns = sp.sessions.length, nv = variations.length;
  return {
    id, name: sp.name, sub: parent ? t("Your variation of {spot}", { spot: parent.name }) : sp.userMade ? t("Your spot") : null, parentId: parent ? parent.id : null,
    scoreLine, exp: o ? fmtBig(o.m.xp) : nums ? fmtBig(nums.xph) : "–",
    profit: o ? (o.m.profit != null ? fmtBig(o.m.profit) : "–") : nums && nums.pph != null ? fmtBig(nums.pph) : "–",
    badges: o ? sourceBadges(o, ns) : nums ? sourceBadges(nums, ns) : [],
    taken: taken[id] ? takenText(taken[id]) : null,
    creatures, sources: { hunts, reference, skipped },
    variations: sp.parentId ? null : variations.map(varRow), canVary: !sp.parentId,
    sessions, emptySessions: t("No hunts logged here."),
    own: advanced && sp.userMade ? { name: sp.name, armed: ui.armed === "spot",
      deleteText: (ns ? t.n(ns, "Deletes this spot and its {n} hunt", "Deletes this spot and its {n} hunts") : t("Deletes this spot")) +
        (nv ? "; " + t.n(nv, "its {n} variation stays as a spot of its own", "its {n} variations stay as spots of their own") : "") + "." } : null,
  };
}

// ---------- Creatures and the creature page (F8) ----------
const TIER_IDS = ["S", "A", "B", "C", "D"];
const CLASS_NAME = { E: _("Easy"), M: _("Medium"), H: _("Hard"), C: _("Challenging") };
const DIFF_NAME = { all: _("All"), master: _("Master"), expert: _("Expert"), adept: _("Adept"), beginner: _("Beginner") };
export const CREATURE_DIFFS = ["master", "expert", "adept", "beginner", "all"];
const pct100 = (r) => String(Math.round(r * 100));
// "Hard bestiary · Expert and Master tasks".
const classLine = (c) => t("{class} bestiary · {pools} tasks", { class: t(CLASS_NAME[c.cls]), pools: t.and(poolsOf(c).map((x) => t(DIFF_NAME[x]))) });
// The wiki page for a creature (its TibiaWiki title when it differs from the name).
const wikiUrl = (c) => "https://tibia.fandom.com/wiki/" + encodeURIComponent((c.w || c.name).replace(/ /g, "_")).replace(/%27/g, "'");
// Where a creature's working numbers come from, as a badge.
function numbersBadge(e) {
  if (e.src === "own") return { kind: "yours", text: t("Yours") };
  if (e.src === "refAdj") return { kind: "refAdj", text: t("Reference, adjusted to you") };
  if (e.src === "ref") return { kind: "ref", text: t("Reference") };
  if (e.src === "other" || e.src === "otherAdj") return { kind: "other", text: t("Other vocation") };
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
    const pref = sl.preferred.indexOf(c.slug) !== -1, unw = sl.unwanted.indexOf(c.slug) !== -1, tag = tags[c.slug], bountyTag = tag && tag.kind !== "weekly" ? tag : null;
    const marks = [bountyTag ? tagText(bountyTag) : null, tag && tag.kind === "weekly" ? t("weekly task") : null, pref ? t("Preferred") : null, unw ? t("Unwanted") : null,
      ml ? t("needs level {level}", { level: ml }) : null].filter(Boolean);
    return { slug: c.slug, name: c.name, tier: d.tiers[c.slug] || null, score: d.scores[c.slug] != null ? pct100(d.scores[c.slug]) : null, avoid, preferred: pref, unwanted: unw,
      bounty: bountyTag ? (bountyTag.kind === "bounty" ? t("bounty") : t("offer {letter}", { letter: bountyTag.letter })) : null, locked: ml, marks,
      label: c.name + (marks.length ? ", " + marks.join(", ") : ""),
      spot: e.spot || "–", exp: m.xp != null ? fmtBig(m.xp) : "–", profit: m.profit != null ? fmtBig(m.profit) : "–", badge: numbersBadge(e), rel: d.scores[c.slug] };
  };
  const items = pool.map(item), byScore = (a, b) => (b.rel == null ? -1 : b.rel) - (a.rel == null ? -1 : a.rel) || a.name.localeCompare(b.name);
  const tiers = TIER_IDS.map((id) => ({ id, label: t("Tier {tier}", { tier: id }), items: items.filter((x) => !x.avoid && x.tier === id).sort(byScore) }));
  tiers.push({ id: "X", label: t("Avoid"), items: items.filter((x) => x.avoid).sort(byScore) });
  const unscored = items.filter((x) => !x.avoid && !x.tier).sort((a, b) => a.name.localeCompare(b.name));
  return {
    sub: (diff === "all" ? t("All tasks") : t("{difficulty} bounties", { difficulty: t(DIFF_NAME[diff]) })) + " · " + displayName(p),
    difficulty: diff, difficulties: CREATURE_DIFFS.map((value) => ({ value, label: t(DIFF_NAME[value]) })), mode: ui.mode === "table" ? "table" : "tiers", query: ui.query || "",
    tiers, unscored, unscoredText: t.n(unscored.length, "{n} creature without numbers yet", "{n} creatures without numbers yet"),
    table: items.slice().sort(byScore),
    empty: items.length ? "" : q ? t("No creature matches “{query}”.", { query: String(ui.query).trim() }) : t("No creatures in this pool."),
    lists: ui.lists ? slotsView(state, model, catalog, diff === "all" ? "master" : diff, ui.add || {}) : null,
  };
}

// The Preferred and Unwanted lists (the in-game ones) with board odds and suggestions, for a task difficulty.
// add: {preferred, unwanted}, what's typed in each field.
export function slotsView(state, model, catalog, diff, add) {
  const sl = model.slots(), d = model.derived, pool = catalog.poolOf(diff);
  const st = {};
  Object.keys(d.tiers).forEach((k) => { st[k] = { tier: d.tiers[k], rel: d.scores[k] }; });
  const info = (c) => ({ avoided: model.ratingOf(c) === "X", locked: model.lockedFor(c), minLevel: model.minLevelFor(c), score: st[c.slug] });
  const taken = sl.preferred.concat(sl.unwanted);
  const list = (which) => {
    const rows = sl[which].map((slug) => {
      const c = catalog.bySlug[slug], x = info(c), bits = [];
      let warn = false;
      if (!creatureInPool(c, diff)) { bits.push(t("Not in the {difficulty} pool, so this slot does nothing there", { difficulty: t(DIFF_NAME[diff]) })); warn = true; }
      if (x.locked) { bits.push(t("Needs level {level}", { level: x.minLevel })); warn = true; }
      if (x.score) bits.push(t("Score {tier}", { tier: x.score.tier }));
      if (x.avoided) bits.push(t("Avoided"));
      if (!bits.length) bits.push(t("No hunt data yet"));
      return { slug, name: c.name, why: bits.join(", "), warn };
    });
    const full = rows.length >= SLOTS.max, q = norm((add || {})[which] || "");
    return {
      which, title: which === "preferred" ? t("Preferred") : t("Unwanted"), rows, empty: Math.max(0, SLOTS.max - rows.length), full,
      suggestions: full ? [] : slotSuggestions(which, pool, taken, info, 5, translator()).map((s) => ({ slug: s.it.slug, name: s.it.name, why: s.why })),
      none: full ? t("All five slots are filled.") : which === "preferred" ? t("Log hunts to get suggestions.") : t("Mark creatures Avoid or set minimum levels to get suggestions."),
      typed: (add || {})[which] || "",
      matches: q && !full ? pool.filter((c) => taken.indexOf(c.slug) === -1 && c.key.indexOf(q) !== -1).slice(0, 6).map((c) => ({ slug: c.slug, name: c.name })) : [],
    };
  };
  const so = slotOdds(pool, sl, (slug) => { const c = catalog.bySlug[slug], x = info(c); return !x.locked && !x.avoided && !!(x.score && (x.score.tier === "S" || x.score.tier === "A")); });
  const oneIn = (v) => (v > 0 ? " " + t("(1 in {n})", { n: Math.max(1, Math.round(1 / v)) }) : "");
  const odds = [so.unwanted ? t("{difficulty} pool: {size} creatures ({removed} removed by Unwanted).", { difficulty: t(DIFF_NAME[diff]), size: so.poolSize, removed: so.unwanted })
    : t("{difficulty} pool: {size} creatures.", { difficulty: t(DIFF_NAME[diff]), size: so.poolSize })];
  if (so.preferred) {
    odds.push(t("A Preferred creature on {pct} of boards", { pct: pct(so.pAny) }) + oneIn(so.pAny) + ".");
    odds.push(t("Each one: {pct} of boards ({base} without a slot).", { pct: pct(so.pEach), base: pct(so.pBase) }));
  }
  if (so.good) odds.push(t("An S or A creature on {pct} of boards", { pct: pct(so.pGood) }) + oneIn(so.pGood) + ".");
  return { difficulty: diff,
    preferred: list("preferred"), unwanted: list("unwanted"), odds, note: t("Community model, not official odds.") };
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
  const bestiary = t("{kills} kills · {charm} charm points", { kills: b.kills.toLocaleString(locale()), charm: b.charmPoints }) +
    (c.r ? " · " + t("rare: no Echo Raids") : " · " + t("Echo Warden +{points}", { points: b.warden }));

  // Where the numbers come from.
  let source = t("No numbers yet.");
  if (e.src === "own") source = !e.fromSessions ? t("From numbers you typed (Advanced).") : manualNums(entry) ? t("From numbers you typed and your hunts at {spot}.", { spot: e.spot })
    : t("From your hunts at {spot}.", { spot: e.spot });
  else if (e.refEntry) {
    const ev = e.refEntry.vocation, who = (e.refEntry.source || {}).who, q = { spot: e.spot, aVoc: aVoc(ev), voc: ev };
    source = (e.src === "refAdj" ? t("A reference hunt at {spot}, adjusted to you", q) : e.src === "ref" ? t("A reference hunt at {spot}, as recorded", q)
      : e.src === "otherAdj" ? t("{aVoc}’s reference hunt at {spot}, adjusted to you", q) : t("{aVoc}’s reference hunt at {spot}, as recorded", q)) + (who ? " (" + who + ")" : "") + "." +
      (e.profitStale ? " " + staleProfitText(e.refEntry, translator()) + "." : "");
  }

  // Its spots: the ones its numbers can come from (the used one first), then reference spots not used and why.
  const dv = d.derived[slug], shadow = (d.refShadow || {})[slug] || [], best = dv ? dv.best : null;
  const UNUSED = { own: t("Not used: you have your own numbers."), voc: t("Not used: there’s a reference for your vocation."), off: t("Not used: other vocations’ hunts are switched off.") };
  const spots = (dv ? dv.spots : []).concat(shadow).slice().sort((x, y) => (y === best) - (x === best) || (!!x.ref - !!y.ref) || y.xph - x.xph).map((s) => {
    const sm = model.metricsFor(c, Object.assign({}, entry, { kph: s.kph, xph: s.xph, pph: s.pph, spot: s.spot }), cdiff) || {};
    const used = s === best, unused = shadow.indexOf(s) !== -1;
    return { name: s.spot, id: idx.idOf(s.spot), kph: s.kph != null ? Math.round(s.kph) + "/h" : dash, exp: sm.xp != null ? t("{amount} exp/h", { amount: fmtBig(sm.xp) }) : dash,
      profit: s.pph != null ? t("{amount} profit/h", { amount: fmtBig(s.pph) }) : dash, used, badge: s.ref ? numbersBadge(s) : { kind: "yours", text: t("Yours") },
      note: used ? (dv.pinned ? t("Used (pinned).") : t("Used.")) : unused ? UNUSED[s.unused] || UNUSED.own
        : s.ref ? "" : s.nBreak ? t("{time} logged + {n} with breaks.", { time: fmtHours(s.hours), n: s.nBreak }) : t("{time} logged.", { time: fmtHours(s.hours) }) };
  });

  const ml = model.minLevelFor(c), voc = p.vocation || VOCATIONS[0];
  return {
    slug, name: c.name, classLine: classLine(c), wiki: wikiUrl(c),
    scoreLine: d.tiers[slug] ? t("Tier {tier} · score {score} on {difficulty} tasks", { tier: d.tiers[slug], score: pct100(d.scores[slug]), difficulty: t(DIFF_NAME[diff]) })
      : e.kph == null && e.xph == null ? t("Not scored: no numbers yet.") : t("Not scored: missing a number your goal mix weighs."),
    marks: [tag && tag.kind !== "weekly" ? tagLabel(tag) : null, tag && tag.kind === "weekly" ? t("Weekly task") : null,
      model.lockedFor(c) ? t("Needs level {level} for {voc}s", { level: ml, voc }) : null].filter(Boolean),
    stats: [[_("Exp/h"), m.xp != null ? fmtBig(m.xp) : dash], [_("Profit/h"), m.profit != null ? fmtBig(m.profit) : dash], [_("Kills/h"), e.kph != null ? String(Math.round(e.kph)) : dash],
      [_("Task time"), m.hours ? fmtHours(m.hours) : dash], [_("Charm/h"), m.charm != null ? fmtSmall(m.charm) : dash], [_("Bounty pts/h"), m.bounty != null ? fmtSmall(m.bounty) : dash]]
      .map(([label, value]) => ({ label: t(label), value })),
    badge: numbersBadge(e), source, weekly: m.weeklyXph > 0 ? t("Exp/h includes {exp} from open weekly tasks at {spot}.", { exp: fmtBig(m.weeklyXph), spot: e.spot }) : "",
    spots, noSpots: t("No hunts or reference spots for it yet."),
    preferred: sl.preferred.indexOf(slug) !== -1, unwanted: sl.unwanted.indexOf(slug) !== -1, avoid: model.ratingOf(c) === "X",
    listsNote: t("Avoid keeps it out of your tiers and the plan."),
    bestiary, bestiaryDone: !!entry.bestiaryDone, wardenDone: !!entry.wardenDone, rare: !!c.r,
    notes: ui.notes != null ? ui.notes : entry.notes || "",
    advanced: advanced ? {
      nums: NUM_FIELDS.map((k) => ({ key: k, label: k === "kph" ? t("Kills/h") : k === "xph" ? t("Exp/h") : t("Profit/h"), value: fmtField(k, entry[k]) })),
      pin: dv ? { value: dv.pinned ? best.spot : "", options: [{ value: "", label: dv.pinned ? t("Best for my goal") : t("Best for my goal ({spot})", { spot: best.spot }) }]
        .concat(dv.spots.map((s) => ({ value: s.spot, label: s.spot }))) } : null,
      minLevel: ml ? String(ml) : "", minLevelLabel: t("Usable from level ({voc}s)", { voc }),
    } : null,
    updated: entry.updatedAt ? t("Last edited {date}", { date: fmtDay(entry.updatedAt.slice(0, 10)) }) : "",
  };
}
