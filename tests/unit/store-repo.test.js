import test from "node:test";
import assert from "node:assert/strict";
import { makeRepo } from "../../src/store/repo.js";
import { backupWrites, buildBackup, plannerRestoreWrites, restoreWrites, BACKUP_APP } from "../../src/store/backup.js";
import { makeActions } from "../../src/app/actions.js";
import { memDb, settle, dump } from "./helpers.js";

test("repo: writes to one path keep their order; failures report their code", async () => {
  const db = memDb(), repo = makeRepo(db);
  const order = [];
  repo.write("x/a", (ref) => new Promise((r) => setTimeout(r, 5)).then(() => { order.push(1); return ref.set({ v: 1 }); }));
  repo.write("x/a", (ref) => { order.push(2); return ref.set({ v: 2 }); });
  await settle(10);
  await new Promise((r) => setTimeout(r, 10));
  assert.deepEqual(order, [1, 2]);
  assert.deepEqual((await dump(db, ["x"]))["x/a"], { v: 2 });
  const codes = [];
  await repo.update("x/none", { v: 1 }, (c) => codes.push(c));
  assert.deepEqual(codes, ["not_found"]);
  assert.equal(repo.local, true);
});

test("repo: retries once when unavailable, stops edits when denied", async () => {
  let calls = 0, denied = 0;
  const fake = { doc: (path) => ({ path, set: () => (++calls === 1 ? Promise.reject({ code: "unavailable" }) : Promise.resolve()) }) };
  const repo = makeRepo(fake, { retryDelay: () => 0, onDenied: () => denied++ });
  const fails = [];
  await repo.set("a/b", {}, (c) => fails.push(c));
  assert.equal(calls, 2);
  assert.deepEqual(fails, []);
  const no = makeRepo({ doc: () => ({ set: () => Promise.reject({ code: "not_granted" }) }) }, { onDenied: () => denied++ });
  await no.set("a/b", {}, (c) => fails.push(c));
  assert.equal(denied, 1);
  assert.deepEqual(fails, ["not_granted"]);
});

test("repo: watch and get", async () => {
  const db = memDb(), repo = makeRepo(db);
  const seen = [];
  const off = repo.watch("profiles", 100, (docs) => seen.push(docs.map((d) => d.id)));
  await repo.set("profiles/a", { name: "A" });
  await settle();
  assert.deepEqual(seen.at(-1), ["a"]);
  off();
  assert.deepEqual((await repo.get("profiles", 100)).map((d) => d.data().name), ["A"]);
  assert.match(repo.newId("profiles"), /^[a-z0-9]+$/);
});

const BACKUP = {
  app: BACKUP_APP, version: 1, exportedAt: "2026-10-21T18:00:00.000Z", creatures: { rat: { name: "Rat", minLevel: { "Elite Knight": 8 } } },
  characters: {
    ek: { profile: { name: "EK", vocation: "Elite Knight" }, entries: { rat: { rating: "S" } }, sessions: { s1: { hours: 1, kills: [] } },
      planner: { state: { diff: "expert" }, marks: { "cobra-bastion": { state: "free", at: "t" }, "Bad Id": { state: "free", at: "t" }, junk: {} }, occupancy: { "cobra-bastion": { counts: { "a|1": [1, 0], bad: [1, 1] } } } } },
    "bad/id": { profile: {} },
    noprofile: { entries: { rat: {} } },
  },
};

test("backup: restore writes and their checks", () => {
  const w = backupWrites(BACKUP);
  assert.deepEqual(w.map((x) => x[0]), ["profiles/ek", "profiles/ek/entries/rat", "profiles/ek/sessions/s1", "profiles/ek/planner/state",
    "profiles/ek/marks/cobra-bastion", "profiles/ek/occupancy/cobra-bastion", "creatures/rat"]);
  assert.deepEqual(w[5][1], { counts: { "a|1": [1, 0] } });
  assert.throws(() => backupWrites({ app: "other", characters: {} }), /bad/);
  assert.throws(() => backupWrites(null), /bad/);
  assert.throws(() => backupWrites({ app: BACKUP_APP, characters: {} }), /empty/);
  assert.deepEqual(plannerRestoreWrites("ek", null), []);
});

