// Document paths and shapes. Each reader takes whatever is stored and returns a valid current-shape value with
// defaults; none throws on bad data. Writers elsewhere write these shapes.
import { TASK, KIND_MULT, PREY, PREY_SLOTS } from "../data/rules.js";

const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

// ---------- paths ----------
export const PROFILES = "profiles";
export const CREATURES = "creatures";
export const profilePath = (pid) => "profiles/" + pid;
export const entriesPath = (pid) => profilePath(pid) + "/entries";
export const entryPath = (pid, slug) => entriesPath(pid) + "/" + slug;
export const sessionsPath = (pid) => profilePath(pid) + "/sessions";
export const sessionPath = (pid, id) => sessionsPath(pid) + "/" + id;
export const plannerPath = (pid) => profilePath(pid) + "/planner";
export const plStatePath = (pid) => plannerPath(pid) + "/state";
export const marksPath = (pid) => profilePath(pid) + "/marks";
export const occupancyPath = (pid) => profilePath(pid) + "/occupancy";
export const creaturePath = (slug) => CREATURES + "/" + slug;
export const spotsPath = (pid) => profilePath(pid) + "/spots";
export const spotPath = (pid, id) => spotsPath(pid) + "/" + id;
// Document ids a backup may restore: character ids, and spot ids for marks and occupancy.
export const validCharacterId = (id) => /^[A-Za-z0-9_.~:@+-]+$/.test(id);
export const validSpotId = (id) => /^[a-z0-9-]+$/.test(id);

// ---------- profiles/{pid}: sources and settings ----------
// Where numbers come from: {reference, otherVocation, older}. Stored as `sources` since the redesign; older profiles
// have refOff / refOtherOff (and always used older hunts). A profile with neither uses everything.
export function readSources(p) {
  const s = p && p.sources;
  if (s && typeof s === "object") return { reference: s.reference !== false, otherVocation: s.otherVocation !== false, older: s.older !== false };
  return { reference: !(p && p.refOff), otherVocation: !(p && p.refOtherOff), older: true };
}
// The three presets of the sources switches; anything else is "custom".
export const SOURCE_PRESETS = {
  mine: { reference: false, otherVocation: false, older: false },
  reference: { reference: true, otherVocation: false, older: true },
  everything: { reference: true, otherVocation: true, older: true },
};
export function sourcesPreset(s) {
  const hit = Object.keys(SOURCE_PRESETS).find((k) => ["reference", "otherVocation", "older"].every((f) => SOURCE_PRESETS[k][f] === s[f]));
  return hit || "custom";
}
// The profile fields that store sources: the current shape, plus the old flags kept in step so an older build still
// reads them.
export const sourcesPatch = (s) => ({ sources: { reference: !!s.reference, otherVocation: !!s.otherVocation, older: !!s.older }, refOff: !s.reference, refOtherOff: !s.otherVocation });

// The goal weights, whole numbers 0-5: stored as `goal` since the redesign. Older profiles have `weights` on a 0-10
// scale, read as w > 0 ? max(1, round(w / 2)) : 0 (ARCHITECTURE.md, State model). Neither: Exp.
const GOAL_FIELDS = ["xp", "profit", "charm", "bounty"];
export function readGoal(p) {
  const out = {}, g = p && p.goal, old = p && p.weights;
  if (g && typeof g === "object") GOAL_FIELDS.forEach((k) => { const v = Math.round(Number(g[k])); out[k] = isFinite(v) && v > 0 ? Math.min(5, v) : 0; });
  else if (old && typeof old === "object") GOAL_FIELDS.forEach((k) => { const v = Number(old[k]); out[k] = isFinite(v) && v > 0 ? Math.max(1, Math.round(Math.min(10, v) / 2)) : 0; });
  else return { xp: 5, profit: 0, charm: 0, bounty: 0 };
  return out;
}
// The profile fields that store goal weights: `goal`, and the old 0-10 `weights` kept in step (twice each weight, the
// same shares) so an older build still scores the same way.
export function goalPatch(w) {
  const goal = {}, weights = {};
  GOAL_FIELDS.forEach((k) => { goal[k] = w[k] || 0; weights[k] = (w[k] || 0) * 2; });
  return { goal, weights };
}

// How long a Taken mark lasts, in minutes: the choices and the default.
export const TAKEN_MINUTES = [30, 45, 60, 120];
export const DEFAULT_TAKEN_MINUTES = 45;
// A character's settings {world, takenMinutes}: stored in the profile as `settings` since the redesign; the world used
// to live in the planner state, which is still read when the profile has none.
export function readSettings(p, plState) {
  const s = (p && p.settings && typeof p.settings === "object") ? p.settings : {};
  const w = typeof s.world === "string" && s.world.trim() ? s.world.trim().slice(0, 30) : (plState && plState.world) || null;
  return { world: w, takenMinutes: TAKEN_MINUTES.indexOf(s.takenMinutes) !== -1 ? s.takenMinutes : DEFAULT_TAKEN_MINUTES };
}

