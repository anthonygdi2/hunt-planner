// Golden-output test: records what the app computes for a fixed fixture (tests/golden/fixture.json, a backup with two
// invented characters) and fails if a later change alters any of it. Run: npm install && node tests/golden.test.js
//   node tests/golden.test.js                    compare with tests/golden/expected/*.json
//   node tests/golden.test.js --update           rewrite them (npm run golden:update). Only when a change is meant to
//                                                alter the app's output, and never to make a failure go away.
//   --only=fixture | real | compute              limit the run (and --update) to one of them
// The fixture and real runs (tests/golden/capture.mjs) record, for each character, in basic and advanced mode: its
// facts, and for every difficulty and goal the creature numbers, the Task board model and the planner's chain and spot
// values, all from app/model.js with the clock frozen at NOW. fixture uses the small REFERENCE in
// tests/golden/reference-fixture.json; real a frozen copy of DATA, REFERENCE and PL_EXP in tests/golden/data/ (copied
// from src/data/ on October 26, 2026), so data updates don't touch this test. The compute run records app/compute.js
// directly. Numbers compare with a relative tolerance of 1e-9 (refactors may reorder arithmetic), everything else
// exactly. Until Phase F1 the runs scraped the old page; their expected files kept only the numbers when it went.
process.env.TZ = "UTC";
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const ROOT = path.join(__dirname, "..");
const GOLDEN = path.join(__dirname, "golden");
const NOW = Date.parse("2026-10-21T18:00:00Z"); // a Wednesday: weekly reset was Monday 08:00 UTC
const UPDATE = process.argv.includes("--update");
const REL_TOL = 1e-9, ABS_TOL = 1e-12;

const readJson = (file) => JSON.parse(fs.readFileSync(path.join(GOLDEN, file), "utf8"));
const frozen = { creatures: readJson("data/creatures.json"), reference: readJson("data/reference.json"), creatureExp: readJson("data/creature-exp.json") };
// The frozen data's identity, from its values (not its formatting), so a failure can say whether it changed.
function dataHash() {
  const values = [frozen.creatures, frozen.reference, frozen.creatureExp];
  return crypto.createHash("sha256").update(JSON.stringify(values)).digest("hex").slice(0, 16);
}
const DIFFS = ["all", "beginner", "adept", "expert", "master"];
const M_KEYS = ["hours", "rewardXph", "weeklyXph", "xp", "profit", "bestiaryCharm", "wardenCharm", "otherCharm", "charm", "bounty"];
const pick = (o, keys) => { if (!o) return o == null ? null : o; const r = {}; keys.forEach((k) => { if (o[k] !== undefined) r[k] = o[k]; }); return r; };
const calibOut = (c) => c && Object.assign(pick(c, ["kill", "exp", "offset", "nKill", "nExp", "nProfit", "hours"]),
  { spots: c.spots.map((s) => Object.assign({ spot: s.e.spot, entry: s.e.id }, pick(s, ["hours", "kill", "exp", "profit", "pph"]))) });