test("backup: round trip through a db", async () => {
  const db = memDb(), repo = makeRepo(db);
  let n = 0;
  await restoreWrites(repo, backupWrites(BACKUP), () => n++);
  assert.equal(n, 7);
  const bk = await buildBackup(repo, { ids: ["ek"], profiles: { ek: BACKUP.characters.ek.profile }, creatures: BACKUP.creatures, exportedAt: BACKUP.exportedAt });
  assert.deepEqual(bk.characters.ek.entries, { rat: { rating: "S" } });
  assert.deepEqual(bk.characters.ek.sessions, { s1: { hours: 1, kills: [] } });
  assert.deepEqual(bk.characters.ek.planner, { state: { diff: "expert" }, marks: { "cobra-bastion": { state: "free", at: "t" } }, occupancy: { "cobra-bastion": { counts: { "a|1": [1, 0] } } } });
  assert.equal(bk.version, 2);
  assert.equal("spots" in bk.characters.ek, false, "no spots, no key");
  // A character's own spots go into the backup and come back on restore; a version 1 file (no spots) still restores.
  await restoreWrites(repo, backupWrites(Object.assign({}, BACKUP, { version: 2, characters: { ek: Object.assign({}, BACKUP.characters.ek, {
    spots: { "my-cave": { name: "My Cave", parentId: null, createdAt: "t" }, "Bad Id": { name: "x" }, "no-name": {} } }) } })));
  const two2 = await buildBackup(repo, { ids: ["ek"], profiles: { ek: {} }, creatures: {}, exportedAt: "x" });
  assert.deepEqual(two2.characters.ek.spots, { "my-cave": { name: "My Cave", parentId: null, createdAt: "t" } });
  // A character with no planner documents has no planner key.
  await repo.set("profiles/rp", { name: "RP" });
  const two = await buildBackup(repo, { ids: ["rp"], profiles: { rp: { name: "RP" } }, creatures: {}, exportedAt: "x" });
  assert.equal("planner" in two.characters.rp, false);
});

test("actions: the app's write paths", async () => {
  const db = memDb(), repo = makeRepo(db), act = makeActions(repo);
  let saved = 0;
  const id = act.createProfile({ name: "New" }, () => saved++);
  await settle();
  assert.equal(saved, 1);
  await act.updateProfile(id, { level: 600 });
  await act.setEntry(id, "rat", { rating: "A" });
  const sid = act.newSessionId(id);
  await act.saveSession(id, sid, { id: sid, hours: 1, kills: [] });
  await act.setCreatureSettings("rat", { name: "Rat", minLevel: { "Elite Knight": 8 } });
  await act.savePlannerState(id, { diff: "master" });
  act.setMark(id, "cobra-bastion", { state: "taken", at: "t" }, { counts: { "a|1": [0, 1] } });
  await settle();
  const all = await dump(db, ["profiles", "profiles/" + id + "/entries", "profiles/" + id + "/sessions", "creatures", "profiles/" + id + "/planner", "profiles/" + id + "/marks", "profiles/" + id + "/occupancy"]);
  assert.deepEqual(all["profiles/" + id], { name: "New", level: 600 });
  assert.deepEqual(all["profiles/" + id + "/sessions/" + sid], { hours: 1, kills: [] }, "the stored session has no id field");
  assert.equal(Object.keys(all).length, 7);
  await act.setEntry(id, "rat", null);
  await act.deleteSession(id, sid);
  act.deleteCharacter(id, [], []);
  await act.setCreatureSettings("rat", null);
  await settle(10);
  assert.deepEqual(await dump(db, ["profiles", "profiles/" + id + "/entries", "profiles/" + id + "/sessions", "creatures", "profiles/" + id + "/planner", "profiles/" + id + "/marks", "profiles/" + id + "/occupancy"]), {});
  assert.throws(() => act.restoreBackup({}), /bad/);
});
