// The app's state, fed by repo subscriptions: each watcher reads its documents through store/schema.js and hands the
// normalized value to its callback. The screens keep the values (today in the legacy module's variables; from Phase F
// in one state object) and re-render when they change.
import { PROFILES, CREATURES, entriesPath, sessionsPath, plannerPath, marksPath, occupancyPath, spotsPath, readRecords, readSessions, readCreatureDocs,
  readPlState, readMarks, readOccs, readUserSpots } from "../store/schema.js";

// The profiles snapshot merged with this device's unsaved changes: pending (pid → patch still being written) applies on
// top of what's stored, and characters created here but not stored yet (pendingNew) are kept from current. Ordered by
// creation time. Returns {profiles, order}.
export function mergeProfiles(docs, { pending, pendingNew, current }) {
  const next = {}, order = [];
  docs.forEach((d) => { const v = d.data(); if (v) { next[d.id] = Object.assign({}, v, pending[d.id] || {}); order.push(d.id); } });
  Object.keys(current).forEach((id) => { if (!next[id] && pendingNew[id]) { next[id] = current[id]; order.push(id); } });
  order.sort((a, b) => String(next[a].createdAt || "").localeCompare(String(next[b].createdAt || "")));
  return { profiles: next, order };
}

// Watchers over a repo; each returns its unsubscribe function. known(slug) says whether a creature exists (for the
// planner state). onError is optional everywhere.
export function makeWatchers(repo, { known }) {
  return {
    // Every character's profile document, raw (merge with mergeProfiles).
    profiles: (fn, onError) => repo.watch(PROFILES, 100, fn, onError),
    // Shared creature settings: slug → {name, minLevel}.
    creatures: (fn, onError) => repo.watch(CREATURES, 1000, (docs) => fn(readCreatureDocs(docs)), onError),
    // A character's entries (slug → record) and sessions (with ids).
    entries: (pid, fn, onError) => repo.watch(entriesPath(pid), 1000, (docs) => fn(readRecords(docs)), onError),
    sessions: (pid, fn, onError) => repo.watch(sessionsPath(pid), 1000, (docs) => fn(readSessions(docs)), onError),
    // A character's planner state, Taken/Free marks and occupancy counts.
    plannerState: (pid, fn, onError) => repo.watch(plannerPath(pid), 10, (docs) => { const d = docs.filter((x) => x.id === "state")[0]; fn(readPlState(d && d.data(), known)); }, onError),
    marks: (pid, fn, onError) => repo.watch(marksPath(pid), 1000, (docs) => fn(readMarks(docs)), onError),
    occupancy: (pid, fn, onError) => repo.watch(occupancyPath(pid), 1000, (docs) => fn(readOccs(docs)), onError),
    // The character's own spots: id → {name, parentId, note, createdAt}.
    spots: (pid, fn, onError) => repo.watch(spotsPath(pid), 1000, (docs) => fn(readUserSpots(docs)), onError),
  };
}
