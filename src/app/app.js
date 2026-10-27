// The running app: one state object fed by db subscriptions, the actions that change it (writing through the store and
// updating the state at once), and the model of the active character derived from it. The UI subscribes, renders
// view models from it and calls its actions; it keeps no game state of its own.
import { VOCATIONS, TASK, TOKEN_CAP, PREY, PREY_SLOTS, SLOTS } from "../data/rules.js";
import { occKey, markAge } from "../core/occupancy.js";
import { serverDay, weekKey } from "../core/weekly.js";
import { norm, slugify, parseNum } from "../core/text.js";
import { NUM_FIELDS } from "../core/numbers.js";
import { isChallengingMaster, learnChallenging } from "../core/rewards.js";
import { makeCatalog } from "../core/catalog.js";
import { PRESETS, readWeights } from "../core/score.js";
import { makeRepo } from "../store/repo.js";
import { PREF } from "../store/prefs.js";
import { plDefaults, readSettings, sourcesPatch, SOURCE_PRESETS, readTheme, TAKEN_MINUTES, goalPatch, OFFER_KINDS, blankOffer, WEEKLY_SLOTS, readHunting } from "../store/schema.js";
import { makeActions } from "./actions.js";
import { makeWatchers, mergeProfiles } from "./state.js";
import { makeModel, makePlanCache } from "./model.js";