// Per-device theme: "system" (follow the device), "dark" or "light".
export const THEMES = ["system", "dark", "light"];
export const readTheme = (v) => (THEMES.indexOf(v) !== -1 ? v : "system");

// ---------- entries: profiles/{pid}/entries/{slug} ----------
export const RATINGS = ["S", "A", "B", "C", "D", "X"];
const NUM_FIELDS = ["kph", "xph", "pph"];
// {rating?, kph?, xph?, pph?, notes? (≤ 2000), bestiaryDone?, wardenDone?, updatedAt?, numsAt?, pinSpot?}
export function readRecord(v) {
  const r = {};
  if (!v) return r;
  if (RATINGS.indexOf(v.rating) !== -1) r.rating = v.rating;
  NUM_FIELDS.forEach((k) => { if (typeof v[k] === "number" && isFinite(v[k])) r[k] = v[k]; });
  if (typeof v.notes === "string" && v.notes) r.notes = v.notes.slice(0, 2000);
  if (v.bestiaryDone === true) r.bestiaryDone = true;
  if (v.wardenDone === true) r.wardenDone = true;
  if (typeof v.updatedAt === "string") r.updatedAt = v.updatedAt;
  if (typeof v.numsAt === "string") r.numsAt = v.numsAt;
  if (typeof v.pinSpot === "string" && v.pinSpot) r.pinSpot = v.pinSpot;
  return r;
}
// A snapshot's entries: slug → record, leaving out empty ones.
export function readRecords(docs) {
  const out = {};
  docs.forEach((d) => { const r = readRecord(d.data()); if (Object.keys(r).length) out[d.id] = r; });
  return out;
}

// ---------- the character's own spots: profiles/{pid}/spots/{id} ----------
// {name, parentId (a variation's spot) or null, note or null, createdAt}; null for anything without a name.
export function readUserSpot(v) {
  if (!v || typeof v.name !== "string" || !v.name.trim()) return null;
  return { name: v.name.trim().slice(0, 60), parentId: typeof v.parentId === "string" && v.parentId ? v.parentId : null,
    note: typeof v.note === "string" && v.note.trim() ? v.note.trim().slice(0, 200) : null, createdAt: typeof v.createdAt === "string" ? v.createdAt : null };
}
export function readUserSpots(docs) {
  const out = {};
  docs.forEach((d) => { if (validSpotId(d.id)) { const s = readUserSpot(d.data()); if (s) out[d.id] = s; } });
  return out;
}

// ---------- sessions: profiles/{pid}/sessions/{id} ----------
// A session with a length and a kill list, with its id; null for anything else.
export const readSession = (id, v) => (v && v.hours > 0 && Array.isArray(v.kills) ? Object.assign({ id }, v) : null);
export function readSessions(docs) {
  const out = [];
  docs.forEach((d) => { const x = readSession(d.id, d.data()); if (x) out.push(x); });
  return out;
}

// ---------- shared creature settings: creatures/{slug} ----------
// {name, minLevel {vocation: level}} or null.
export const readCreatureDoc = (v) => (v && v.minLevel && typeof v.minLevel === "object" ? { name: v.name, minLevel: v.minLevel } : null);
export function readCreatureDocs(docs) {
  const out = {};
  docs.forEach((d) => { const c = readCreatureDoc(d.data()); if (c) out[d.id] = c; });
  return out;
}

