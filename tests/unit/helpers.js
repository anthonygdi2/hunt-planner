// Shared test helpers (not a test file).
import { localDb } from "../../src/store/db.js";

// A Storage stand-in: getItem/setItem over a Map, optionally full.
export function memoryStorage(init, full) {
  const m = new Map(Object.entries(init || {}));
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { if (full) throw new Error("QuotaExceededError"); m.set(k, String(v)); },
    raw: m,
  };
}

// An in-memory db with the app's API (localDb over memoryStorage), snapshots delivered as microtasks.
export function memDb() {
  let n = 0;
  return localDb(memoryStorage(), { now: () => 1700000000000 + n++, schedule: (fn) => queueMicrotask(fn) });
}

// Lets queued writes, retries scheduled with setTimeout(0) and snapshots run.
export const flush = () => new Promise((r) => setTimeout(r, 0));
export async function settle(times) { for (let i = 0; i < (times || 5); i++) await flush(); }

// Everything a db holds: path → document.
export async function dump(db, cols) {
  const out = {};
  for (const c of cols) (await db.collection(c).limit(1000).get()).docs.forEach((d) => { out[c + "/" + d.id] = d.data(); });
  return out;
}
