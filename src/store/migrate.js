// Migrations between stored shapes. Pure: documents in, documents to write out; app/actions.js reads and writes them.
//
// Shared hunts (November 2026). Hunts used to live under each character (profiles/{pid}/sessions/{id}, with its own
// spots in profiles/{pid}/spots/{id}); now every hunt is stored once in hunts/{id}, shared by all characters in the
// same storage, with the vocation and level it was logged at and the character that logged it, and spots in
// spots/{id}. The old documents stay where they are (Compatibility rule), so an older build still shows the hunts as
// they were before the migration, but not the ones logged after it. meta/hunts records which old documents were
// copied, and where to, so running the migration again (on every connect, after a restore) never copies one twice.
import { VOCATIONS } from "../data/rules.js";
import { readSession, readUserSpot, readHuntsMeta, validSpotId, validHuntId } from "./schema.js";

export const HUNTS_MIGRATION = 1;

// The same hunt saved twice: same start, end and exp (raw exp, else exp with bonuses). Null without start and end.
export function huntKey(x) {
  if (!x || !x.start || !x.end) return null;
  const xp = x.rawXp != null ? x.rawXp : x.xp;
  return String(x.start) + "|" + String(x.end) + "|" + (xp != null ? String(xp) : "");
}
// Whether two stored hunts are the same one (huntKey; without dates, the same length, exp and kills).
export function sameHunt(a, b) {
  const ka = huntKey(a), kb = huntKey(b);
  if (ka || kb) return ka === kb;
  const core = (x) => JSON.stringify([x.hours, x.rawXp, x.xp, x.kills]);
  return core(a) === core(b);
}
const spotName = (s) => String((s && s.name) || "").trim().toLowerCase();
// A character id as part of a spot id (lowercase letters, digits and dashes).
const pidSlug = (pid) => String(pid).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "c";
// The first free id among id, then prefix-id, prefix-id-2, ...: free, or holding the same thing (same(existing)).
function freeId(taken, id, prefix, same) {
  let n = 0, cand = id;
  while (taken[cand] && !same(taken[cand])) { n++; cand = prefix + "-" + id + (n > 1 ? "-" + n : ""); }
  return cand;
}

// Copies the characters' own hunts and spots into the shared collections.
// in: {profiles {pid: profile}, sessions {pid: {id: doc}}, spots {pid: {id: doc}} (the old per-character documents),
// hunts {id: doc}, sharedSpots {id: doc} (the shared ones already stored), meta (meta/hunts as stored, or null), at
// (ISO time)}. Each copied hunt gets vocation = its own || the profile's untaggedVocation || the profile's vocation,
// level = its own || the profile's, and by {pid, name}. An id already taken by something else becomes "{pid}-{id}"
// (spots: the pid as a slug), with spotId and parentId references rewritten; the same hunt (huntKey) or spot (name)
// already there is not copied again. Returns {hunts, spots (id → doc to write), meta (to write after them), changed}.
export function migrateHunts({ profiles, sessions, spots, hunts, sharedSpots, meta, at }) {
  const m = readHuntsMeta(meta), done = Object.assign({}, m.sessions), doneSpots = Object.assign({}, m.spots);
  const allHunts = Object.assign({}, hunts || {}), allSpots = Object.assign({}, sharedSpots || {});
  const before = new Map(), outHunts = {}, outSpots = {};
  Object.keys(allHunts).sort().forEach((id) => { const k = huntKey(allHunts[id]); if (k && !before.has(k)) before.set(k, id); });

  Object.keys(profiles || {}).sort().forEach((pid) => {
    const p = profiles[pid] || {}, mySpots = (spots || {})[pid] || {}, mine = (sessions || {})[pid] || {}, idMap = {}, fresh = [];
    // Spots first, so the hunts and variations that point at a renamed one follow it.
    Object.keys(mySpots).sort().forEach((id) => {
      const key = pid + ":" + id, s = readUserSpot(mySpots[id]);
      if (key in doneSpots) { idMap[id] = doneSpots[key]; return; }
      if (!validSpotId(id) || !s) return;
      const nid = freeId(allSpots, id, pidSlug(pid), (x) => spotName(x) === spotName(s));
      idMap[id] = doneSpots[key] = nid;
      if (!allSpots[nid]) fresh.push([nid, Object.assign({}, mySpots[id])]);
    });
    fresh.forEach(([nid, doc]) => {
      if (doc.parentId && idMap[doc.parentId]) doc.parentId = idMap[doc.parentId];
      allSpots[nid] = outSpots[nid] = doc;
    });
    const vocation = [p.untaggedVocation, p.vocation].filter((v) => VOCATIONS.indexOf(v) !== -1)[0] || VOCATIONS[0];
    const level = Number(p.level) > 0 ? Math.floor(Number(p.level)) : null, name = typeof p.name === "string" && p.name.trim() ? p.name.trim().slice(0, 40) : null;
    Object.keys(mine).sort().forEach((id) => {
      const key = pid + ":" + id;
      if (key in done) return;
      if (!validHuntId(id) || !readSession(id, mine[id])) { done[key] = null; return; }
      const x = mine[id], body = Object.assign({}, x, {
        vocation: VOCATIONS.indexOf(x.vocation) !== -1 ? x.vocation : vocation, level: Number(x.level) > 0 ? x.level : level, by: { pid, name } });
      delete body.id;
      if (body.spotId && idMap[body.spotId]) body.spotId = idMap[body.spotId];
      const k = huntKey(body);
      if (k && before.has(k)) { done[key] = before.get(k); return; }
      const nid = freeId(allHunts, id, pid, (y) => sameHunt(y, body));
      done[key] = nid;
      if (!allHunts[nid]) allHunts[nid] = outHunts[nid] = body;
    });
  });
  const changed = m.version < HUNTS_MIGRATION || Object.keys(done).length !== Object.keys(m.sessions).length || Object.keys(doneSpots).length !== Object.keys(m.spots).length;
  return { hunts: outHunts, spots: outSpots, meta: { version: Math.max(m.version, HUNTS_MIGRATION), at: changed ? at : m.at || at, sessions: done, spots: doneSpots }, changed };
}

// A backup's hunts merged into the stored ones by id: a hunt with the same id is written over (the backup's copy), a
// new id is added unless the same hunt (huntKey) is already stored under another id, and nothing is removed. Returns
// id → doc to write.
export function mergeHunts(stored, incoming) {
  const keys = new Set(), out = {};
  Object.keys(stored || {}).forEach((id) => { const k = huntKey(stored[id]); if (k) keys.add(k); });
  Object.keys(incoming && typeof incoming === "object" ? incoming : {}).sort().forEach((id) => {
    const x = incoming[id];
    if (!validHuntId(id) || !readSession(id, x)) return;
    const k = huntKey(x);
    if (!(stored || {})[id] && k && keys.has(k)) return;
    if (k) keys.add(k);
    const body = Object.assign({}, x);
    delete body.id;
    out[id] = body;
  });
  return out;
}

// Two migration records combined (a restore's into the stored one): every old document either has copied counts as
// copied, the stored record winning where both have it.
export function mergeHuntsMeta(stored, incoming, at) {
  const a = readHuntsMeta(stored), b = readHuntsMeta(incoming);
  return { version: Math.max(a.version, b.version), at: a.at || b.at || at, sessions: Object.assign({}, b.sessions, a.sessions), spots: Object.assign({}, b.spots, a.spots) };
}