// ---------- normalizing and comparing ----------
// Numbers keep 12 significant digits (well inside the comparison tolerance); non-finite numbers become strings;
// object keys are sorted so the files have a stable order.
function normalize(v) {
  if (typeof v === "number") return !isFinite(v) ? String(v) : Number.isInteger(v) ? v : +v.toPrecision(12);
  if (v === null || typeof v !== "object") return v;
  if (Array.isArray(v)) return v.map((x) => (x === undefined || typeof x === "function" ? null : normalize(x)));
  const out = {};
  Object.keys(v).sort().forEach((k) => { if (v[k] !== undefined && typeof v[k] !== "function") out[k] = normalize(v[k]); });
  return out;
}
function close(a, b) { return a === b || Math.abs(a - b) <= Math.max(ABS_TOL, REL_TOL * Math.max(Math.abs(a), Math.abs(b))); }
function compare(exp, act, at, out) {
  if (typeof exp === "number" && typeof act === "number") { if (!close(exp, act)) out.push(at + ": expected " + exp + ", got " + act); return; }
  const kind = (x) => (x === null ? "null" : Array.isArray(x) ? "array" : typeof x);
  if (kind(exp) !== kind(act)) { out.push(at + ": expected " + show(exp) + ", got " + show(act)); return; }
  if (kind(exp) === "array") {
    if (exp.length !== act.length) out.push(at + ": expected " + exp.length + " items, got " + act.length);
    for (let i = 0; i < Math.min(exp.length, act.length); i++) compare(exp[i], act[i], at + "[" + i + "]", out);
  } else if (kind(exp) === "object") {
    new Set(Object.keys(exp).concat(Object.keys(act))).forEach((k) => {
      if (!(k in act)) out.push(at + "." + k + ": missing (expected " + show(exp[k]) + ")");
      else if (!(k in exp)) out.push(at + "." + k + ": unexpected " + show(act[k]));
      else compare(exp[k], act[k], at + "." + k, out);
    });
  } else if (exp !== act) out.push(at + ": expected " + show(exp) + ", got " + show(act));
}
function show(v) { const s = JSON.stringify(v); return s && s.length > 160 ? s.slice(0, 157) + "..." : s; }