// data: {creatures, reference, expTable}; prefs: store/prefs.js; now() → ms.
export function createApp({ data, prefs, now }) {
  const catalog = makeCatalog(data.creatures), known = (slug) => !!catalog.bySlug[slug];
  const state = {
    status: "loading", // "loading" until the profiles arrive, then "ready"
    local: false, canWrite: true, notice: "",
    profiles: {}, order: [], pid: prefs.get(PREF.profile) || null,
    creatures: {}, entries: {}, sessions: [], userSpots: {}, planner: { state: plDefaults(), marks: {}, occupancy: {} },
    advanced: prefs.get(PREF.advanced) === "1", theme: readTheme(prefs.get(PREF.theme)),
  };
  const listeners = new Set(), pending = {}, pendingNew = {}, planCache = makePlanCache();
  let repo = null, act = null, watch = null, charUnsub = [], plPending = 0, cachedModel = null, diffModels = {};
  const changed = () => { cachedModel = null; diffModels = {}; listeners.forEach((fn) => fn()); };
  const iso = () => new Date(now()).toISOString();
  const profile = () => state.profiles[state.pid] || null;

  function watchCharacter(pid) {
    charUnsub.forEach((u) => u());
    charUnsub = [];
    state.entries = {}; state.sessions = []; state.userSpots = {}; state.planner = { state: plDefaults(), marks: {}, occupancy: {} };
    if (!pid || !watch) return;
    const mine = (fn) => (v) => { if (state.pid === pid) { fn(v); changed(); } };
    charUnsub.push(watch.entries(pid, mine((v) => { state.entries = v; })));
    charUnsub.push(watch.sessions(pid, mine((v) => { state.sessions = v; })));
    // While our own planner writes are in flight, a snapshot can be older than the state.
    charUnsub.push(watch.plannerState(pid, (v) => { if (state.pid === pid && !plPending) { state.planner = Object.assign({}, state.planner, { state: v }); changed(); } }));
    charUnsub.push(watch.marks(pid, mine((v) => { state.planner = Object.assign({}, state.planner, { marks: v }); })));
    charUnsub.push(watch.occupancy(pid, mine((v) => { state.planner = Object.assign({}, state.planner, { occupancy: v }); })));
    charUnsub.push(watch.spots(pid, mine((v) => { state.userSpots = v; })));
  }

  // Starts reading and writing through a db (store/db.js).
  function connect(db) {
    repo = makeRepo(db, { onDenied: () => { state.canWrite = false; changed(); } });
    act = makeActions(repo);
    watch = makeWatchers(repo, { known });
    state.local = !!db.local;
    watch.creatures((c) => { state.creatures = c; changed(); });
    let watching = null;
    watch.profiles((docs) => {
      const m = mergeProfiles(docs, { pending, pendingNew, current: state.profiles });
      state.profiles = m.profiles; state.order = m.order; state.status = "ready";
      if (!state.profiles[state.pid]) state.pid = m.order[0] || null;
      if (watching !== state.pid) { watching = state.pid; watchCharacter(state.pid); }
      changed();
    }, () => { state.notice = "Saved data stopped updating. Reload the page to reconnect."; changed(); });
  }

  // A patch to the active character's profile: shown at once, written in the background; on failure the unsaved
  // keys are dropped and a notice says so.
  function updateCharacter(patch) {
    const pid = state.pid;
    if (!act || !pid || !state.profiles[pid]) return;
    state.profiles = Object.assign({}, state.profiles, { [pid]: Object.assign({}, state.profiles[pid], patch) });
    pending[pid] = Object.assign({}, pending[pid] || {}, patch);
    act.updateProfile(pid, patch, () => {
      const p = pending[pid];
      if (p) Object.keys(patch).forEach((k) => { if (p[k] === patch[k]) delete p[k]; });
    }, () => {
      if (pending[pid]) Object.keys(patch).forEach((k) => { delete pending[pid][k]; });
      state.notice = "Couldn’t save that change. Try again in a moment.";
      changed();
    });
    changed();
  }

  // The whole bounty, written with a patch on top of what the model reads now (migrated or stored).
  function saveBounty(patch) {
    const b = model().bounty();
    actions.savePlanner({ bounty: Object.assign({ difficulty: b.difficulty, tokens: b.tokens, mode: b.mode, offers: b.offers, active: b.active }, patch) });
  }
  function endBounty(tokens) {
    saveBounty({ tokens, mode: "offers", active: null, offers: [blankOffer(), blankOffer(), blankOffer()] });
    updateCharacter({ reroll: Object.assign({}, (profile() || {}).reroll, { left: tokens }) });
  }
  // A new spot's id: "my-" and its name as a slug, made unique.
  function newSpotId(name) {
    const base = "my-" + (slugify(name) || "spot"), taken = model().spotIndex().spots;
    let id = base, n = 2;
    while (taken[id] || state.userSpots[id]) id = base + "-" + n++;
    return id;
  }
  // The weekly tasks as the model reads them now, and a write of the whole thing with a patch on top.
  const weeklyNow = () => model().weekly();
  function saveWeekly(patch) {
    const w = weeklyNow();
    const next = Object.assign({ weekStart: w.weekStart || weekKey(new Date(now())), difficulty: w.difficulty, slots: w.slots, exp: w.override, tasks: w.tasks }, patch);
    next.tasks = next.tasks.slice(0, next.slots);
    updateCharacter({ weeklyTasks: next });
  }
  // A Free or Taken mark for a spot, and its count toward the spot's odds of being free (the same mark again within 15
  // minutes is the same observation).
  function mark(spotId, kind) {
    const pid = state.pid, pl = state.planner, world = readSettings(profile(), pl.state).world, prev = pl.marks[spotId];
    if (!act || !pid) return;
    const m = { state: kind, at: iso(), world }, repeat = prev && prev.state === kind && (prev.world || null) === world && markAge(prev, now()) < 15;
    const marks = Object.assign({}, pl.marks, { [spotId]: m });
    let occ = null, occupancy = pl.occupancy;
    if (!repeat) {
      const cur = pl.occupancy[spotId] || { counts: {} }, key = occKey(world, new Date(m.at).getUTCHours()), counts = Object.assign({}, cur.counts), c = (counts[key] || [0, 0]).slice();
      c[kind === "free" ? 0 : 1]++;
      counts[key] = c;
      occ = { counts };
      occupancy = Object.assign({}, pl.occupancy, { [spotId]: occ });
    }
    state.planner = Object.assign({}, pl, { marks, occupancy });
    act.setMark(pid, spotId, m, occ);
    changed();
  }
  // A creature's entry: a patch on top of what's stored, with empty fields dropped; numsAt moves when typed numbers
  // change, and an entry left empty is deleted. Shown at once; on failure the old entry comes back with a notice.
  function saveEntry(slug, patch) {
    const pid = state.pid, c = catalog.bySlug[slug];
    if (!act || !pid || !c) return;
    const prev = state.entries[slug] || null, next = Object.assign({}, prev || {}, patch);
    delete next.updatedAt;
    Object.keys(next).forEach((k) => { if (next[k] == null || next[k] === "" || next[k] === false) delete next[k]; });
    const bare = (r) => { const o = Object.assign({}, r); delete o.updatedAt; return JSON.stringify(o); };
    if (bare(next) === bare(prev || {})) return;
    const t = iso();
    if (NUM_FIELDS.some((k) => k in patch && patch[k] !== (prev || {})[k])) next.numsAt = t;
    if (next.kph == null && next.xph == null && next.pph == null) delete next.numsAt;
    const empty = !Object.keys(next).length;
    if (!empty) next.updatedAt = t;
    const entries = Object.assign({}, state.entries);
    if (empty) delete entries[slug]; else entries[slug] = next;
    state.entries = entries;
    act.setEntry(pid, slug, empty ? null : Object.assign({ name: c.name }, next), () => {
      const back = Object.assign({}, state.entries);
      if (prev) back[slug] = prev; else delete back[slug];
      state.entries = back;
      state.notice = "Couldn’t save that change. Try again in a moment.";
      changed();
    });
    changed();
  }
  // Adds a creature to the Preferred or Unwanted list (taking it off the other one) or takes it off.
  function setSlot(slug, which, on) {
    if (!profile() || !catalog.bySlug[slug]) return;
    const sl = model().slots(), other = which === "preferred" ? "unwanted" : "preferred", next = { preferred: sl.preferred.slice(), unwanted: sl.unwanted.slice() };
    if (!on) next[which] = next[which].filter((x) => x !== slug);
    else {
      if (next[which].indexOf(slug) !== -1) return;
      if (next[which].length >= SLOTS.max) { state.notice = "Your " + (which === "preferred" ? "Preferred" : "Unwanted") + " list is full. Remove one first."; changed(); return; }
      next[other] = next[other].filter((x) => x !== slug);
      next[which].push(slug);
    }
    updateCharacter({ slots: next });
  }
  // Today's boosts, with a stale boosted creature (from an earlier server day) dropped on write.
  const todayPrey = () => ((state.planner.state.today || {}).prey || []).map((q) => Object.assign({}, q));
  function saveToday(patch) {
    const t = Object.assign({ boosted: null, boostedDay: null, prey: [], event: 0 }, state.planner.state.today);
    if (t.boostedDay !== serverDay(now())) { t.boosted = null; t.boostedDay = null; }
    actions.savePlanner({ today: Object.assign(t, patch) });
  }
  // A Challenging creature's reward on Master, as the game shows it, teaches that creature's rate per kill.
  function learnReward(diff, o) {
    const c = o && o.slug && catalog.bySlug[o.slug], p = profile();
    if (!c || !p || !isChallengingMaster(diff, c) || !(o.exp > 0) || !(o.kills > 0)) return;
    const next = learnChallenging(p.chalRates && typeof p.chalRates === "object" ? p.chalRates : {}, c, { kills: o.kills, exp: o.exp, kind: o.kind, level: Number(p.level) || null, at: iso() });
    if (next) updateCharacter({ chalRates: next });
  }

  const actions = {
    // Characters. A new character starts with the Exp goal and every source on; its name is optional.
    addCharacter({ vocation, level, name }) {
      if (!act) return null;
      const body = { vocation: VOCATIONS.indexOf(vocation) !== -1 ? vocation : VOCATIONS[0], level: Number(level) > 0 ? Math.floor(Number(level)) : null,
        bestiaryBonus: 0, createdAt: iso() };
      Object.assign(body, goalPatch(PRESETS.exp), sourcesPatch(SOURCE_PRESETS.everything));
      if (name && String(name).trim()) body.name = String(name).trim().slice(0, 40);
      let id = null;
      id = act.createProfile(body, () => { delete pendingNew[id]; }, () => { delete pendingNew[id]; state.notice = "Couldn’t add the character. Try again in a moment."; changed(); });
      pendingNew[id] = true;
      state.profiles = Object.assign({}, state.profiles, { [id]: body });
      state.order = state.order.concat([id]);
      actions.switchCharacter(id);
      return id;
    },
    switchCharacter(id) {
      if (!state.profiles[id] || id === state.pid) return;
      state.pid = id;
      prefs.set(PREF.profile, id);
      watchCharacter(id);
      changed();
    },
    updateCharacter,
    // Deletes the active character and everything under it.
    deleteCharacter() {
      const gone = state.pid;
      if (!act || !gone) return;
      act.deleteCharacter(gone, Object.keys(state.entries), state.sessions.map((x) => x.id));
      const profiles = Object.assign({}, state.profiles);
      delete profiles[gone];
      state.profiles = profiles;
      state.order = state.order.filter((x) => x !== gone);
      state.pid = null;
      if (state.order[0]) actions.switchCharacter(state.order[0]); else { watchCharacter(null); changed(); }
    },
    setSources(s) { updateCharacter(sourcesPatch(s)); },
    // Goal mix: weights 0-5 each, or a preset by id.
    setWeights(w) { updateCharacter(goalPatch(readWeights(w))); },
    applyPreset(id) { if (PRESETS[id]) updateCharacter(goalPatch(PRESETS[id])); },
    setWorld(world) { const s = readSettings(profile(), state.planner.state); updateCharacter({ settings: { world: String(world || "").trim().slice(0, 30) || null, takenMinutes: s.takenMinutes } }); },
    setTakenMinutes(m) {
      if (TAKEN_MINUTES.indexOf(m) === -1) return;
      const s = readSettings(profile(), state.planner.state);
      updateCharacter({ settings: { world: s.world, takenMinutes: m } });
    },
    // Per-device preferences.
    setAdvanced(on) { state.advanced = !!on; prefs.set(PREF.advanced, on ? "1" : "0"); changed(); },
    setTheme(t) { state.theme = readTheme(t); prefs.set(PREF.theme, state.theme); changed(); },
    clearNotice() { state.notice = ""; changed(); },
    // Backup: the file's contents, and restoring one from its text (resolves with the number of characters; rejects
    // with Error("bad") or Error("empty") for a file it can't use).
    exportBackup() { return act ? act.exportBackup({ ids: state.order.slice(), profiles: state.profiles, creatures: state.creatures, exportedAt: iso() }) : Promise.reject(new Error("not ready")); },
    restoreBackup(text) {
      let bk;
      try { bk = JSON.parse(text); } catch (e) { return Promise.reject(new Error("bad")); }
      try { return act.restoreBackup(bk).then(() => Object.keys(bk.characters).length); } catch (e) { return Promise.reject(e); }
    },
    // Creatures: Avoid (the entry's rating X), the in-game lists, bestiary and Echo Warden done, notes, and in Advanced
    // typed numbers, a pinned spot and the level the creature is usable from (shared, per vocation).
    setAvoid(slug, on) { const r = (state.entries[slug] || {}).rating; saveEntry(slug, { rating: on ? "X" : r === "X" ? null : r }); },
    setPreferred(slug, on) { setSlot(slug, "preferred", on); },
    setUnwanted(slug, on) { setSlot(slug, "unwanted", on); },
    setBestiaryDone(slug, on) { saveEntry(slug, { bestiaryDone: !!on }); },
    setWardenDone(slug, on) { saveEntry(slug, { wardenDone: !!on }); },
    setNotes(slug, text) { saveEntry(slug, { notes: String(text || "").trim().slice(0, 2000) }); },
    // nums: {kph?, xph?, pph?} as typed ("1.2kk", "" to clear). Returns false (and writes nothing) if one isn't a number.
    setCreatureNumbers(slug, nums) {
      const patch = {};
      for (const k of NUM_FIELDS) {
        if (!(k in nums)) continue;
        const v = parseNum(nums[k] == null ? "" : nums[k]);
        if (Number.isNaN(v) || (k !== "pph" && v != null && v < 0)) return false;
        patch[k] = v;
      }
      saveEntry(slug, patch);
      return true;
    },
    pinSpot(slug, spot) { saveEntry(slug, { pinSpot: spot || null }); },
    setMinLevel(slug, level) {
      const c = catalog.bySlug[slug], p = profile();
      if (!act || !c || !p) return;
      const voc = p.vocation || VOCATIONS[0], n = parseInt(level, 10), ml = Object.assign({}, (state.creatures[slug] || {}).minLevel);
      if (n > 0 && n < 5000) ml[voc] = n; else delete ml[voc];
      const empty = !Object.keys(ml).length, creatures = Object.assign({}, state.creatures);
      if (empty) delete creatures[slug]; else creatures[slug] = { name: c.name, minLevel: ml };
      state.creatures = creatures;
      act.setCreatureSettings(slug, empty ? null : { name: c.name, minLevel: ml }, () => { state.notice = "Couldn’t save the level. Try again in a moment."; changed(); });
      changed();
    },
    // The bounty (planner state `bounty`; reroll tokens also kept in step in the profile's reroll.left for older builds).
    setDifficulty(d) { if (TASK[d]) saveBounty({ difficulty: d }); },
    setTokens(n) {
      n = Math.max(0, Math.min(TOKEN_CAP, Math.floor(Number(n)) || 0));
      saveBounty({ tokens: n });
      updateCharacter({ reroll: Object.assign({}, (profile() || {}).reroll, { left: n }) });
    },
    // Offer i ({creature name or slug, kills, kind, exp}); a creature name is matched to the catalog.
    setOffer(i, patch) {
      const b = model().bounty(), offers = b.offers.map((o) => Object.assign({}, o)), o = offers[i];
      if (!o) return;
      if ("name" in patch) { const c = catalog.byName[norm(patch.name || "")]; o.slug = c ? c.slug : null; }
      if ("slug" in patch) o.slug = catalog.bySlug[patch.slug] ? patch.slug : null;
      if ("kills" in patch) o.kills = Number(patch.kills) > 0 ? Math.min(100000, Math.floor(Number(patch.kills))) : null;
      if ("kind" in patch && OFFER_KINDS.indexOf(patch.kind) !== -1) o.kind = patch.kind;
      if ("exp" in patch) o.exp = Number(patch.exp) > 0 ? Number(patch.exp) : null;
      saveBounty({ offers });
      learnReward(b.difficulty, o);
    },
    // Offer i was picked in game: it becomes the active bounty with all its kills left; the other two are gone.
    pickOffer(i) {
      const b = model().bounty(), o = b.offers[i];
      if (!o || !o.slug) return;
      saveBounty({ mode: "active", active: { slug: o.slug, kills: o.kills, killsLeft: o.kills, kind: o.kind, exp: o.exp, since: iso() }, offers: [blankOffer(), blankOffer(), blankOffer()] });
    },
    // The active bounty's fields, kills left included (never more than its kills).
    setActive(patch) {
      const b = model().bounty();
      if (!b.active) return;
      const a = Object.assign({}, b.active);
      if ("name" in patch) { const c = catalog.byName[norm(patch.name || "")]; if (c) a.slug = c.slug; }
      if ("kills" in patch) a.kills = Number(patch.kills) > 0 ? Math.min(100000, Math.floor(Number(patch.kills))) : null;
      if ("killsLeft" in patch) a.killsLeft = Number(patch.killsLeft) >= 0 && patch.killsLeft !== "" ? Math.floor(Number(patch.killsLeft)) : a.kills;
      if (a.kills != null && a.killsLeft != null) a.killsLeft = Math.min(a.killsLeft, a.kills);
      if ("kind" in patch && OFFER_KINDS.indexOf(patch.kind) !== -1) a.kind = patch.kind;
      if ("exp" in patch) a.exp = Number(patch.exp) > 0 ? Number(patch.exp) : null;
      saveBounty({ active: a });
      learnReward(b.difficulty, a);
    },
    // Finished it: +1 token (at most 10), the bounty clears, back to choosing offers.
    finishedBounty() { const t = model().bounty().tokens; endBounty(Math.min(TOKEN_CAP, (t || 0) + 1)); },
    // Rerolled: −1 token, offers and any active bounty clear.
    rerolled() { const t = model().bounty().tokens; endBounty(Math.max(0, (t || 0) - 1)); },
    // Plan: Free and Taken marks (each counted once per 15 minutes toward how often the spot is free), Hunting now.
    markTaken(spotId) { mark(spotId, "taken"); },
    markFree(spotId) { mark(spotId, "free"); },
    startHunting(spotId) { mark(spotId, "free"); actions.savePlanner({ hunting: { spotId, at: iso() } }); },
    stopHunting() { actions.savePlanner({ hunting: null }); },
    // Time: a session length in hours, or null for no limit.
    setFixedHours(h) { actions.savePlanner({ fixedHours: Number(h) > 0 ? Number(h) : null }); },
    // Today's boosts: they count only on the server day they were set.
    setBoosted(name) {
      const c = catalog.byName[norm(name || "")];
      saveToday({ boosted: c ? c.slug : null, boostedDay: serverDay(now()) });
    },
    setPrey(i, patch) {
      const prey = todayPrey(), q = Object.assign({ slug: null, kind: "xp", pct: PREY.xp.lo }, prey[i] || {});
      if ("name" in patch) { const c = catalog.byName[norm(patch.name || "")]; q.slug = c ? c.slug : null; }
      if ("kind" in patch && PREY[patch.kind]) { q.kind = patch.kind; q.pct = Math.min(PREY[q.kind].hi, Math.max(PREY[q.kind].lo, q.pct)); }
      if ("pct" in patch) q.pct = Math.min(PREY[q.kind].hi, Math.max(PREY[q.kind].lo, Number(patch.pct) || PREY[q.kind].lo));
      prey[i] = q;
      saveToday({ prey: prey.filter((x) => x.slug || x === q).slice(0, PREY_SLOTS) });
    },
    addPrey() { const prey = todayPrey(); if (prey.length < PREY_SLOTS) saveToday({ prey: prey.concat([{ slug: null, kind: "xp", pct: PREY.xp.lo }]) }); },
    removePrey(i) { const prey = todayPrey(); prey.splice(i, 1); saveToday({ prey }); },
    setEvent(pct) { saveToday({ event: Math.max(0, Math.min(100, Number(pct) || 0)) }); },
    // Weekly kill tasks (profile weeklyTasks; the old weekly is left as it was).
    setWeeklyDifficulty(d) { if (TASK[d]) saveWeekly({ difficulty: d }); },
    setWeeklySlots(n) { if (WEEKLY_SLOTS.indexOf(n) !== -1) saveWeekly({ slots: n }); },
    setWeeklyTask(i, patch) {
      const tasks = weeklyNow().tasks.map((t) => Object.assign({}, t));
      while (tasks.length <= i) tasks.push({ slug: null, name: null, killsLeft: null, done: false });
      const t = tasks[i];
      if ("name" in patch) { const c = catalog.byName[norm(patch.name || "")]; t.slug = c ? c.slug : null; t.name = c ? null : String(patch.name || "").trim().slice(0, 60) || null; }
      if ("killsLeft" in patch) t.killsLeft = patch.killsLeft === "" || patch.killsLeft == null ? null : Math.max(0, Math.min(100000, Math.floor(Number(patch.killsLeft)) || 0));
      saveWeekly({ tasks });
    },
    setWeeklyDone(i, on) {
      const tasks = weeklyNow().tasks.map((t) => Object.assign({}, t));
      if (!tasks[i]) return;
      tasks[i].done = !!on;
      saveWeekly({ tasks });
    },
    // A new week: the rows clear (difficulty and slots stay).
    startNewWeek() { saveWeekly({ weekStart: weekKey(new Date(now())), exp: null, tasks: [] }); },
    // Logging a clean hunt. preview: parseSession's result. spot: {id} (a known spot) or {name, parentId, note} (a new
    // spot, or a variation of parentId). raidsBy: Echo Raids per creature (advanced). Saves the session at that spot (and
    // the new spot first); Hunting now ends. Returns the session's id, or null when there's nothing to save.
    saveHunt({ preview, spot, raidsBy }) {
      const pid = state.pid, p = profile();
      if (!act || !pid || !p || !preview || !preview.hours || !preview.kills || !preview.kills.length) return null;
      let spotId = spot && spot.id, name;
      if (!spotId) {
        name = String((spot && spot.name) || "").trim().slice(0, 60);
        if (!name) return null;
        spotId = newSpotId(name);
        const doc = { name, parentId: spot.parentId || null, note: String(spot.note || "").trim().slice(0, 200) || null, createdAt: iso() };
        state.userSpots = Object.assign({}, state.userSpots, { [spotId]: doc });
        act.saveSpot(pid, spotId, doc);
      } else {
        const sp = model().spotIndex().spots[spotId];
        name = sp ? sp.name : spotId;
      }
      const b = model().bounty(), task = b.mode === "active" && b.active && preview.kills.some((k) => k.slug === b.active.slug) ? b.active.slug : null;
      const body = { spot: name, spotId, task, start: preview.start || null, end: preview.end || iso().slice(0, 19), hours: Math.round(preview.hours * 10000) / 10000,
        rawXp: preview.rawXp != null ? preview.rawXp : null, xp: preview.xp != null ? preview.xp : null, loot: preview.loot != null ? preview.loot : null,
        supplies: preview.supplies != null ? preview.supplies : null, balance: preview.balance != null ? preview.balance : null,
        kills: preview.kills.map((k) => (k.slug ? { slug: k.slug, name: k.name, count: k.count } : { name: k.name, count: k.count })), level: Number(p.level) || null, createdAt: iso() };
      const raids = {};
      Object.keys(raidsBy || {}).forEach((k) => { const n = parseInt(raidsBy[k], 10); if (n >= 0 && n < 1000) raids[k] = n; });
      if (Object.keys(raids).length) body.raidsBy = raids;
      const id = act.newSessionId(pid);
      state.sessions = state.sessions.concat([Object.assign({ id }, body)]);
      act.saveSession(pid, id, body, () => { state.sessions = state.sessions.filter((x) => x.id !== id); state.notice = "Couldn’t save the hunt. Try again in a moment."; changed(); });
      if (readHunting(state.planner.state)) actions.savePlanner({ hunting: null }); else changed();
      return id;
    },
    deleteSession(id) {
      const pid = state.pid;
      if (!act || !pid) return;
      state.sessions = state.sessions.filter((x) => x.id !== id);
      act.deleteSession(pid, id, () => { state.notice = "Couldn’t delete that hunt."; changed(); });
      changed();
    },
    // Echo Raid counts per creature on a logged hunt (advanced).
    setSessionRaids(id, raidsBy) {
      const pid = state.pid, x = state.sessions.filter((y) => y.id === id)[0];
      if (!act || !x) return;
      const raids = {};
      Object.keys(raidsBy || {}).forEach((k) => { const n = parseInt(raidsBy[k], 10); if (n >= 0 && n < 1000) raids[k] = n; });
      const body = Object.assign({}, x, { raidsBy: raids });
      delete body.id; delete body.raids;
      state.sessions = state.sessions.map((y) => (y.id === id ? Object.assign({ id }, body) : y));
      act.saveSession(pid, id, body);
      changed();
    },
    // The character's own spots: rename, or delete with the hunts logged there.
    renameSpot(id, name) {
      const pid = state.pid, sp = state.userSpots[id];
      name = String(name || "").trim().slice(0, 60);
      if (!act || !sp || !name) return;
      const doc = Object.assign({}, sp, { name });
      state.userSpots = Object.assign({}, state.userSpots, { [id]: doc });
      act.saveSpot(pid, id, doc);
      changed();
    },
    deleteSpot(id) {
      const pid = state.pid;
      if (!act || !state.userSpots[id]) return;
      const gone = state.sessions.filter((x) => x.spotId === id).map((x) => x.id);
      gone.forEach((x) => act.deleteSession(pid, x));
      // Its variations stay, as spots of their own.
      state.sessions = state.sessions.filter((x) => x.spotId !== id);
      const spots = Object.assign({}, state.userSpots);
      delete spots[id];
      Object.keys(spots).forEach((k) => { if (spots[k].parentId === id) { spots[k] = Object.assign({}, spots[k], { parentId: null }); act.saveSpot(pid, k, spots[k]); } });
      state.userSpots = spots;
      act.deleteSpot(pid, id);
      changed();
    },
    // Planner documents.
    savePlanner(patch) {
      const pid = state.pid;
      if (!act || !pid) return;
      state.planner = Object.assign({}, state.planner, { state: Object.assign({}, state.planner.state, patch) });
      plPending++;
      act.savePlannerState(pid, JSON.parse(JSON.stringify(state.planner.state)), () => { state.notice = "Couldn’t save that change. Try again in a moment."; changed(); })
        .then(() => { plPending--; });
      changed();
    },
  };

  // The active character's model (app/model.js), rebuilt after each change; its tiers are for Master tasks. modelFor
  // gives one whose tiers are for another difficulty (or "all"), for the Creatures screen.
  const modelState = (difficulty) => ({ catalog, reference: data.reference, profile: profile() || {}, sessions: state.sessions, entries: state.entries, advanced: state.advanced,
    difficulty, creatures: state.creatures, planner: state.planner, spotMeta: {}, expTable: data.expTable, userSpots: state.userSpots });
  function model() {
    if (!cachedModel) cachedModel = makeModel(modelState("master"), null, now(), { planCache });
    return cachedModel;
  }
  function modelFor(diff) {
    if (diff === "master") return model();
    if (!diffModels[diff]) diffModels[diff] = makeModel(modelState(diff), null, now(), { planCache });
    return diffModels[diff];
  }

  // Whether this viewer may edit (the Claude host says; browser storage always may).
  function setCanWrite(v) { state.canWrite = !!v; changed(); }

  return { state, catalog, actions, model, modelFor, connect, setCanWrite, profile, subscribe: (fn) => { listeners.add(fn); return () => listeners.delete(fn); } };
}