// ---------- planner: profiles/{pid}/planner/state ----------
export function plDefaults() {
  return { fixedHours: null, diff: "master", held: null, today: { boosted: null, boostedDay: null, prey: [], event: 0 }, lens: {}, active: null, travel: {}, world: null };
}
// A number within lo..hi, else null.
export function plNum(v, lo, hi) { const n = Number(v); return v != null && v !== "" && isFinite(n) && n >= lo && n <= hi ? n : null; }
// The planner state {fixedHours, diff, held, today, world, travel, lens, active}; known(slug) says whether a creature
// exists. fixedHours: a session length the player picked; none means hourly rates. (An older sessionHours field held a
// default that was saved whether or not it was chosen, so it's ignored.)
export function readPlState(v, known) {
  const s = plDefaults();
  if (!v || typeof v !== "object") return s;
  const h = plNum(v.fixedHours, 0.25, 12), x = v.held, a = v.active;
  if (h) s.fixedHours = h;
  if (TASK[v.diff]) s.diff = v.diff;
  if (x && typeof x === "object" && known(x.slug)) {
    s.held = { slug: x.slug, kills: plNum(x.kills, 1, 100000), done: plNum(x.done, 0, 100000) || 0, kind: has(KIND_MULT, x.kind) ? x.kind : "normal",
      exp: plNum(x.exp, 1, 1e13), i: plNum(x.i, 0, 2) != null ? Math.floor(x.i) : -1, since: typeof x.since === "string" ? x.since : null };
  }
  const t = v.today && typeof v.today === "object" ? v.today : {};
  s.today = { boosted: known(t.boosted) ? t.boosted : null, boostedDay: typeof t.boostedDay === "string" ? t.boostedDay : null,
    prey: (Array.isArray(t.prey) ? t.prey : []).slice(0, PREY_SLOTS).filter((q) => q && known(q.slug) && has(PREY, q.kind)).map((q) => {
      const r = PREY[q.kind];
      return { slug: q.slug, kind: q.kind, pct: plNum(q.pct, r.lo, r.hi) || r.lo };
    }), event: plNum(t.event, 0, 100) || 0 };
  if (typeof v.world === "string" && v.world.trim()) s.world = v.world.trim().slice(0, 30);
  if (v.travel && typeof v.travel === "object") Object.keys(v.travel).forEach((k) => { const m = plNum(v.travel[k], 1, 600); if (validSpotId(k) && m) s.travel[k] = m; });
  if (v.lens && typeof v.lens === "object") s.lens = v.lens;
  // The bounty is checked by readBounty, which also migrates the fields above; keep it as stored.
  if (v.bounty && typeof v.bounty === "object") s.bounty = v.bounty;
  if (v.hunting === null || (v.hunting && typeof v.hunting === "object")) s.hunting = v.hunting;
  if (a && typeof a === "object" && typeof a.spot === "string" && typeof a.at === "string") {
    s.active = { spot: a.spot, name: String(a.name || a.spot).slice(0, 60), at: a.at, slug: known(a.slug) ? a.slug : null };
  }
  return s;
}

// ---------- weekly kill tasks: profiles/{pid}, field weeklyTasks ----------
// {weekStart, difficulty, slots 6 | 9, exp (an override, or null), tasks [{slug or name, killsLeft, done}]}. Older
// profiles have `weekly` {week, diff, exp, tasks [{name, kills, extra}]}, read by weeklyTasksFromOld; it stays as it was.
export const WEEKLY_SLOTS = [6, 9];
export function readWeeklyTasks(v, known) {
  const w = v && typeof v === "object" ? v : {}, slots = w.slots === 9 ? 9 : 6;
  const tasks = (Array.isArray(w.tasks) ? w.tasks : []).slice(0, slots).map((t) => {
    t = t && typeof t === "object" ? t : {};
    const slug = t.slug && known(t.slug) ? t.slug : null;
    return { slug, name: slug ? null : (typeof t.name === "string" ? t.name.trim().slice(0, 60) : "") || null, killsLeft: plNum(t.killsLeft, 0, 100000), done: t.done === true };
  });
  return { weekStart: typeof w.weekStart === "string" ? w.weekStart : null, difficulty: TASK[w.difficulty] ? w.difficulty : "master", slots, exp: plNum(w.exp, 1, 1e12), tasks };
}
// The old weekly as the new shape. rows: the old rows as the old app computed them (core/weekly.js weeklyRows: name,
// creature, K, rem), so kills left = kills − kills logged since the reset − kills added by hand, computed once here.
export function weeklyTasksFromOld(old, rows) {
  const w = old && typeof old === "object" ? old : {}, n = Array.isArray(w.tasks) ? w.tasks.filter((t) => t && (t.name || t.kills)).length : 0;
  const tasks = rows.filter((r) => r.name).map((r) => ({ slug: r.creature ? r.creature.slug : null, name: r.creature ? null : r.name, killsLeft: r.K ? r.rem : null, done: !!(r.K && r.rem === 0) }));
  return { weekStart: typeof w.week === "string" ? w.week : null, difficulty: TASK[w.diff] ? w.diff : "master", slots: n > 6 ? 9 : 6, exp: plNum(w.exp, 1, 1e12), tasks };
}

// Hunting now: {spotId, at} or null. Older planner states had a timer session `active` {spot, at}, which becomes
// Hunting now at its spot until something else is saved.
export function readHunting(st) {
  const h = st && st.hunting;
  if (h === null) return null;
  if (h && typeof h.spotId === "string" && typeof h.at === "string") return { spotId: h.spotId, at: h.at };
  const a = st && st.active;
  return a && typeof a.spot === "string" && typeof a.at === "string" ? { spotId: a.spot, at: a.at } : null;
}