// Stored as deltas to keep the files small: each goal as changes from the Exp goal (BASE_GOAL), each difficulty's
// spot values as changes from Master's, and advanced mode as changes from basic. A delta is an object of changed keys;
// {$set: v} replaces a value and {$del: 1} removes it. Comparison always runs on the decoded, full results.
const BASE_GOAL = "exp";
function same(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
function delta(base, x) {
  if (same(base, x)) return undefined;
  if (x === undefined) return { $del: 1 };
  if (!base || !x || typeof base !== "object" || typeof x !== "object" || Array.isArray(base) || Array.isArray(x)) return { $set: x };
  const d = {};
  new Set(Object.keys(base).concat(Object.keys(x))).forEach((k) => { const v = delta(base[k], x[k]); if (v !== undefined) d[k] = v; });
  return d;
}
function undelta(base, d) {
  if (d === undefined) return base;
  if (d.$del) return undefined;
  if ("$set" in d) return d.$set;
  const out = Object.assign({}, base);
  Object.keys(d).sort().forEach((k) => { const v = undelta(base ? base[k] : undefined, d[k]); if (v === undefined) delete out[k]; else out[k] = v; });
  return out;
}
function encode(run) {
  const pack = (mode) => {
    const m = JSON.parse(JSON.stringify(mode));
    Object.values(m.characters).forEach((c) => {
      Object.keys(c.diffs).forEach((k) => { if (k !== "master" && c.diffs[k].spotValues) c.diffs[k].spotValues = delta(c.diffs.master.spotValues, c.diffs[k].spotValues) || {}; });
      Object.values(c.diffs).forEach((dv) => {
        const g = dv.goals;
        Object.keys(g).forEach((k) => { if (k !== BASE_GOAL) g[k] = delta(g[BASE_GOAL], g[k]) || {}; });
      });
    });
    return m;
  };
  const basic = pack(run.basic);
  return { data: run.data, basic: basic, advanced: delta(basic, pack(run.advanced)) || {} };
}
function decode(file) {
  const unpack = (mode) => {
    const m = JSON.parse(JSON.stringify(mode));
    Object.values(m.characters).forEach((c) => {
      Object.values(c.diffs).forEach((dv) => {
        const g = dv.goals;
        Object.keys(g).forEach((k) => { if (k !== BASE_GOAL) g[k] = undelta(g[BASE_GOAL], g[k]); });
      });
      Object.keys(c.diffs).forEach((k) => { if (k !== "master" && c.diffs[k].spotValues) c.diffs[k].spotValues = undelta(c.diffs.master.spotValues, c.diffs[k].spotValues); });
    });
    return m;
  };
  return { data: file.data, basic: unpack(file.basic), advanced: unpack(undelta(file.basic, file.advanced)) };
}
// Pretty JSON (keys already sorted by normalize) where anything that fits in 200 characters stays on one line.
function stringify(v, ind) {
  ind = ind || "";
  if (v === null || typeof v !== "object") return JSON.stringify(v);
  const flat = JSON.stringify(v);
  if (flat.length + ind.length < 200) return flat;
  const inner = ind + " ";
  if (Array.isArray(v)) return v.length ? "[\n" + v.map((x) => inner + stringify(x, inner)).join(",\n") + "\n" + ind + "]" : "[]";
  const keys = Object.keys(v);
  return keys.length ? "{\n" + keys.map((k) => inner + JSON.stringify(k) + ": " + stringify(v[k], inner)).join(",\n") + "\n" + ind + "}" : "{}";
}


// ---------- the compute pipeline, directly ----------
// app/compute.js on the fixture's documents (read through the store readers, sessions and entries in path order as the
// page's db returns them) with the fixed REFERENCE, for each character, difficulty and advanced setting.
async function captureCompute() {
  const { compute } = await import("../src/app/compute.js");
  const { makeCatalog } = await import("../src/core/catalog.js");
  const S = await import("../src/store/schema.js");
  const bk = readJson("fixture.json"), catalog = makeCatalog(frozen.creatures), reference = readJson("reference-fixture.json");
  const docs = (o) => Object.keys(o || {}).sort().map((id) => ({ id, data: () => JSON.parse(JSON.stringify(o[id])) }));
  const ids = (list) => list.map((e) => e.id || e.spot);
  const out = { characters: {} };
  for (const id of Object.keys(bk.characters).sort()) {
    const c = bk.characters[id], ch = out.characters[id] = {};
    const base = { catalog, reference, profile: c.profile, sessions: S.readSessions(docs(c.sessions)), entries: S.readRecords(docs(c.entries)) };
    for (const advanced of [false, true]) for (const difficulty of DIFFS) {
      const d = compute(Object.assign({}, base, { advanced, difficulty }), NOW), derived = {}, shadow = {}, ms = {};
      Object.keys(d.derived).forEach((s) => {
        const x = d.derived[s];
        derived[s] = Object.assign(pick(x.best, ["spot", "src", "kph", "xph", "pph", "profitStale"]), { pinned: x.pinned, fromRef: x.fromRef, spots: x.spots.map((y) => y.spot) });
      });
      Object.keys(d.refShadow).forEach((s) => { shadow[s] = d.refShadow[s].map((y) => y.spot + " [" + y.unused + "]"); });
      Object.keys(d.metrics).forEach((s) => { const m = d.metrics[s]; if (d.scores[s] != null || ["xp", "profit", "charm", "bounty"].some((k) => m[k] != null)) ms[s] = pick(m, M_KEYS); });
      const otherIds = {};
      Object.keys(d.picks.other).sort().forEach((v) => { otherIds[v] = ids(d.picks.other[v].list); });
      ch[(advanced ? "advanced " : "basic ") + difficulty] = {
        raidP: d.raidP, raidInfo: d.raidInfo, xpBoost: d.xpBoost, calib: calibOut(d.calib), calibOther: Object.keys(d.calibOther).sort().map((v) => [v, calibOut(d.calibOther[v])]),
        picks: ids(d.picks.list), picksOther: otherIds, spotKph: d.spotKph, spotEco: d.spotEco, refSpotSrc: d.refSpotSrc,
        refActive: d.refActive.map((a) => [a.e.id, a.tier, a.active, a.n.src]), weeklyNow: d.weeklyNow, derived, refShadow: shadow, metrics: ms, scores: d.scores, tiers: d.tiers };
    }
  }
  return normalize(out);
}

// ---------- the fixture and real runs ----------
const RUNS = {
  fixture: { data: "tests/golden/reference-fixture.json", input: () => Object.assign({}, frozen, { reference: readJson("reference-fixture.json") }) },
  real: { data: () => dataHash(), input: () => frozen },
};
// Fields the page-scraping capture recorded that were UI text; expected files from before F1 may still have them.
function stripText(run) {
  const r = JSON.parse(JSON.stringify(run));
  delete r.errors;
  Object.values(r.characters).forEach((c) => {
    delete c.text;
    Object.values(c.diffs).forEach((dv) => Object.values(dv.goals).forEach((g) => { if (g.board) { delete g.board.text; delete g.board.slots; } }));
  });
  return r;
}

(async () => {
  const only = (process.argv.find((a) => a.startsWith("--only=")) || "").slice(7);
  const t0 = Date.now(), { capture } = await import("./golden/capture.mjs"), fixture = readJson("fixture.json");
  let failed = false;
  for (const name of Object.keys(RUNS).filter((n) => !only || n === only)) {
    const run = RUNS[name], input = run.input();
    const actual = { data: typeof run.data === "function" ? run.data() : run.data,
      basic: normalize(capture(input, fixture, false, NOW)), advanced: normalize(capture(input, fixture, true, NOW)) };
    const file = path.join(GOLDEN, "expected", name + ".json");
    if (UPDATE) {
      fs.writeFileSync(file, stringify(encode(actual)) + "\n");
      const back = [];
      compare(decode(JSON.parse(fs.readFileSync(file, "utf8"))), actual, name, back);
      if (back.length) throw new Error("the encoded file doesn't decode to the captured output: " + back.slice(0, 3).join("; "));
      console.log("Wrote " + path.relative(ROOT, file) + " (" + Math.round(fs.statSync(file).size / 1024) + " KB, " + (Date.now() - t0) + " ms)");
      continue;
    }
    if (!fs.existsSync(file)) { console.log("FAIL golden " + name + ": " + path.relative(ROOT, file) + " is missing (npm run golden:update)"); failed = true; continue; }
    const exp = decode(JSON.parse(fs.readFileSync(file, "utf8"))), expected = { data: exp.data, basic: stripText(exp.basic), advanced: stripText(exp.advanced) };
    const diffs = [];
    compare(expected, actual, name, diffs);
    if (!diffs.length) { console.log("PASS golden " + name + " (" + (Date.now() - t0) + " ms)"); continue; }
    failed = true;
    console.log("FAIL golden " + name + ": " + diffs.length + " difference" + (diffs.length === 1 ? "" : "s") + (expected.data !== actual.data ?
      " (the frozen data in tests/golden/data/ changed since the expected output was recorded: " + expected.data + " then, " + actual.data + " now)" : ""));
    diffs.slice(0, 8).forEach((x) => console.log("  " + x));
  }
  if (!only || only === "compute") {
    const actual = { data: "tests/golden/reference-fixture.json", compute: await captureCompute() }, file = path.join(GOLDEN, "expected", "compute.json");
    if (UPDATE) { fs.writeFileSync(file, stringify(actual) + "\n"); console.log("Wrote " + path.relative(ROOT, file) + " (" + Math.round(fs.statSync(file).size / 1024) + " KB)"); }
    else if (!fs.existsSync(file)) { console.log("FAIL golden compute: " + path.relative(ROOT, file) + " is missing"); failed = true; }
    else {
      const diffs = [];
      compare(JSON.parse(fs.readFileSync(file, "utf8")), actual, "compute", diffs);
      if (!diffs.length) console.log("PASS golden compute (" + (Date.now() - t0) + " ms)");
      else { failed = true; console.log("FAIL golden compute: " + diffs.length + " difference" + (diffs.length === 1 ? "" : "s")); diffs.slice(0, 8).forEach((x) => console.log("  " + x)); }
    }
  }
  console.log(failed ? "Golden output changed. Don't regenerate it to make this pass; find what changed it." : UPDATE ? "Expected output written" : "All golden checks passed");
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e && e.stack || e); process.exit(1); });
