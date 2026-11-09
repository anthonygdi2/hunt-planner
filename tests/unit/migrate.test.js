// Shared hunts: the migration that copies each character's hunts and spots into hunts/ and spots/ (store/migrate.js),
// merging a backup's hunts, backup version 3, and the actions that run them over a db.
import test from "node:test";
import assert from "node:assert/strict";
import { migrateHunts, mergeHunts, mergeHuntsMeta, huntKey, sameHunt } from "../../src/store/migrate.js";
import { readHunts } from "../../src/store/schema.js";
import { backupWrites, backupHuntsMeta, BACKUP_APP } from "../../src/store/backup.js";
import { makeRepo } from "../../src/store/repo.js";
import { makeActions } from "../../src/app/actions.js";
import { compute } from "../../src/app/compute.js";
import { makeCatalog } from "../../src/core/catalog.js";
import { memDb, settle, dump } from "./helpers.js";

const EK = "Elite Knight", RP = "Royal Paladin", AT = "2026-11-08T12:00:00.000Z";
const docsOf = (o) => Object.keys(o).sort().map((id) => ({ id, data: () => JSON.parse(JSON.stringify(o[id])) }));
const pad = (n) => String(n).padStart(2, "0");

// The maintainer's data: character A (now a level 50 Royal Paladin, hunts saved without a vocation logged as an Elite
// Knight) with 49 untagged hunts at levels 608-631 and one tagged Royal Paladin hunt at level 45; character B, a level
// 633 Elite Knight with no hunts yet.
function realData() {
  const sessions = {};
  for (let i = 0; i < 49; i++) {
    const level = 608 + Math.round(i * 23 / 48), day = "2026-10-" + pad(1 + (i % 28)), h = pad(10 + Math.floor(i / 28) * 4);
    sessions["s" + pad(i)] = { spot: i % 2 ? "Flimsies Venore -1 & -2" : "Cobra Bastion", hours: 1, rawXp: 4e6 + i * 1000, balance: 1e5,
      start: day + "T" + h + ":00:00", end: day + "T" + pad(Number(h) + 1) + ":00:00", level, kills: [{ slug: "cobra-assassin", name: "Cobra Assassin", count: 400 + i }] };
  }
  sessions.pal = { spot: "Rotworm Cave", hours: 1, rawXp: 2e4, level: 45, vocation: RP, start: "2026-11-02T10:00:00", end: "2026-11-02T11:00:00", kills: [{ slug: "rotworm", name: "Rotworm", count: 120 }] };
  return {
    profiles: { A: { name: "Main", vocation: RP, level: 50, untaggedVocation: EK, createdAt: "2026-09-01" }, B: { vocation: EK, level: 633, createdAt: "2026-11-01" } },
    sessions: { A: sessions, B: {} }, spots: { A: { "my-den": { name: "Den", parentId: null, createdAt: "t" } }, B: {} },
  };
}

test("migration: every character's hunts into the shared list, tagged with the vocation and level they were logged at", () => {
  const d = realData(), m = migrateHunts(Object.assign({ hunts: {}, sharedSpots: {}, meta: null, at: AT }, d));
  assert.equal(m.changed, true);
  assert.equal(Object.keys(m.hunts).length, 50);
  assert.deepEqual(Object.keys(m.spots), ["my-den"]);
  assert.deepEqual([m.hunts.s00.vocation, m.hunts.s00.level, m.hunts.s00.by], [EK, 608, { pid: "A", name: "Main" }], "untagged: the profile's untaggedVocation");
  assert.deepEqual([m.hunts.s48.level, m.hunts.pal.vocation, m.hunts.pal.level], [631, RP, 45]);
  assert.equal(m.meta.version, 1);
  assert.equal(Object.keys(m.meta.sessions).length, 50);
  assert.deepEqual(d.sessions.A.s00.vocation, undefined, "the old documents aren't touched");

  // Which count: B (a new knight) gets the 49 knight hunts, A (now a paladin) the paladin hunt.
  const catalog = makeCatalog([{ n: "Cobra Assassin", c: "H", m: 12 }, { n: "Rotworm", c: "E", m: 3 }]);
  const hunts = readHunts(docsOf(m.hunts));
  const run = (pid) => compute({ catalog, reference: [], pid, profile: d.profiles[pid], sessions: hunts, userSpots: m.spots, entries: {}, advanced: false, difficulty: "all" }, 0);
  const b = run("B"), a = run("A");
  assert.equal(b.hunts.use.length, 49);
  assert.ok(b.hunts.use.every((x) => x.vocation === EK && x.by.pid === "A"));
  assert.deepEqual(a.hunts.use.map((x) => x.id), ["pal"]);
  assert.ok(b.derived["cobra-assassin"] && !a.derived["cobra-assassin"]);
});

