// Backup files: {app: "bounty-task-tier-list", version: 3, exportedAt, creatures {slug: settings}, characters {id:
// {profile, entries {slug: entry}, sessions {id: session}, planner? {state, marks, occupancy}, spots? {id: spot}}},
// hunts {id: hunt}, spots {id: spot}, huntsMeta}. hunts and spots are the shared ones (store/migrate.js); a
// character's sessions and spots are its old documents as stored, kept so an older build can still restore the file.
// huntsMeta is the migration's record, so the old documents a restore brings back aren't copied into the shared hunts
// a second time. Version 1 (no spots) and 2 (a character's own spots) files restore their documents the same way,
// and the migration then copies their hunts into the shared ones. Every key past characters is optional both ways.
import { profilePath, entryPath, entriesPath, sessionPath, sessionsPath, plannerPath, plStatePath, marksPath, occupancyPath, creaturePath, spotPath, spotsPath, readUserSpot,
  validCharacterId, validSpotId, readMark, readOcc, HUNTS, SPOTS, META, HUNTS_META_ID, sharedSpotPath } from "./schema.js";

export const BACKUP_APP = "bounty-task-tier-list";
export const BACKUP_VERSION = 3;
// The most documents a collection read returns (the db's limit per read).
export const READ_LIMIT = 1000;

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

const obj = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : {});

// The [path, body] writes that restore a parsed backup's characters, creature settings and shared spots (its hunts are
// merged with the stored ones by app/actions.js, store/migrate.js mergeHunts). Throws Error("bad") for anything that
// isn't a backup from this tool, Error("empty") for one with nothing to restore. Characters with odd ids or no profile
// are skipped.
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
    Object.keys(obj(c.spots)).forEach((k) => { if (validSpotId(k) && readUserSpot(c.spots[k])) writes.push([spotPath(id, k), c.spots[k]]); });
  });
  Object.keys(bk.creatures || {}).forEach((k) => { writes.push([creaturePath(k), bk.creatures[k]]); });
  Object.keys(obj(bk.spots)).forEach((k) => { if (validSpotId(k) && readUserSpot(bk.spots[k])) writes.push([sharedSpotPath(k), bk.spots[k]]); });
  if (!writes.length && !Object.keys(obj(bk.hunts)).length) throw new Error("empty");
  return writes;
}

// The migration record a backup brings: its own, or for a version 3 file without one, every old hunt and spot it
// carries counted as copied already (its shared hunts are the ones that count). Null for older files: the migration
// copies their hunts after the restore.
export function backupHuntsMeta(bk) {
  if (!bk || !(bk.version >= 3)) return null;
  if (bk.huntsMeta && typeof bk.huntsMeta === "object") return bk.huntsMeta;
  const sessions = {}, spots = {};
  Object.keys(obj(bk.characters)).forEach((pid) => {
    const c = obj(bk.characters[pid]);
    Object.keys(obj(c.sessions)).forEach((id) => { sessions[pid + ":" + id] = null; });
    Object.keys(obj(c.spots)).forEach((id) => { spots[pid + ":" + id] = null; });
  });
  return { version: 1, sessions, spots };
}

// A character's planner documents for a backup, or null when it has none.
export function plannerBackup(repo, id) {
  return Promise.all([repo.get(plannerPath(id), 10), repo.get(marksPath(id), READ_LIMIT), repo.get(occupancyPath(id), READ_LIMIT)]).then((res) => {
    const st = res[0].filter((d) => d.id === "state")[0], marks = {}, occ = {};
    res[1].forEach((d) => { marks[d.id] = d.data(); });
    res[2].forEach((d) => { occ[d.id] = d.data(); });
    return st || Object.keys(marks).length || Object.keys(occ).length ? { state: st ? st.data() : null, marks, occupancy: occ } : null;
  });
}

const byId = (docs) => { const out = {}; docs.forEach((d) => { out[d.id] = d.data(); }); return out; };

// The backup of the given characters (ids, with their profiles as loaded), the shared hunts and spots, and the shared
// creature settings.
export function buildBackup(repo, { ids, profiles, creatures, exportedAt }) {
  const out = { app: BACKUP_APP, version: BACKUP_VERSION, exportedAt, creatures, characters: {}, hunts: {}, spots: {} };
  const shared = Promise.all([repo.get(HUNTS, READ_LIMIT), repo.get(SPOTS, READ_LIMIT), repo.get(META, 10)]).then((res) => {
    out.hunts = byId(res[0]);
    out.spots = byId(res[1]);
    const m = res[2].filter((d) => d.id === HUNTS_META_ID)[0];
    if (m) out.huntsMeta = m.data();
  });
  return Promise.all([shared].concat(ids.map((id) => Promise.all([repo.get(entriesPath(id), READ_LIMIT), repo.get(sessionsPath(id), READ_LIMIT), plannerBackup(repo, id), repo.get(spotsPath(id), READ_LIMIT)]).then((res) => {
    const spots = byId(res[3]);
    out.characters[id] = { profile: profiles[id], entries: byId(res[0]), sessions: byId(res[1]) };
    if (res[2]) out.characters[id].planner = res[2];
    if (Object.keys(spots).length) out.characters[id].spots = spots;
  })))).then(() => out);
}

// Writes a backup's documents one at a time (setDirect, so a failure stops the restore). onWrite() after each.
export function restoreWrites(repo, writes, onWrite) {
  return writes.reduce((p, w) => p.then(() => repo.setDirect(w[0], w[1]).then(() => { if (onWrite) onWrite(); })), Promise.resolve());
}
