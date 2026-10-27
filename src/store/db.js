// The db interface the app uses (a Firestore-like subset): db.doc(path) → {id, path, set, update, delete};
// db.collection(path) → {doc(id?), limit(n) → {onSnapshot(fn, onError) → unsubscribe, get() → Promise<{docs}>}}; each doc
// in a snapshot is {id, data()}. Write promises reject with {code} ("unavailable", "not_found", "quota_exceeded",
// "invalid_argument", "not_granted"). Two adapters: the Claude artifact's shared db, and localDb over browser storage.

// The Claude artifact db: host is window.claude. Resolves to the db, or null when the host has none.
export function claudeDb(host) {
  if (!host || typeof host.use !== "function") return Promise.resolve(null);
  return host.use("db").then((ns) => ns || null, () => null);
}

// The same API over one key of a Storage (localStorage in the page; tests pass a fake). opts.now() → ms, for new ids;
// opts.listen(fn) registers fn(newValue) for changes from other tabs (optional); opts.schedule(fn) runs fn after the
// current task (snapshots arrive asynchronously, as Firestore's do).
export const LOCAL_KEY = "btl.data.v1";
export function localDb(storage, opts) {
  const KEY = LOCAL_KEY, subs = [], now = opts.now, schedule = opts.schedule || ((fn) => setTimeout(fn, 0));
  let data = {};
  try { data = JSON.parse(storage.getItem(KEY) || "{}") || {}; } catch (e) { data = {}; }
  const clone = (v) => JSON.parse(JSON.stringify(v));
  const children = (col) => {
    const pre = col + "/", n = col.split("/").length + 1;
    return Object.keys(data).filter((p) => p.indexOf(pre) === 0 && p.split("/").length === n)
      .map((p) => { const v = data[p]; return { id: p.slice(pre.length), data: () => clone(v) }; });
  };
  const notify = () => { schedule(() => { subs.forEach((x) => { if (x.alive) x.fn({ docs: children(x.col) }); }); }); };
  const commit = (change) => new Promise((res, rej) => {
    const before = JSON.stringify(data);
    change();
    try { storage.setItem(KEY, JSON.stringify(data)); } catch (e) { data = JSON.parse(before); rej({ code: "quota_exceeded" }); return; }
    notify(); res();
  });
  const merge = (a, b) => {
    const o = Object.assign({}, a);
    Object.keys(b).forEach((k) => {
      const v = b[k];
      o[k] = (v && typeof v === "object" && !Array.isArray(v) && o[k] && typeof o[k] === "object" && !Array.isArray(o[k])) ? merge(o[k], v) : v;
    });
    return o;
  };
  const doc = (path) => ({ id: path.split("/").pop(), path,
    set: (d) => commit(() => { data[path] = clone(d); }),
    update: (d) => (data[path] ? commit(() => { data[path] = merge(data[path], clone(d)); }) : Promise.reject({ code: "not_found" })),
    delete: () => commit(() => { delete data[path]; }) });
  const collection = (col) => ({
    doc: (id) => doc(col + "/" + (id || (now().toString(36) + Math.random().toString(36).slice(2, 8)))),
    limit: () => ({
      onSnapshot: (fn) => { const x = { col, fn, alive: true }; subs.push(x); schedule(() => { if (x.alive) fn({ docs: children(col) }); }); return () => { x.alive = false; }; },
      get: () => Promise.resolve({ docs: children(col) }),
    }),
  });
  if (opts.listen) opts.listen((value) => { try { data = JSON.parse(value || "{}") || {}; } catch (x) { /* keep what we have */ } notify(); });
  return { doc, collection, local: true };
}
