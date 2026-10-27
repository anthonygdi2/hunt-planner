// Backup files: {app: "bounty-task-tier-list", version: 2, exportedAt, creatures {slug: settings}, characters {id:
// {profile, entries {slug: entry}, sessions {id: session}, planner? {state, marks, occupancy}, spots? {id: spot}}}}.
// Restoring writes every document back at its path. Version 1 files (no spots) restore the same way; the planner and
// spots keys are optional both ways, so older versions can read newer backups.
import { profilePath, entryPath, entriesPath, sessionPath, sessionsPath, plannerPath, plStatePath, marksPath, occupancyPath, creaturePath, spotPath, spotsPath, readUserSpot,
  validCharacterId, validSpotId, readMark, readOcc } from "./schema.js";

export const BACKUP_APP = "bounty-task-tier-list";
export const BACKUP_VERSION = 2;

// A character's planner documents as [path, body] writes; marks and occupancy are checked as they're read.
export function plannerRestoreWrites(id, pl) {
  const out = [];
  if (!pl || typeof pl !== "object") return out;
  if (pl.state && typeof pl.state === "object") out.push([plStatePath(id), pl.state]);
  Object.keys(pl.marks && typeof pl.marks === "object" ? pl.marks : {}).forEach((k) => {
    if (validSpotId(k) && readMark(pl.marks[k])) out.push([marksPath(id) + "/" + k, pl.marks[k]]);
  });
  Object.keys(pl.occupancy && typeof pl.occupancy === "object" ? pl.occupancy : {}).forEach((k) => {
    if (validSpotId(k)) out.push([occupancyPath(id) + "/" + k, readOcc(pl.occupancy[k])]);
  });
  return out;
}

// The [path, body] writes that restore a parsed backup. Throws Error("bad") for anything that isn't a backup from this
// tool, Error("empty") for one with nothing to restore. Characters with odd ids or no profile are skipped.
export function backupWrites(bk) {
  if (!bk || bk.app !== BACKUP_APP || !bk.characters) throw new Error("bad");
  const writes = [];
  Object.keys(bk.characters).forEach((id) => {
    const c = bk.characters[id] || {};
    if (!validCharacterId(id) || !c.profile) return;
    writes.push([profilePath(id), c.profile]);
    Object.keys(c.entries || {}).forEach((e) => { writes.push([entryPath(id, e), c.entries[e]]); });
    Object.keys(c.sessions || {}).forEach((x) => { writes.push([sessionPath(id, x), c.sessions[x]]); });
    plannerRestoreWrites(id, c.planner).forEach((w) => { writes.push(w); });
    Object.keys(c.spots && typeof c.spots === "object" ? c.spots : {}).forEach((k) => { if (validSpotId(k) && readUserSpot(c.spots[k])) writes.push([spotPath(id, k), c.spots[k]]); });
  });
  Object.keys(bk.creatures || {}).forEach((k) => { writes.push([creaturePath(k), bk.creatures[k]]); });
  if (!writes.length) throw new Error("empty");
  return writes;
}

// A character's planner documents for a backup, or null when it has none.
export function plannerBackup(repo, id) {
  return Promise.all([repo.get(plannerPath(id), 10), repo.get(marksPath(id), 1000), repo.get(occupancyPath(id), 1000)]).then((res) => {
    const st = res[0].filter((d) => d.id === "state")[0], marks = {}, occ = {};
    res[1].forEach((d) => { marks[d.id] = d.data(); });
    res[2].forEach((d) => { occ[d.id] = d.data(); });
    return st || Object.keys(marks).length || Object.keys(occ).length ? { state: st ? st.data() : null, marks, occupancy: occ } : null;
  });
}

// The backup of the given characters (ids, with their profiles as loaded) and the shared creature settings.
export function buildBackup(repo, { ids, profiles, creatures, exportedAt }) {
  const out = { app: BACKUP_APP, version: BACKUP_VERSION, exportedAt, creatures, characters: {} };
  return Promise.all(ids.map((id) => Promise.all([repo.get(entriesPath(id), 1000), repo.get(sessionsPath(id), 1000), plannerBackup(repo, id), repo.get(spotsPath(id), 1000)]).then((res) => {
    const entries = {}, sess = {}, spots = {};
    res[0].forEach((d) => { entries[d.id] = d.data(); });
    res[1].forEach((d) => { sess[d.id] = d.data(); });
    res[3].forEach((d) => { spots[d.id] = d.data(); });
    out.characters[id] = { profile: profiles[id], entries, sessions: sess };
    if (res[2]) out.characters[id].planner = res[2];
    if (Object.keys(spots).length) out.characters[id].spots = spots;
  }))).then(() => out);
}

// Writes a backup's documents one at a time (setDirect, so a failure stops the restore). onWrite() after each.
export function restoreWrites(repo, writes, onWrite) {
  return writes.reduce((p, w) => p.then(() => repo.setDirect(w[0], w[1]).then(() => { if (onWrite) onWrite(); })), Promise.resolve());
}
