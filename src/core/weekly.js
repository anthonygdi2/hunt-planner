// Weekly kill tasks: the week, the reward, each task's progress, and what an hour at a spot adds toward them.
import { norm } from "./text.js";
import { SERVER_SAVE_UTC_HOUR, TASK, WEEKLY_CAP, WEEKLY_MAX_TASKS, WEEKLY_MIN_LEVEL, WEEKLY_KILL_POINTS, DIFFICULTIES, weeklyExpFormula } from "../data/rules.js";

// The start of the week containing `now` (a Date): Monday at server save, UTC.
export function weekStart(now) {
  const s = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), SERVER_SAVE_UTC_HOUR, 0, 0));
  s.setUTCDate(s.getUTCDate() - (s.getUTCDay() + 6) % 7);
  if (s > now) s.setUTCDate(s.getUTCDate() - 7);
  return s;
}
// The week's id, its start date: "2026-10-19".
export const weekKey = (now) => weekStart(now).toISOString().slice(0, 10);
// The server day a time (ms) falls in, which changes at server save: "2026-10-21".
export const serverDay = (t) => new Date(t - SERVER_SAVE_UTC_HOUR * 36e5).toISOString().slice(0, 10);

// Each weekly task's exp at this level and difficulty (the formula, capped); null without a level.
export function weeklyReward(level, diff) {
  const f = weeklyExpFormula(Number(level));
  return f != null ? Math.min(f, WEEKLY_CAP[diff]) : null;
}

// The weekly difficulties at a level, easiest first: [{diff, exp (per kill task), capped, locked (below its level),
// points (Hunting Task Points per kill task)}], and best: the easiest open one paying the full exp. Only exp and points
// are compared: the creatures and kill counts per difficulty aren't published. Null without a level.
export function weeklyDifficulties(level) {
  const L = Number(level), f = weeklyExpFormula(L);
  if (f == null) return null;
  const rows = DIFFICULTIES.map((diff) => ({ diff, exp: Math.min(f, WEEKLY_CAP[diff]), capped: f > WEEKLY_CAP[diff], locked: L < WEEKLY_MIN_LEVEL[diff],
    minLevel: WEEKLY_MIN_LEVEL[diff], points: WEEKLY_KILL_POINTS[diff] }));
  const open = rows.filter((r) => !r.locked), top = Math.max(...open.map((r) => r.exp));
  return { rows, best: open.filter((r) => r.exp === top)[0].diff, exp: f };
}

// The stored weekly ({week, diff, exp, tasks [{name, kills, extra}]}) read for this level at `now`:
// {diff (default master), tasks (always WEEKLY_MAX_TASKS, blanks as {}), week, current (no week saved, or this week),
//  exp (the player's override, else the formula), override, formula}.
export function readWeekly(w, level, now) {
  w = w || {};
  const tasks = Array.isArray(w.tasks) ? w.tasks.slice(0, WEEKLY_MAX_TASKS) : [];
  while (tasks.length < WEEKLY_MAX_TASKS) tasks.push({});
  const diff = TASK[w.diff] ? w.diff : "master", formula = weeklyReward(level, diff);
  return { diff, tasks, week: w.week || null, current: !w.week || w.week === weekKey(now), exp: w.exp > 0 ? w.exp : formula, override: w.exp > 0 ? w.exp : null, formula };
}

// Kills of `key` (catalog.killKey) in sessions that ended at or after `since` (a Date).
export function loggedSince(sessions, key, since, catalog) {
  let n = 0;
  sessions.forEach((x) => {
    if (!x.end || !Array.isArray(x.kills) || new Date(x.end) < since) return;
    x.kills.forEach((k) => { if (catalog.killKey(k) === key) n += k.count || 0; });
  });
  return n;
}

// One row per task slot: {i, t (the stored task), creature (catalog match or undefined), key, name, K (kills needed or
// null), logged (kills in sessions this week, while the week is current), extra (kills the player added), done, rem}.
export function weeklyRows(weekly, sessions, catalog, now) {
  const start = weekStart(now);
  return weekly.tasks.map((t, i) => {
    const name = (t.name || "").trim(), c = catalog.byName[norm(name)], key = name ? catalog.nameKey(name) : null;
    const K = Number(t.kills) > 0 ? Number(t.kills) : null, extra = Number(t.extra) > 0 ? Number(t.extra) : 0;
    const logged = key && weekly.current ? loggedSince(sessions, key, start, catalog) : 0, done = logged + extra;
    return { i, t, creature: c, key, name: c ? c.name : name, K, logged, extra, done, rem: K ? Math.max(0, K - done) : null };
  });
}

// The tasks still open this week, each worth `exp`: [{key, name, rem, exp}]. None when the week is over or there's no
// reward.
export function openWeeklies(weekly, rows) {
  const out = [];
  if (!weekly.current || !(weekly.exp > 0)) return out;
  rows.forEach((r) => { if (r.key && r.rem > 0) out.push({ key: r.key, name: r.name, rem: r.rem, exp: weekly.exp }); });
  return out;
}

// The key of the weekly "Any Creature" kill task (one every week since the winter update 2025, TibiaWiki BR Weekly
// Tasks and TibiaQA 38271): every kill counts toward it. The kill count isn't published, so the player types it.
export const ANY_CREATURE = "any";
// All kills per hour at a spot ({key: kph}).
export const allKph = (kph) => Object.keys(kph || {}).reduce((a, k) => a + (kph[k] > 0 ? kph[k] : 0), 0);

// Weekly exp per hour from hunting `hours` at a spot whose kills/h are `spotKph` ({key: kph}, or null). Each kill still
// needed for an open weekly is worth an equal share of its reward. The bounty creature's own task kills (selfSlug,
// selfKills) always count toward its weekly; other weeklies need the spot to have them; Any Creature takes every kill.
export function weeklyBonus(open, spotKph, hours, selfSlug, selfKills) {
  if (!open.length || !(hours > 0)) return 0;
  let v = 0;
  open.forEach((w) => {
    if (w.key === ANY_CREATURE) {
      const all = Math.max(allKph(spotKph) * hours, selfKills || 0);
      if (all > 0) v += w.exp * Math.min(1, all / w.rem);
      return;
    }
    if (selfSlug && w.key === selfSlug) { v += w.exp * Math.min(1, (selfKills || 0) / w.rem); return; }
    const k = spotKph && spotKph[w.key];
    if (k > 0) v += w.exp * Math.min(1, k * hours / w.rem);
  });
  return v / hours;
}