test("migration: profile fallbacks, and nothing copied twice", () => {
  const m = migrateHunts({ profiles: { a: { vocation: "Elder Druid", level: 300 } }, sessions: { a: { x: { spot: "S", hours: 1, kills: [] }, bad: { hours: 0 } } },
    spots: {}, hunts: {}, sharedSpots: {}, meta: null, at: AT });
  assert.deepEqual([m.hunts.x.vocation, m.hunts.x.level, m.hunts.x.by], ["Elder Druid", 300, { pid: "a", name: null }], "no untaggedVocation: the vocation, then the level");
  assert.deepEqual(m.meta.sessions, { "a:x": "x", "a:bad": null }, "what isn't a hunt is recorded as seen");
  // Run again over what it wrote: nothing to do.
  const again = migrateHunts({ profiles: { a: { vocation: "Elder Druid", level: 300 } }, sessions: { a: { x: { spot: "S", hours: 1, kills: [] } } }, spots: {},
    hunts: m.hunts, sharedSpots: {}, meta: m.meta, at: "later" });
  assert.deepEqual([again.changed, again.hunts, again.meta.at], [false, {}, AT]);
  // A hunt deleted after the migration doesn't come back.
  const gone = migrateHunts({ profiles: { a: {} }, sessions: { a: { x: { spot: "S", hours: 1, kills: [] } } }, spots: {}, hunts: {}, sharedSpots: {}, meta: m.meta, at: AT });
  assert.deepEqual(gone.hunts, {});
  // Without the record (it failed to save), the copies are found by id and content instead.
  const lost = migrateHunts({ profiles: { a: {} }, sessions: { a: { x: { spot: "S", hours: 1, kills: [] } } }, spots: {}, hunts: m.hunts, sharedSpots: {}, meta: null, at: AT });
  assert.deepEqual([lost.hunts, lost.meta.sessions], [{}, { "a:x": "x" }]);
});

