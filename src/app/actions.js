// Everything the app writes, one function each, over a repo (store/repo.js). app/app.js keeps the optimistic state and
// reports failures it gets through onFail(code) (ARCHITECTURE.md, Actions).
import { PROFILES, HUNTS, SPOTS, META, HUNTS_META_ID, profilePath, entryPath, creaturePath, plStatePath, marksPath, occupancyPath, sessionsPath, spotsPath,
  huntPath, sharedSpotPath, huntsMetaPath } from "../store/schema.js";
import { backupWrites, backupHuntsMeta, buildBackup, restoreWrites, READ_LIMIT } from "../store/backup.js";
import { migrateHunts, mergeHunts, mergeHuntsMeta } from "../store/migrate.js";

export function makeActions(repo) {
  // Deletes every document in a collection (planner marks and occupancy).
  const clear = (col) => repo.get(col, 1000).then((docs) => { docs.forEach((d) => { repo.remove(col + "/" + d.id); }); }, () => {});
  const forgetPlanner = (pid) => {
    repo.remove(plStatePath(pid));
    clear(marksPath(pid));
    clear(occupancyPath(pid));
  };
  const byId = (docs) => { const out = {}; docs.forEach((d) => { out[d.id] = d.data(); }); return out; };
  const huntsMeta = () => repo.get(META, 10).then((docs) => { const d = docs.filter((x) => x.id === HUNTS_META_ID)[0]; return d ? d.data() : null; });

  // Copies every character's old hunts and spots into the shared ones (store/migrate.js), once each. Resolves with
  // {hunts, spots, written}: what it copied, and a promise that settles when the writes are done (written resolves
  // with false when one failed, so the app keeps showing the copies it couldn't store).
  function migrate(at) {
    return repo.get(PROFILES, 100).then((pdocs) => {
      const profiles = byId(pdocs), pids = Object.keys(profiles);
      return Promise.all([repo.get(HUNTS, READ_LIMIT), repo.get(SPOTS, READ_LIMIT), huntsMeta()].concat(pids.map((pid) => Promise.all([repo.get(sessionsPath(pid), READ_LIMIT), repo.get(spotsPath(pid), READ_LIMIT)]))))
        .then((res) => {
          const sessions = {}, spots = {};
          pids.forEach((pid, i) => { sessions[pid] = byId(res[3 + i][0]); spots[pid] = byId(res[3 + i][1]); });
          const m = migrateHunts({ profiles, sessions, spots, hunts: byId(res[0]), sharedSpots: byId(res[1]), meta: res[2], at });
          if (!m.changed) return { hunts: {}, spots: {}, written: Promise.resolve(true) };
          let ok = true;
          const fail = () => { ok = false; };
          // The record goes last: until it's stored, a later run finds the copies by id and content instead.
          const writes = Object.keys(m.spots).map((id) => repo.set(sharedSpotPath(id), m.spots[id], fail))
            .concat(Object.keys(m.hunts).map((id) => repo.set(huntPath(id), m.hunts[id], fail)));
          const written = Promise.all(writes).then(() => (ok ? repo.set(huntsMetaPath, m.meta, fail) : null)).then(() => ok);
          return { hunts: m.hunts, spots: m.spots, written };
        });
    });
  }

  return {
    // Characters. createProfile returns the new character's id at once; onSaved runs once it's written.
    createProfile(body, onSaved, onFail) {
      const id = repo.newId(PROFILES);
      repo.write(profilePath(id), (ref) => ref.set(body).then(onSaved), onFail);
      return id;
    },
    updateProfile(pid, patch, onSaved, onFail) { return repo.write(profilePath(pid), (ref) => ref.update(patch).then(onSaved), onFail); },
    // A character and what's only its own: entries (their slugs), planner documents, profile. The shared hunts and
    // spots stay, and so do its old hunt and spot documents (already copied into them; Compatibility rule).
    deleteCharacter(pid, entrySlugs) {
      entrySlugs.forEach((s) => { repo.remove(entryPath(pid, s)); });
      forgetPlanner(pid);
      repo.remove(profilePath(pid));
    },
    forgetPlanner,

    // A creature's entry; null deletes it.
    setEntry(pid, slug, body, onFail) { return body ? repo.set(entryPath(pid, slug), body, onFail) : repo.remove(entryPath(pid, slug), onFail); },
    // Shared creature settings ({name, minLevel}); null deletes them.
    setCreatureSettings(slug, body, onFail) { return body ? repo.set(creaturePath(slug), body, onFail) : repo.remove(creaturePath(slug), onFail); },

    // Shared hunts. The id for a new one comes first, so the screen can show it before it's written; the stored
    // document never carries its own id.
    newHuntId() { return repo.newId(HUNTS); },
    saveHunt(id, body, onFail) { const b = Object.assign({}, body); delete b.id; return repo.set(huntPath(id), b, onFail); },
    deleteHunt(id, onFail) { return repo.remove(huntPath(id), onFail); },

    // Shared spots.
    saveSpot(id, body, onFail) { return repo.set(sharedSpotPath(id), body, onFail); },
    deleteSpot(id, onFail) { return repo.remove(sharedSpotPath(id), onFail); },

    // Planner documents.
    savePlannerState(pid, body, onFail) { return repo.set(plStatePath(pid), body, onFail); },
    setMark(pid, spotId, mark, occ) {
      repo.set(marksPath(pid) + "/" + spotId, mark);
      if (occ) repo.set(occupancyPath(pid) + "/" + spotId, occ);
    },

    migrate,
    // Backups: the file's contents for these characters, and restoring one (throws Error("bad") or Error("empty") for a
    // file it can't use; otherwise resolves when every document is written). Its hunts join the stored ones
    // (mergeHunts); then the migration copies any old hunts it brought (version 1 and 2 files).
    exportBackup(args) { return buildBackup(repo, args); },
    restoreBackup(bk, at, onWrite) {
      const writes = backupWrites(bk), meta = backupHuntsMeta(bk);
      return Promise.all([repo.get(HUNTS, READ_LIMIT), meta ? huntsMeta() : null]).then((res) => {
        const hunts = mergeHunts(byId(res[0]), bk.hunts);
        const all = writes.concat(Object.keys(hunts).map((id) => [huntPath(id), hunts[id]]));
        if (meta) all.push([huntsMetaPath, mergeHuntsMeta(res[1], meta, at)]);
        return restoreWrites(repo, all, onWrite);
      }).then(() => migrate(at)).then((m) => m.written);
    },
  };
}
