// The app's state, fed by repo subscriptions: each watcher reads its documents through store/schema.js and hands the
// normalized value to its callback. The screens keep the values (today in the legacy module's variables; from Phase F
// in one state object) and re-render when they change.
import { PROFILES, CREATURES, HUNTS, SPOTS, entriesPath, plannerPath, marksPath, occupancyPath, readRecords, readHunts, readCreatureDocs,
  readPlState, readMarks, readOccs, readUserSpots } from "../store/schema.js";
import { READ_LIMIT } from "../store/backup.js";

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
    // Every logged hunt (with ids) and the spots made for them, shared by all characters.
    hunts: (fn, onError) => repo.watch(HUNTS, READ_LIMIT, (docs) => fn(readHunts(docs)), onError),
    spots: (fn, onError) => repo.watch(SPOTS, READ_LIMIT, (docs) => fn(readUserSpots(docs)), onError),
    // A character's entries (slug → record).
    entries: (pid, fn, onError) => repo.watch(entriesPath(pid), 1000, (docs) => fn(readRecords(docs)), onError),
    // A character's planner state, Taken/Free marks and occupancy counts.
    plannerState: (pid, fn, onError) => repo.watch(plannerPath(pid), 10, (docs) => { const d = docs.filter((x) => x.id === "state")[0]; fn(readPlState(d && d.data(), known)); }, onError),
    marks: (pid, fn, onError) => repo.watch(marksPath(pid), 1000, (docs) => fn(readMarks(docs)), onError),
    occupancy: (pid, fn, onError) => repo.watch(occupancyPath(pid), 1000, (docs) => fn(readOccs(docs)), onError),
  };
}