test("migration: id collisions become {pid}-{id}, references follow; the same hunt or spot is copied once", () => {
  const hunt = (start, xp, extra) => Object.assign({ spot: "Den", hours: 1, rawXp: xp, start, end: start.replace("T10", "T11"), kills: [{ name: "Rat", count: 1 }] }, extra || {});
  const m = migrateHunts({
    profiles: { a: { vocation: EK, level: 600 }, "z.2": { vocation: RP, level: 300 } },
    sessions: {
      a: { s1: hunt("2026-10-01T10:00:00", 1, { spotId: "my-den" }), s2: hunt("2026-10-02T10:00:00", 2, { spotId: "my-lure" }) },
      "z.2": { s1: hunt("2026-10-05T10:00:00", 5, { spotId: "my-den" }), s2: hunt("2026-10-02T10:00:00", 2), s3: hunt("2026-10-09T10:00:00", 9, { spotId: "my-lure" }) },
    },
    spots: {
      a: { "my-den": { name: "Den" }, "my-lure": { name: "Lure", parentId: "my-den" } },
      "z.2": { "my-den": { name: "Other Den" }, "my-lure": { name: "lure ", parentId: "my-den" } },
    },
    hunts: {}, sharedSpots: {}, meta: null, at: AT });
  assert.deepEqual(Object.keys(m.spots).sort(), ["my-den", "my-lure", "z-2-my-den"], "a different spot under a taken id gets its own; the same name joins");
  assert.equal(m.spots["my-lure"].parentId, "my-den");
  assert.deepEqual(Object.keys(m.hunts).sort(), ["s1", "s2", "s3", "z.2-s1"], "z.2's s2 is a's s2 (same hunt): not copied again");
  assert.equal(m.hunts["z.2-s1"].spotId, "z-2-my-den", "the hunt follows its spot's new id");
  assert.equal(m.hunts.s3.spotId, "my-lure");
  assert.deepEqual([m.meta.sessions["z.2:s1"], m.meta.sessions["z.2:s2"], m.meta.spots["z.2:my-den"], m.meta.spots["z.2:my-lure"]], ["z.2-s1", "s2", "z-2-my-den", "my-lure"]);
  // A hunt already in the shared list under another id (saved there by a newer build) isn't copied either.
  const pre = migrateHunts({ profiles: { a: {} }, sessions: { a: { old: hunt("2026-10-01T10:00:00", 1) } }, spots: {}, hunts: { fresh: hunt("2026-10-01T10:00:00", 1) },
    sharedSpots: {}, meta: null, at: AT });
  assert.deepEqual([pre.hunts, pre.meta.sessions], [{}, { "a:old": "fresh" }]);
});

test("the same hunt: start, end and exp", () => {
  const x = { start: "2026-10-31T10:00:00", end: "2026-10-31T11:00:00", rawXp: 5e6, xp: 7e6 };
  assert.equal(huntKey(x), "2026-10-31T10:00:00|2026-10-31T11:00:00|5000000");
  assert.equal(huntKey({ start: "a" }), null);
  assert.equal(sameHunt(x, Object.assign({}, x, { spot: "Elsewhere" })), true);
  assert.equal(sameHunt(x, Object.assign({}, x, { rawXp: 1 })), false);
  assert.equal(sameHunt({ hours: 1, kills: [] }, { hours: 1, kills: [] }), true, "undated: length, exp and kills");
});

test("restoring merges hunts by id and never duplicates one", () => {
  const h = (d) => ({ hours: 1, kills: [], start: d + "T10:00:00", end: d + "T11:00:00", rawXp: 1 });
  const stored = { a: h("2026-10-01"), b: h("2026-10-02") };
  const out = mergeHunts(stored, { a: Object.assign(h("2026-10-01"), { level: 600 }), c: h("2026-10-03"), copyOfB: h("2026-10-02"), "bad id": h("2026-10-04"), d: { hours: 0 } });
  assert.deepEqual(Object.keys(out), ["a", "c"], "same id: the backup's copy; same hunt under another id: skipped");
  assert.equal(out.a.level, 600);
  assert.deepEqual(mergeHuntsMeta({ version: 1, at: "x", sessions: { "a:1": "1" } }, { version: 1, sessions: { "a:1": "other", "b:2": null } }, AT),
    { version: 1, at: "x", sessions: { "a:1": "1", "b:2": null }, spots: {} });
});

test("backup version 3: the shared hunts and spots, and the record that keeps the old copies from coming back", () => {
  const bk = { app: BACKUP_APP, version: 3, characters: { a: { profile: { vocation: EK }, sessions: { s1: { hours: 1, kills: [] } }, spots: { "my-den": { name: "Den" } } } },
    hunts: { s1: { hours: 1, kills: [] } }, spots: { "my-den": { name: "Den" }, "Bad": { name: "x" } } };
  assert.deepEqual(backupWrites(bk).map((w) => w[0]), ["profiles/a", "profiles/a/sessions/s1", "profiles/a/spots/my-den", "spots/my-den"]);
  assert.deepEqual(backupHuntsMeta(bk), { version: 1, sessions: { "a:s1": null }, spots: { "a:my-den": null } }, "a version 3 file without its record");
  assert.equal(backupHuntsMeta(Object.assign({}, bk, { version: 2 })), null);
  assert.deepEqual(backupWrites({ app: BACKUP_APP, version: 3, characters: {}, hunts: { s1: { hours: 1, kills: [] } } }), [], "only hunts: not empty");
});

