#!/usr/bin/env node
// Turns tools/reference/readings.json (one record per video reading) into src/data/reference.json, which
// tools/assemble.js inlines as REFERENCE.
//   node tools/reference/generate.js          rewrite src/data/reference.json
//   node tools/reference/generate.js --check  exit 1 if it doesn't match the readings
//   node tools/reference/generate.js --exp    rewrite src/data/creature-exp.json (the planner's PL_EXP) from wiki-exp.json
// Rules (see docs/REFERENCE_DB_PLAN.md): session length = XP gain / XP per hour (raw if read, else boosted; the
// analyser's "0:15h" is rounded down, so it's only a sanity check); kills/h = kills / length; profit/h = balance / length;
// creatures with fewer than MIN_KILLS kills are left out; every creature must exist in DATA; postRebalance is true for
// videos published on or after REBALANCE.
"use strict";
const fs = require("fs");
const path = require("path");

const { readData, formatList, formatMap, DATA_DIR } = require("../assemble.js");

const OUT = path.join(DATA_DIR, "reference.json");
const EXP_OUT = path.join(DATA_DIR, "creature-exp.json");
const READINGS = path.join(__dirname, "readings.json");
const WIKI_EXP = path.join(__dirname, "wiki-exp.json");
const MIN_KILLS = 5;
const REBALANCE = "2026-06-18"; // first post-rebalance guide; the vocation rebalance went live mid-June 2026
const slugify = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

function dataSlugs() { return new Set(readData("creatures.json").map((d) => slugify(d.n))); }

// Derives one REFERENCE entry from a reading. Returns {entry, errors, warnings}.
function derive(r, known) {
  const errors = [], warnings = [], a = r.analyser || {};
  const where = r.id || r.video;
  const gain = a.rawXpGain != null && a.rawXph ? [a.rawXpGain, a.rawXph] : [a.xpGain, a.xph];
  if (gain[0] == null || !gain[1]) errors.push(where + ": needs rawXpGain and rawXph (or xpGain and xph)");
  if (!a.rawXph) errors.push(where + ": rawXph is required");
  if (a.balance == null) errors.push(where + ": balance is required");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(r.published || "")) errors.push(where + ": published must be YYYY-MM-DD");
  if (errors.length) return { errors, warnings };
  const hours = gain[0] / gain[1];
  const sm = /^(\d+):(\d{2})h?$/.exec(a.session || "");
  if (sm && Math.abs(hours * 60 - (+sm[1] * 60 + +sm[2])) > 1.5) warnings.push(where + ": session " + a.session + " but XP gives " + (hours * 60).toFixed(1) + " min");
  const names = r.names || {};
  const kills = Object.keys(r.kills || {}).map((n) => ({ name: n, count: r.kills[n], slug: names[n] || slugify(n) }));
  kills.forEach((k) => {
    if (known.has(k.slug)) return;
    (k.count >= MIN_KILLS ? errors : warnings).push(where + ": \"" + k.name + "\" (" + k.slug + ") isn't in DATA");
  });
  const creatures = kills.filter((k) => k.count >= MIN_KILLS)
    .map((k) => ({ slug: k.slug, kph: Math.round(k.count / hours), how: r.how || "kills" }))
    .sort((x, y) => y.kph - x.kph);
  const url = "https://www.youtube.com/watch?v=" + r.video + (r.t ? "&t=" + r.t + "s" : "");
  const entry = { id: r.id, spot: r.spot };
  if (r.aliases && r.aliases.length) entry.aliases = r.aliases;
  Object.assign(entry, { vocation: r.vocation, levelMin: r.levelMin });
  if (r.levelMax) entry.levelMax = r.levelMax;
  Object.assign(entry, { team: r.team || "solo", hours: +hours.toFixed(4), rawXph: a.rawXph });
  if (a.xph) entry.xph = a.xph;
  entry.profitph = Math.round(a.balance / hours);
  entry.creatures = creatures;
  entry.source = { who: r.who || "Kusnier", url, date: r.published, postRebalance: r.published >= REBALANCE };
  if (r.profitStale) entry.profitStale = true;
  if (r.access) entry.access = r.access;
  if (r.notes) entry.notes = r.notes;
  ["id", "spot", "vocation", "levelMin"].forEach((f) => { if (entry[f] == null || entry[f] === "") errors.push(where + ": " + f + " is required"); });

  return { entry, errors, warnings };
}

// The entries for every reading, in order, and src/data/reference.json's text.
function build(readings, known) {
  known = known || dataSlugs();
  const errors = [], warnings = [], entries = [], ids = {};
  readings.forEach((r) => {
    const d = derive(r, known);
    errors.push.apply(errors, d.errors);
    warnings.push.apply(warnings, d.warnings);
    if (d.errors.length) return;
    if (ids[d.entry.id]) errors.push(d.entry.id + ": duplicate id");
    ids[d.entry.id] = 1;
    entries.push(d.entry);
  });
  return { entries, text: formatList(entries), errors, warnings };
}

// The planner's TibiaWiki exp table: wiki-exp.json's values for the creatures in DATA, sorted by slug.
function expTable() {
  const wiki = JSON.parse(fs.readFileSync(WIKI_EXP, "utf8")).exp, known = dataSlugs(), out = {};
  Object.keys(wiki).sort().forEach((k) => { if (known.has(k)) out[k] = wiki[k]; });
  return formatMap(out);
}

// Writes text with the line endings the file already has (git autocrlf on Windows); compares ignoring them.
const lf = (t) => t.replace(/\r\n/g, "\n");
function writeKeeping(file, text) {
  const old = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
  if (lf(old) === text) return false;
  fs.writeFileSync(file, /\r\n/.test(old) ? text.replace(/\n/g, "\r\n") : text);
  return true;
}

if (require.main === module) {
  if (process.argv.includes("--exp")) {
    console.log(writeKeeping(EXP_OUT, expTable()) ? "Wrote src/data/creature-exp.json from tools/reference/wiki-exp.json" : "src/data/creature-exp.json already up to date");
    process.exit(0);
  }
  const readings = JSON.parse(fs.readFileSync(READINGS, "utf8")), res = build(readings);
  res.warnings.forEach((w) => console.warn("warning: " + w));
  if (res.errors.length) { res.errors.forEach((e) => console.error("error: " + e)); process.exit(1); }
  if (process.argv.includes("--check")) {
    if (lf(fs.readFileSync(OUT, "utf8")) !== res.text) { console.error("src/data/reference.json doesn't match tools/reference/readings.json; run node tools/reference/generate.js"); process.exit(1); }
    console.log("src/data/reference.json matches readings.json");
  } else console.log(writeKeeping(OUT, res.text) ? "Wrote " + res.entries.length + " entries (" + readings.length + " readings) to src/data/reference.json" : "src/data/reference.json already up to date");
}

module.exports = { build, derive, slugify, expTable, writeKeeping, MIN_KILLS, REBALANCE, OUT };
