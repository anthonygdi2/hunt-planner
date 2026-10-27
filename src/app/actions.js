// Everything the app writes, one function each, over a repo (store/repo.js). These are the current app's write paths;
// the screens still keep their own optimistic copies and report failures through onFail(code). Phase F moves the
// optimistic state here (ARCHITECTURE.md, Actions).
import { PROFILES, profilePath, entryPath, sessionPath, sessionsPath, creaturePath, plStatePath, marksPath, occupancyPath, spotPath, spotsPath } from "../store/schema.js";
import { backupWrites, buildBackup, restoreWrites } from "../store/backup.js";

export function makeActions(repo) {
  // Deletes every document in a collection (planner marks and occupancy).
  const clear = (col) => repo.get(col, 1000).then((docs) => { docs.forEach((d) => { repo.remove(col + "/" + d.id); }); }, () => {});
  const forgetPlanner = (pid) => {
    repo.remove(plStatePath(pid));
    clear(marksPath(pid));
    clear(occupancyPath(pid));
  };
  return {
    // Characters. createProfile returns the new character's id at once; onSaved runs once it's written.
    createProfile(body, onSaved, onFail) {
      const id = repo.newId(PROFILES);
      repo.write(profilePath(id), (ref) => ref.set(body).then(onSaved), onFail);
      return id;
    },
    updateProfile(pid, patch, onSaved, onFail) { return repo.write(profilePath(pid), (ref) => ref.update(patch).then(onSaved), onFail); },
    // A character and everything under it: entries (their slugs), sessions (their ids), planner documents, profile.
    deleteCharacter(pid, entrySlugs, sessionIds) {
      entrySlugs.forEach((s) => { repo.remove(entryPath(pid, s)); });
      sessionIds.forEach((id) => { repo.remove(sessionPath(pid, id)); });
      clear(spotsPath(pid));
      forgetPlanner(pid);
      repo.remove(profilePath(pid));
    },
    forgetPlanner,

    // A creature's entry; null deletes it.
    setEntry(pid, slug, body, onFail) { return body ? repo.set(entryPath(pid, slug), body, onFail) : repo.remove(entryPath(pid, slug), onFail); },
    // Shared creature settings ({name, minLevel}); null deletes them.
    setCreatureSettings(slug, body, onFail) { return body ? repo.set(creaturePath(slug), body, onFail) : repo.remove(creaturePath(slug), onFail); },

    // Sessions. The id for a new one comes first, so the screen can show it before it's written; the stored document
    // never carries its own id.
    newSessionId(pid) { return repo.newId(sessionsPath(pid)); },
    saveSession(pid, id, body, onFail) { const b = Object.assign({}, body); delete b.id; return repo.set(sessionPath(pid, id), b, onFail); },
    deleteSession(pid, id, onFail) { return repo.remove(sessionPath(pid, id), onFail); },

    // The character's own spots.
    saveSpot(pid, id, body, onFail) { return repo.set(spotPath(pid, id), body, onFail); },
    deleteSpot(pid, id, onFail) { return repo.remove(spotPath(pid, id), onFail); },

    // Planner documents.
    savePlannerState(pid, body, onFail) { return repo.set(plStatePath(pid), body, onFail); },
    setMark(pid, spotId, mark, occ) {
      repo.set(marksPath(pid) + "/" + spotId, mark);
      if (occ) repo.set(occupancyPath(pid) + "/" + spotId, occ);
    },

    // Backups: the file's contents for these characters, and restoring one (throws Error("bad") or Error("empty") for a
    // file it can't use; otherwise resolves when every document is written).
    exportBackup(args) { return buildBackup(repo, args); },
    restoreBackup(bk, onWrite) { return restoreWrites(repo, backupWrites(bk), onWrite); },
  };
}
