// Reads and writes over a db (db.js). Writes to one path run one after another, so a later write never lands before an
// earlier one; a write that fails as "unavailable" is retried once after a short pause. A write the db refuses
// ("invalid_argument", "not_granted") calls onDenied, so the app can stop offering edits.

export function makeRepo(db, opts) {
  opts = opts || {};
  const chain = {}, retryDelay = opts.retryDelay || (() => 400 + Math.random() * 800);
  // Runs op(docRef) → Promise after any earlier write to the same path. onFail(code) on failure. Returns a promise that
  // settles when this write is done (it never rejects).
  function write(path, op, onFail) {
    const ref = db.doc(path), run = () => op(ref);
    const attempt = () => run().catch((e) => {
      if (e && e.code === "unavailable") return new Promise((res) => setTimeout(res, retryDelay())).then(run);
      throw e;
    });
    chain[path] = (chain[path] || Promise.resolve()).then(attempt).catch((e) => {
      const code = e && e.code;
      if ((code === "invalid_argument" || code === "not_granted") && opts.onDenied) opts.onDenied(code);
      if (onFail) onFail(code);
    });
    return chain[path];
  }
  return {
    write,
    set: (path, body, onFail) => write(path, (ref) => ref.set(body), onFail),
    update: (path, patch, onFail) => write(path, (ref) => ref.update(patch), onFail),
    remove: (path, onFail) => write(path, (ref) => ref.delete(), onFail),
    // A fresh document id in a collection.
    newId: (col) => db.collection(col).doc().id,
    // Subscribes to a collection's documents (up to limit): onDocs([{id, data()}]); returns the unsubscribe function.
    watch: (col, limit, onDocs, onError) => db.collection(col).limit(limit).onSnapshot((snap) => onDocs(snap.docs), onError || (() => {})),
    // The collection's documents once.
    get: (col, limit) => db.collection(col).limit(limit).get().then((snap) => snap.docs),
    // A write outside the queue that rejects on failure (restoring a backup, which reports its own progress).
    setDirect: (path, body) => db.doc(path).set(body),
    local: !!db.local,
  };
}