test("actions: the migration over a db, then restores of version 2 and 3 files into it", async () => {
  const db = memDb(), repo = makeRepo(db), act = makeActions(repo), d = realData();
  for (const pid of Object.keys(d.profiles)) {
    await repo.set("profiles/" + pid, d.profiles[pid]);
    for (const id of Object.keys(d.sessions[pid])) await repo.set("profiles/" + pid + "/sessions/" + id, d.sessions[pid][id]);
    for (const id of Object.keys(d.spots[pid])) await repo.set("profiles/" + pid + "/spots/" + id, d.spots[pid][id]);
  }
  const first = await act.migrate(AT);
  assert.equal(await first.written, true);
  await settle();
  let all = await dump(db, ["hunts", "spots", "meta"]);
  assert.equal(Object.keys(all).filter((k) => k.startsWith("hunts/")).length, 50);
  assert.equal(all["meta/hunts"].version, 1);
  assert.equal(Object.keys(await dump(db, ["profiles/A/sessions"])).length, 50, "the old documents stay");
  const again = await act.migrate("later");
  assert.deepEqual([again.hunts, await again.written], [{}, true], "connecting again copies nothing");

  // Another device's backup, from before the shared hunts (version 2): the same 50 plus 3 newer hunts of A's.
  const v2 = { app: BACKUP_APP, version: 2, characters: { A: { profile: d.profiles.A, entries: {}, sessions: Object.assign({}, d.sessions.A) } }, creatures: {} };
  ["n1", "n2", "n3"].forEach((id, i) => { v2.characters.A.sessions[id] = { spot: "New", hours: 1, rawXp: i + 1, start: "2026-11-0" + (3 + i) + "T10:00:00", end: "2026-11-0" + (3 + i) + "T11:00:00", kills: [] }; });
  await act.restoreBackup(v2, AT);
  await settle();
  all = await dump(db, ["hunts"]);
  assert.equal(Object.keys(all).length, 53, "only the three new ones are added");
  assert.equal(all["hunts/n1"].vocation, EK, "migrated like the rest: A's untaggedVocation");

  // A version 3 backup from a store with 35 older hunts and one of its own: restoring merges, twice over, no duplicates.
  const older = {};
  Object.keys(all).slice(0, 35).forEach((k) => { older[k.slice(6)] = all[k]; });
  older.mine = { spot: "Elsewhere", hours: 2, rawXp: 9, start: "2026-09-01T10:00:00", end: "2026-09-01T12:00:00", kills: [], vocation: RP, level: 40, by: { pid: "A", name: "Main" } };
  older.dup = Object.assign({}, older.s00);
  const v3 = { app: BACKUP_APP, version: 3, characters: { A: { profile: d.profiles.A, sessions: { s00: d.sessions.A.s00 } } }, creatures: {}, hunts: older,
    huntsMeta: { version: 1, sessions: { "A:s00": "s00" }, spots: {} } };
  await act.restoreBackup(v3, AT);
  await act.restoreBackup(v3, AT);
  await settle();
  all = await dump(db, ["hunts"]);
  assert.equal(Object.keys(all).length, 54, "the 53 plus the one it alone had; its copy of s00 under another id is skipped");
  assert.ok(all["hunts/mine"] && !all["hunts/dup"]);
  assert.throws(() => act.restoreBackup({}, AT), /bad/);
});