// ---------- the bounty: profiles/{pid}/planner/state, field bounty ----------
// {difficulty, tokens (0-10, or null when never set), mode "offers" | "active", offers [3] {slug, kills, kind, exp},
// active {slug, kills, killsLeft, kind, exp, since} or null}. Older data: tokens from the profile's reroll.left, offers
// from its board (names matched by slugOf), difficulty from the planner's diff, and the held offer becomes the active
// bounty with killsLeft = kills − the kills typed as done (kills counted from logged hunts are left out).
// ctx: {known(slug), slugOf(name) → slug or null}.
export const OFFER_KINDS = ["normal", "silver", "gold"];
export const blankOffer = () => ({ slug: null, kills: null, kind: "normal", exp: null });
function readOffer(o, ctx) {
  if (!o || typeof o !== "object") return blankOffer();
  const slug = o.slug && ctx.known(o.slug) ? o.slug : (o.name ? ctx.slugOf(o.name) : null);
  return { slug: slug || null, kills: plNum(o.kills, 1, 100000), kind: OFFER_KINDS.indexOf(o.kind) !== -1 ? o.kind : "normal", exp: plNum(o.exp, 1, 1e13) };
}
function readActive(a, ctx) {
  if (!a || typeof a !== "object" || !ctx.known(a.slug)) return null;
  const kills = plNum(a.kills, 1, 100000), left = plNum(a.killsLeft, 0, 100000);
  return { slug: a.slug, kills, killsLeft: left != null ? (kills ? Math.min(left, kills) : left) : kills, kind: OFFER_KINDS.indexOf(a.kind) !== -1 ? a.kind : "normal",
    exp: plNum(a.exp, 1, 1e13), since: typeof a.since === "string" ? a.since : null };
}
export function readBounty(plState, profile, ctx) {
  const st = plState && typeof plState === "object" ? plState : {}, b = st.bounty;
  const offers = (list) => [0, 1, 2].map((i) => readOffer((list || [])[i], ctx));
  if (b && typeof b === "object") {
    const active = readActive(b.active, ctx);
    return { difficulty: TASK[b.difficulty] ? b.difficulty : "master", tokens: b.tokens == null ? null : Math.max(0, Math.min(10, Math.floor(Number(b.tokens)) || 0)),
      mode: b.mode === "active" && active ? "active" : "offers", offers: offers(Array.isArray(b.offers) ? b.offers : []), active };
  }
  const p = profile || {}, reroll = p.reroll || {}, board = p.board || {}, h = st.held;
  const left = reroll.left == null ? null : Math.max(0, Math.min(10, parseInt(reroll.left, 10) || 0));
  let active = null;
  if (h && typeof h === "object" && ctx.known(h.slug)) {
    const kills = plNum(h.kills, 1, 100000), done = plNum(h.done, 0, 100000) || 0;
    active = { slug: h.slug, kills, killsLeft: kills != null ? Math.max(0, kills - done) : null, kind: OFFER_KINDS.indexOf(h.kind) !== -1 ? h.kind : "normal",
      exp: plNum(h.exp, 1, 1e13), since: typeof h.since === "string" ? h.since : null };
  }
  return { difficulty: TASK[st.diff] ? st.diff : "master", tokens: left, mode: active ? "active" : "offers", offers: offers(Array.isArray(board.offers) ? board.offers : []), active };
}

// ---------- marks and occupancy: profiles/{pid}/marks/{spotId}, profiles/{pid}/occupancy/{spotId} ----------
// {state "taken" | "free", at, world} or null.
export function readMark(v) {
  return v && (v.state === "taken" || v.state === "free") && typeof v.at === "string" ? { state: v.state, at: v.at, world: typeof v.world === "string" ? v.world : null } : null;
}
export function readMarks(docs) {
  const out = {};
  docs.forEach((d) => { const m = readMark(d.data()); if (m) out[d.id] = m; });
  return out;
}
// {counts {"world|hour": [free, taken]}}, keeping only well-formed keys and non-negative counts.
export function readOcc(v) {
  const out = { counts: {} };
  Object.keys(v && v.counts && typeof v.counts === "object" ? v.counts : {}).forEach((k) => {
    const c = v.counts[k];
    if (/^[^|]*\|([0-9]|1[0-9]|2[0-3])$/.test(k) && Array.isArray(c)) out.counts[k] = [Math.max(0, Number(c[0]) || 0), Math.max(0, Number(c[1]) || 0)];
  });
  return out;
}
export function readOccs(docs) {
  const out = {};
  docs.forEach((d) => { out[d.id] = readOcc(d.data()); });
  return out;
}
