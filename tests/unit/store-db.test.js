import test from "node:test";
import assert from "node:assert/strict";
import { localDb, claudeDb, LOCAL_KEY } from "../../src/store/db.js";
import { makePrefs, PREF } from "../../src/store/prefs.js";
import { memoryStorage } from "./helpers.js";

const flush = () => new Promise((r) => setImmediate(r));
const sync = { now: () => 1700000000000, schedule: (fn) => queueMicrotask(fn) };

test("localDb: set, update, delete and snapshots", async () => {
  const storage = memoryStorage();
  const db = localDb(storage, sync);
  const seen = [];
  const unsub = db.collection("profiles").limit(100).onSnapshot((snap) => seen.push(snap.docs.map((d) => [d.id, d.data()])));
  await flush();
  assert.deepEqual(seen, [[]]);
  await db.doc("profiles/a").set({ name: "A", weights: { xp: 10 } });
  await db.doc("profiles/a/entries/rat").set({ rating: "S" });
  await flush();
  assert.deepEqual(seen.at(-1), [["a", { name: "A", weights: { xp: 10 } }]], "only direct children");
  await db.doc("profiles/a").update({ weights: { profit: 3 } });
  assert.deepEqual((await db.collection("profiles").limit(10).get()).docs[0].data(), { name: "A", weights: { xp: 10, profit: 3 } }, "update merges nested objects");
  await assert.rejects(db.doc("profiles/none").update({ x: 1 }), { code: "not_found" });
  await db.doc("profiles/a").delete();
  await flush();
  assert.deepEqual(seen.at(-1), []);
  unsub();
  await db.doc("profiles/b").set({});
  await flush();
  assert.deepEqual(seen.at(-1), [], "no snapshots after unsubscribing");
  assert.ok(JSON.parse(storage.getItem(LOCAL_KEY))["profiles/a/entries/rat"]);
  // Data read back by a new adapter over the same storage.
  const again = localDb(storage, sync);
  assert.deepEqual((await again.collection("profiles/a/entries").limit(10).get()).docs.map((d) => d.id), ["rat"]);
  assert.equal(db.local, true);
  assert.match(db.collection("profiles").doc().id, /^[a-z0-9]+$/);
  assert.equal(db.collection("profiles").doc("x").path, "profiles/x");
});

test("localDb: a full storage rejects and keeps the old data", async () => {
  const db = localDb(memoryStorage({ [LOCAL_KEY]: JSON.stringify({ "creatures/rat": { name: "Rat" } }) }, true), sync);
  await assert.rejects(db.doc("creatures/bear").set({ name: "Bear" }), { code: "quota_exceeded" });
  assert.deepEqual((await db.collection("creatures").limit(10).get()).docs.map((d) => d.id), ["rat"]);
});

test("localDb: changes from another tab", async () => {
  let other;
  const db = localDb(memoryStorage(), Object.assign({ listen: (fn) => { other = fn; } }, sync));
  const seen = [];
  db.collection("creatures").limit(10).onSnapshot((s) => seen.push(s.docs.length));
  await flush();
  other(JSON.stringify({ "creatures/rat": {} }));
  await flush();
  assert.deepEqual(seen, [0, 1]);
  assert.equal(localDb(memoryStorage({ [LOCAL_KEY]: "not json" }), sync).local, true, "bad stored data starts empty");
});

test("claudeDb", async () => {
  const fake = { doc() {} };
  assert.equal(await claudeDb({ use: () => Promise.resolve(fake) }), fake);
  assert.equal(await claudeDb({ use: () => Promise.reject(new Error("no")) }), null);
  assert.equal(await claudeDb({ use: () => Promise.resolve(null) }), null);
  assert.equal(await claudeDb(undefined), null);
});

test("prefs never throw", () => {
  const p = makePrefs(memoryStorage());
  p.set(PREF.profile, "a");
  assert.equal(p.get(PREF.profile), "a");
  const broken = makePrefs({ getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); } });
  assert.equal(broken.get("x"), null);
  broken.set("x", "1");
  assert.equal(makePrefs(null).get("x"), null);
});
