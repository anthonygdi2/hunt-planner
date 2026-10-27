// A character's weekly kill tasks as the app uses them (F5): the stored weeklyTasks, or the old weekly read once with
// the old rule (kills since the reset counted from sessions). Nothing counts kills from logged hunts any more: the
// player types kills left and ticks Done.
import { readWeekly, weeklyRows as oldRows, weekKey, weeklyReward, ANY_CREATURE } from "../core/weekly.js";
import { readWeeklyTasks, weeklyTasksFromOld } from "../store/schema.js";

// p: profile; sessions and catalog for the old rule; at: a Date. Returns {weekStart, difficulty, slots, exp (the
// override or the formula), override, formula, current (no week saved, or this week), tasks [{slug, name, killsLeft,
// done}], any {killsLeft, done} (the Any Creature task)}.
export function weeklyState(p, sessions, catalog, at) {
  p = p || {};
  const w = p.weeklyTasks ? readWeeklyTasks(p.weeklyTasks, (s) => !!catalog.bySlug[s])
    : weeklyTasksFromOld(p.weekly, oldRows(readWeekly(p.weekly, p.level, at), sessions, catalog, at));
  const formula = weeklyReward(p.level, w.difficulty);
  return Object.assign(w, { exp: w.exp > 0 ? w.exp : formula, override: w.exp > 0 ? w.exp : null, formula, current: !w.weekStart || w.weekStart === weekKey(at) });
}

// Rows for the screens: {i, slug, name, key (the slug, or "n:" + the name's key), killsLeft, done, open}.
export function weeklyTaskRows(w, catalog) {
  return w.tasks.map((t, i) => {
    const c = t.slug ? catalog.bySlug[t.slug] : null, name = c ? c.name : t.name || "";
    return { i, slug: t.slug, name, key: c ? c.slug : name ? catalog.nameKey(name) : null, killsLeft: t.killsLeft, done: t.done, open: !!name && !t.done && t.killsLeft > 0 };
  });
}

// The tasks still open this week, each worth the weekly reward: [{key, name, rem, exp}] (as core/weekly.js weeklyBonus
// takes them), the Any Creature task as key ANY_CREATURE. None once the week is over or without a reward.
export function openWeeklyTasks(w, catalog) {
  if (!w.current || !(w.exp > 0)) return [];
  const open = weeklyTaskRows(w, catalog).filter((r) => r.open && r.key).map((r) => ({ key: r.key, name: r.name, rem: r.killsLeft, exp: w.exp }));
  const any = w.any || {};
  if (!any.done && any.killsLeft > 0) open.push({ key: ANY_CREATURE, name: "Any Creature", rem: any.killsLeft, exp: w.exp });
  return open;
}
