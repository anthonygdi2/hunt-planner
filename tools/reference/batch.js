#!/usr/bin/env node
// Batch helper for reading Kusnier's videos into REFERENCE (src/data/reference.json), ten at a time (the workflow is in
// .claude/skills/reference-batch/SKILL.md).
//   node tools/reference/batch.js next [n] [--skeleton <staged.json>]
//       the next n (default 10) todo rows of the Queue and any check rows; --skeleton writes a staging file with
//       everything the title and the watch page give (id, spot, vocation, level, published date) and blanks to fill
//   node tools/reference/batch.js check <staged.json> [--accept id,id]
//       derives each staged reading, checks kills x TibiaWiki exp against Raw XP Gain, prints the review table and
//       lists issues (with the TibiaWiki exp history of the creatures in any reading whose XP check fails); exits 1
//       if any issue isn't accepted
//   node tools/reference/batch.js history <staged.json | reading id | "creature, creature">
//       the exp lines of each creature's TibiaWiki "history" field (dated balance changes), and the kills x exp gap
//       with the exp each creature had when the video was published
//   node tools/reference/batch.js recheck
//       readings.json entries more than 1% off whose gap those dated changes narrow
//   node tools/reference/batch.js embed <staged.json> [--accept id,id] [--date YYYY-MM-DD]
//       checks again (refuses on unaccepted issues), finishes remark and notes, appends the readings to readings.json,
//       regenerates src/data/reference.json, marks the Queue rows done, updates the status lines, and prints the batch report:
//       videos processed, net new monsters, monsters with a new spot or vocation, and videos left
// Staged readings are readings.json records, plus an optional "slide" object that embed turns into the usual text:
//   slide: { start: "600+", raw: "9.0kk/h", loot: "800k/h", bountyPreys: false, charms: true, animus: false }
//   -> remark "Slide: charms used; no preys, bounty or animus. <remark> <XP check>."
//   -> notes "<notes> His slide: 9.0kk/h raw, 800k/h. Charms on. <notesTail>" (start only when it differs from levelMin)
// TibiaWiki exp values are cached in wiki-exp.json (tibia.fandom.com api.php, "| exp =" in the creature's infobox).
"use strict";
const fs = require("fs");
const path = require("path");
const gen = require("./generate.js");
const { readData } = require("../assemble.js");

const ROOT = path.join(__dirname, "..", "..");
const READINGS = path.join(__dirname, "readings.json");
const EXP_CACHE = path.join(__dirname, "wiki-exp.json");
const VIDEOS = path.join(ROOT, "docs", "REFERENCE_VIDEOS.md");
const PLAN = path.join(ROOT, "docs", "REFERENCE_DB_PLAN.md");
const XP_SHORT = 0.05; // kills x exp more than 5% under raw XP: rows are probably hidden, or a count is misread
const XP_OVER = 0.01;  // more than 1% over: a count or a creature is probably misread
const VOCATIONS = { Knight: "Elite Knight", Paladin: "Royal Paladin", Sorcerer: "Master Sorcerer", Druid: "Elder Druid", Monk: "Exalted Monk", All: "any" };
const SHORT = { "Elite Knight": "ek", "Royal Paladin": "rp", "Master Sorcerer": "ms", "Elder Druid": "ed", "Exalted Monk": "em", any: "any" };
const HEADERS = { "accept-language": "en-US,en;q=0.9", "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36" };

const num = (n) => Math.round(n).toLocaleString("en-US");
const read = (p) => fs.readFileSync(p, "utf8");
// Writes text with the line endings the file already has (git autocrlf on Windows).
const write = (p, text, like) => fs.writeFileSync(p, /\r\n/.test(like) ? text.replace(/\r?\n/g, "\r\n") : text);
const localDate = () => { const d = new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); };
const arg = (name) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : null; };
const joinList = (xs, last) => xs.length < 2 ? xs.join("") : xs.slice(0, -1).join(", ") + " " + last + " " + xs[xs.length - 1];

function dataList() { return readData("creatures.json"); }

// ---- Queue (docs/REFERENCE_VIDEOS.md) ----

const cells = (line) => line.split("|").slice(1, -1).map((c) => c.trim());
function queueRows(doc) {
  const lines = doc.split(/\r?\n/);
  const q = lines.findIndex((l) => l.trim() === "## Queue"), m = lines.findIndex((l) => l.trim() === "## Maybe");
  const rows = [];
  lines.forEach((l, i) => {
    if (i <= q || i >= m || !/^\| \d+ \|/.test(l)) return;
    const c = cells(l);
    rows.push({ line: i, n: +c[0], status: c[1], id: (c[2].match(/\[([\w-]{11})\]/) || [])[1], age: c[3], era: c[4], vocation: c[5], level: c[6], title: c[7] });
  });
  return { lines, rows };
}

// "Flimsy Venore -1 (Advanced) · 300+ Paladin" -> spot, aliases, level, vocation and a notes prefix.
function fromTitle(row) {
  const parts = row.title.split(" · ");
  const lvl = parts.findIndex((p) => /^\d+\+/.test(p));
  const tags = parts.slice(1).filter((p, i) => i + 1 !== lvl);
  let spot = parts[0].trim();
  const aliases = [], notes = [];
  const adv = / \(Advanced\)$/i;
  if (adv.test(spot)) { aliases.push(spot); spot = spot.replace(adv, ""); notes.push("Advanced guide."); }
  if (tags.some((t) => /profit/i.test(t)) || / \(Profit\)$/i.test(spot)) notes.push("Profit guide.");
  return { spot, aliases, levelMin: parseInt(row.level, 10) || null, vocation: VOCATIONS[row.vocation] || null, notes: notes.join(" ") };
}

async function publishDate(id) {
  try {
    const page = await (await fetch("https://www.youtube.com/watch?v=" + id, { headers: HEADERS })).text();
    return ((page.match(/"publishDate":"(\d{4}-\d{2}-\d{2})/) || [])[1]) || null;
  } catch (e) { return null; }
}

async function cmdNext() {
  const n = parseInt(process.argv[3], 10) || 10;
  const { rows } = queueRows(read(VIDEOS));
  const todo = rows.filter((r) => r.status === "todo"), check = rows.filter((r) => r.status === "check");
  if (check.length) {
    console.log("Rows marked check (sort them by hand first: todo, or delete and add to a skipped count):");
    check.forEach((r) => console.log("  #" + r.n + " " + r.id + " " + r.title));
  }
  const next = todo.slice(0, n);
  console.log("Next " + next.length + " of " + todo.length + " todo:");
  next.forEach((r) => console.log("  #" + r.n + " " + r.id + " [" + r.era + "] " + r.title + (VOCATIONS[r.vocation] ? "" : "  (vocation \"" + r.vocation + "\" needs a decision)")));
  const out = arg("--skeleton");
  if (!out) return;
  if (fs.existsSync(out)) throw new Error(out + " already exists; finish or delete that batch first");
  const staged = [];
  for (const r of next) {
    const t = fromTitle(r), published = await publishDate(r.id);
    const rec = { id: t.vocation && published ? gen.slugify(t.spot.replace(/'/g, "")) + "-" + SHORT[t.vocation] + "-" + published.slice(0, 7) : null,
      video: r.id, t: 12, published, spot: t.spot };
    if (t.aliases.length) rec.aliases = t.aliases;
    Object.assign(rec, { vocation: t.vocation, levelMin: t.levelMin, team: "solo", charLevel: null,
      analyser: { session: null, rawXpGain: null, rawXph: null, xpGain: null, xph: null, loot: null, supplies: null, balance: null },
      kills: {}, slide: { start: null, raw: null, loot: null, bountyPreys: null, charms: null, animus: null }, remark: "", notes: t.notes });
    staged.push(rec);
  }
  fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(staged, null, 2) + "\n");
  console.log("Wrote " + staged.length + " skeleton readings to " + out);
}

// ---- TibiaWiki exp ----

function loadExp() { return fs.existsSync(EXP_CACHE) ? JSON.parse(read(EXP_CACHE)) : { note: "", exp: {} }; }
async function wikiExp(slugs, data) {
  const cache = loadExp(), missing = slugs.filter((s) => cache.exp[s] == null);
  for (const s of missing) {
    const d = data.find((x) => gen.slugify(x.n) === s);
    if (!d) continue;
    const url = "https://tibia.fandom.com/api.php?action=query&prop=revisions&rvprop=content&rvslots=main&format=json&redirects=1&titles=" + encodeURIComponent(d.w || d.n);
    try {
      const page = Object.values((await (await fetch(url)).json()).query.pages)[0];
      const text = page.revisions ? page.revisions[0].slots.main["*"] : "";
      const m = text.match(/\|\s*exp\s*=\s*([\d,]+)/);
      if (m) cache.exp[s] = +m[1].replace(/,/g, "");
    } catch (e) { /* reported as missing below */ }
  }
  if (missing.length) {
    cache.note = "TibiaWiki base exp per creature (tibia.fandom.com, \"| exp =\" in the infobox), cached by tools/reference/batch.js. Last fetched " + localDate() + ".";
    const keys = Object.keys(cache.exp).sort(), sorted = {};
    keys.forEach((k) => { sorted[k] = cache.exp[k]; });
    cache.exp = sorted;
    fs.writeFileSync(EXP_CACHE, JSON.stringify(cache, null, 2) + "\n");
  }
  return cache.exp;
}

// The "| history =" field of each creature's infobox, as plain text lines (not cached: it's only read when an XP
// check fails). TibiaWiki notes balance changes there with the news date, e.g. "On November 14, 2023, its exp was
// reduced by 7%." A change after a guide was published explains a gap without rescanning the video.
async function wikiHistory(names, data) {
  const out = {};
  for (const name of names) {
    const d = data.find((x) => gen.slugify(x.n) === gen.slugify(name));
    const url = "https://tibia.fandom.com/api.php?action=query&prop=revisions&rvprop=content&rvslots=main&format=json&redirects=1&titles=" + encodeURIComponent(d ? d.w || d.n : name);
    try {
      const page = Object.values((await (await fetch(url)).json()).query.pages)[0];
      const text = page.revisions ? page.revisions[0].slots.main["*"] : "";
      const m = text.match(/\n\|\s*history\s*=([\s\S]*?)(?=\n\|\s*\w+\s*=|\n\}\})/);
      out[name] = !m ? [] : m[1].split(/\n/).map((l) => l.replace(/\{\{OfficialNewsArchive\|\d+\|([^}]*)\}\}/g, "$1").replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, "$1")
        .replace(/'''?/g, "").replace(/^\s*\*\s*/, "").trim()).filter(Boolean);
    } catch (e) { out[name] = ["(couldn't fetch the TibiaWiki page)"]; }
  }
  return out;
}

const isExpLine = (l) => /\bexp|experience|\bxp\b/i.test(l);
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
// A dated exp change in a history line, as { date, before, approx } where before is the exp just before it (approx
// when worked back from a percentage), or null:
// "On November 14, 2023, its exp was reduced by 7%." or "...on May 14, 2024, ... increased experience from 2,500 to 2,770".
function expChange(line, now) {
  const d = line.match(new RegExp("(" + MONTHS.join("|") + ") (\\d{1,2}), (\\d{4})"));
  if (!d || !isExpLine(line)) return null;
  const date = new Date(+d[3], MONTHS.indexOf(d[1]), +d[2]);
  const pct = line.match(/(?:exp(?:erience)?|xp) (?:was|were) (reduced|decreased|increased|raised) by (\d+(?:\.\d+)?)%/i);
  if (pct) return { date, approx: true, before: Math.round(/reduc|decreas/i.test(pct[1]) ? now / (1 - pct[2] / 100) : now / (1 + pct[2] / 100)) };
  const ft = line.match(/from ([\d,]+) (?:to|->|→) ([\d,]+)/);
  if (ft && +ft[2].replace(/,/g, "") === now) return { date, before: +ft[1].replace(/,/g, "") };
  return null;
}

// Kills x exp with each creature at its exp before the earliest dated change after the reading's publish date, and
// the changes that apply ({ name, before, now, date, approx }); null when no dated change applies.
function expAtPublish(r, exp, hist) {
  const pub = new Date(r.published), changed = [], changes = [];
  let total = 0;
  Object.keys(r.kills).forEach((k) => {
    // Walk back from today's exp through each dated change after the publish date, newest first, so chained changes
    // (3,120 → 3,400 in March, → 3,800 in April) give the exp before the first of them.
    const now = exp[gen.slugify(k)], dated = [];
    const lines = (hist[k] || []).filter((l) => expChange(l, 1) || /from [\d,]+ (?:to|->|→) [\d,]+/.test(l));
    let cur = now, c = null;
    for (let guard = 0; guard < 10; guard++) {
      const next = lines.map((l) => expChange(l, cur)).filter((x) => x && x.date > pub && !dated.some((d) => +d.date === +x.date))
        .sort((a, b) => b.date - a.date)[0];
      if (!next) break;
      dated.push(next);
      cur = next.before;
    }
    if (dated.length) c = { before: cur, date: dated[dated.length - 1].date, approx: dated.some((d) => d.approx), steps: dated.length };
    total += r.kills[k] * (c ? c.before : now);
    if (c) { changed.push(k + " " + num(c.before) + " → " + num(now)); changes.push(Object.assign({ name: k, now }, c)); }
  });
  return changed.length ? { diff: total - r.analyser.rawXpGain, changed, changes } : null;
}

// Prints the exp-related history lines for the creatures in the given readings, and for each reading the kills x exp
// gap with the exp each creature had when the video was published.
async function printHistory(readings, data) {
  const names = [...new Set([].concat(...readings.map((r) => Object.keys(r.kills || {}))))].sort();
  const hist = await wikiHistory(names, data), exp = loadExp().exp;
  const lines = [];
  names.forEach((n) => (hist[n] || []).filter(isExpLine).forEach((l) => lines.push("- " + n + ": " + l)));
  console.log("\nTibiaWiki exp history for " + names.join(", ") + ":");
  console.log(lines.length ? lines.join("\n") : "- none noted");
  readings.filter((r) => r.published && r.analyser && r.analyser.rawXpGain).forEach((r) => {
    const at = expAtPublish(r, exp, hist);
    if (at) console.log("- " + (r.id || r.video) + ": with the exp at " + r.published + " (" + at.changed.join(", ") + ") kills x exp " + xpSentence(at.diff, r.analyser.rawXpGain).replace(/^Kills x TibiaWiki exp (= )?/, "").replace(/^raw/, "equals raw"));
  });
}

// node tools/reference/batch.js recheck: readings.json entries more than 1% off whose gap a dated TibiaWiki exp change
// after the publish date narrows, with the gap before and after.
async function cmdRecheck() {
  const data = dataList(), exp = loadExp().exp, readings = JSON.parse(read(READINGS));
  const off = readings.filter((r) => r.kills && r.analyser && r.analyser.rawXpGain && Object.keys(r.kills).every((k) => exp[gen.slugify(k)] != null))
    .map((r) => ({ r, diff: Object.keys(r.kills).reduce((s, k) => s + r.kills[k] * exp[gen.slugify(k)], 0) - r.analyser.rawXpGain }))
    .filter((x) => Math.abs(x.diff) > 0.01 * x.r.analyser.rawXpGain);
  const hist = await wikiHistory([...new Set([].concat(...off.map((x) => Object.keys(x.r.kills))))], data);
  const pct = (d, raw) => (d > 0 ? "+" : "−") + (100 * Math.abs(d) / raw).toFixed(1) + "%";
  const rows = off.map((x) => Object.assign(x, { at: expAtPublish(x.r, exp, hist) })).filter((x) => x.at && Math.abs(x.at.diff) < Math.abs(x.diff));
  console.log("| Reading | Published | Now | At publish | Changed (exp then → now) |\n|---|---|---|---|---|");
  rows.forEach((x) => console.log("| " + [x.r.id, x.r.published, pct(x.diff, x.r.analyser.rawXpGain), pct(x.at.diff, x.r.analyser.rawXpGain), x.at.changed.join(", ")].join(" | ") + " |"));
  console.log("\n" + rows.length + " of " + off.length + " readings more than 1% off are narrowed by dated TibiaWiki exp changes.");
}

// ---- Check ----

function xpSentence(diff, raw) {
  if (diff === 0) return "Kills x TibiaWiki exp = raw XP.";
  const pct = Math.abs(diff) / raw >= 0.01 ? " (" + (100 * Math.abs(diff) / raw).toFixed(1) + "%)" : "";
  return "Kills x TibiaWiki exp is " + num(Math.abs(diff)) + pct + (diff < 0 ? " short of" : " over") + " raw XP.";
}

async function check(staged) {
  const data = dataList(), known = new Set(data.map((d) => gen.slugify(d.n)));
  const readings = JSON.parse(read(READINGS)), { rows } = queueRows(read(VIDEOS));
  const accepted = new Set((arg("--accept") || "").split(",").filter(Boolean));
  const slugs = [];
  staged.forEach((r) => Object.keys(r.kills || {}).forEach((k) => slugs.push((r.names || {})[k] || gen.slugify(k))));
  const exp = await wikiExp([...new Set(slugs)].filter((s) => known.has(s)), data);
  const results = staged.map((r) => {
    const where = r.id || r.video, issues = [];
    const d = gen.derive(r, known);
    d.errors.concat(d.warnings).forEach((e) => issues.push(e.replace(where + ": ", "")));
    if (!Object.values(VOCATIONS).includes(r.vocation)) issues.push("vocation \"" + r.vocation + "\" isn't one of " + Object.values(VOCATIONS).join(", "));
    if (readings.some((x) => x.id === r.id)) issues.push("id " + r.id + " is already in readings.json");
    if (readings.some((x) => x.video === r.video)) issues.push("video " + r.video + " is already in readings.json");
    const row = rows.find((x) => x.id === r.video);
    if (!row) issues.push("video isn't in the Queue");
    else if (row.status !== "todo") issues.push("Queue row is \"" + row.status + "\", not todo");
    const sl = r.slide;
    if (sl && ["raw", "loot"].some((k) => !sl[k])) issues.push("slide needs raw and loot (his rounded numbers)");
    if (sl && ["bountyPreys", "charms", "animus"].some((k) => typeof sl[k] !== "boolean")) issues.push("slide needs bountyPreys, charms and animus as true/false");
    Object.keys(r.kills || {}).forEach((k) => {
      const s = (r.names || {})[k] || gen.slugify(k);
      if (known.has(s)) return;
      const pre = gen.slugify(k.replace(/(\.\.\.|…)$/, ""));
      const like = data.filter((x) => gen.slugify(x.n).startsWith(pre)).map((x) => x.n.toLowerCase());
      issues.push("\"" + k + "\" isn't a creature in DATA" + (like.length ? " (did you mean " + like.slice(0, 5).join(", ") + "?)" : ""));
    });
    let diff = null;
    const a = r.analyser || {};
    const noExp = Object.keys(r.kills || {}).filter((k) => exp[(r.names || {})[k] || gen.slugify(k)] == null);
    if (noExp.length) issues.push("no TibiaWiki exp for " + noExp.join(", "));
    else if (a.rawXpGain) {
      diff = Object.keys(r.kills).reduce((s, k) => s + r.kills[k] * exp[(r.names || {})[k] || gen.slugify(k)], 0) - a.rawXpGain;
      if (diff < -XP_SHORT * a.rawXpGain) issues.push("kills x TibiaWiki exp is " + (100 * -diff / a.rawXpGain).toFixed(1) + "% short of raw XP (hidden rows or a misread count?)");
      if (diff > XP_OVER * a.rawXpGain) issues.push("kills x TibiaWiki exp is " + (100 * diff / a.rawXpGain).toFixed(1) + "% over raw XP (misread count or creature?)");
    }
    return { r, d, diff, issues, accepted: accepted.has(r.id), row };
  });
  return { results, blocking: results.filter((x) => x.issues.length && !x.accepted) };
}

function table(results) {
  const out = ["| # | Spot | Vocation | Level (min) | Session | Raw XP/h | XP/h | Profit/h | Kills/h | XP check |", "|---|---|---|---|---|---|---|---|---|---|"];
  results.forEach(({ r, d, diff, row }) => {
    const e = d.entry, a = r.analyser || {};
    out.push("| " + [row ? row.n : "?", r.spot, SHORT[r.vocation] ? SHORT[r.vocation].toUpperCase() : r.vocation, (r.charLevel || "?") + " (" + r.levelMin + "+)",
      e ? (e.hours * 60).toFixed(1) + " min" : "?", e ? num(e.rawXph) : "?", e && e.xph ? num(e.xph) : "", e ? num(e.profitph) : "?",
      e ? e.creatures.map((c) => c.slug.replace(/-/g, " ") + " " + c.kph).join(", ") : "?",
      diff == null ? "?" : diff === 0 ? "exact" : (diff > 0 ? "+" : "−") + num(Math.abs(diff)) + " (" + (diff > 0 ? "+" : "−") + (100 * Math.abs(diff) / a.rawXpGain).toFixed(2) + "%)"].join(" | ") + " |");
  });
  return out.join("\n");
}

function printIssues(results) {
  const bad = results.filter((x) => x.issues.length);
  if (!bad.length) { console.log("\nNo issues."); return; }
  console.log("\nIssues:");
  bad.forEach((x) => x.issues.forEach((i) => console.log("- " + (x.r.id || x.r.video) + (x.accepted ? " (accepted)" : "") + ": " + i)));
}

async function cmdCheck() {
  const staged = JSON.parse(read(process.argv[3]));
  const res = await check(staged);
  console.log(table(res.results));
  printIssues(res.results);
  const gaps = res.results.filter((x) => x.issues.some((i) => /TibiaWiki exp is/.test(i)));
  if (gaps.length) await printHistory(gaps.map((x) => x.r), dataList());
  if (res.blocking.length) process.exit(1);
}

// node tools/reference/batch.js history <staged.json | readings id | "creature, creature">
async function cmdHistory() {
  const a = process.argv[3], data = dataList();
  let readings;
  if (fs.existsSync(a)) readings = JSON.parse(read(a));
  else {
    readings = JSON.parse(read(READINGS)).filter((r) => r.id === a);
    if (!readings.length) readings = [{ kills: Object.fromEntries(a.split(",").map((n) => [n.trim(), 1])) }];
  }
  await printHistory(readings, data);
}

// ---- Embed ----

// Turns the staged "slide" object into the remark and notes text the earlier readings use, and adds the XP check.
function finish(r, diff) {
  const out = Object.assign({}, r), sl = r.slide;
  delete out.slide; delete out.notesTail;
  const remark = [], notes = [];
  if (sl) {
    const used = [], unused = [];
    if (sl.bountyPreys) used.push("bounty/preys"); else unused.push("preys");
    (sl.charms ? used : unused).push("charms");
    if (!sl.bountyPreys) unused.push("bounty");
    (sl.animus ? used : unused).push("animus");
    remark.push("Slide: " + (used.length ? joinList(used, "and") + " used" + (unused.length ? "; no " + joinList(unused, "or") : "") : "no " + joinList(unused, "or")) + ".");
  }
  if (r.remark) remark.push(r.remark);
  if (diff != null && !/TibiaWiki/.test(r.remark || "")) remark.push(xpSentence(diff, r.analyser.rawXpGain));
  if (r.notes) notes.push(r.notes);
  if (sl) {
    const start = sl.start && sl.start !== r.levelMin + "+" ? sl.start + ", " : "";
    notes.push("His slide: " + start + sl.raw + " raw, " + sl.loot + ".");
    const on = ["charms", "animus"].filter((k) => sl[k]).concat(sl.bountyPreys ? ["bounty/preys"] : []);
    if (on.length) notes.push(joinList(on, "and").replace(/^./, (c) => c.toUpperCase()) + " on.");
  }
  if (r.notesTail) notes.push(r.notesTail);
  out.remark = remark.join(" ");
  out.notes = notes.join(" ");
  if (!out.remark) delete out.remark;
  if (!out.notes) delete out.notes;
  return out;
}

// Which creatures a set of readings covers: slug -> {spots, vocations}. Spots include aliases, compared case-insensitively.
function coverage(readings, known) {
  const cov = {};
  readings.forEach((r) => {
    const d = gen.derive(r, known);
    if (!d.entry) return;
    const spots = [r.spot].concat(r.aliases || []).map((s) => s.toLowerCase());
    d.entry.creatures.forEach((c) => {
      const k = cov[c.slug] || (cov[c.slug] = { spots: new Set(), vocations: new Set() });
      spots.forEach((s) => k.spots.add(s));
      k.vocations.add(r.vocation);
    });
  });
  return cov;
}

// The batch report: compares what the readings covered before the batch with what the batch adds.
function report(before, batch, known, data, rows, doneIds) {
  const name = (slug) => { const d = data.find((x) => gen.slugify(x.n) === slug); return d ? d.n : slug; };
  const cov = coverage(before, known), fresh = {}, more = [];
  batch.forEach((r) => {
    const d = gen.derive(r, known);
    if (!d.entry) return;
    const spots = [r.spot].concat(r.aliases || []).map((s) => s.toLowerCase());
    d.entry.creatures.forEach((c) => {
      const k = cov[c.slug];
      if (!k) { (fresh[c.slug] = fresh[c.slug] || []).push(r.spot + " (" + SHORT[r.vocation].toUpperCase() + ")"); return; }
      const what = [];
      if (!spots.some((s) => k.spots.has(s))) what.push("new spot " + r.spot);
      if (!k.vocations.has(r.vocation)) what.push("new vocation " + r.vocation);
      if (what.length) more.push(name(c.slug) + ": " + what.join(", ") + " (" + c.kph + "/h)");
    });
  });
  const lines = ["### Videos processed (" + batch.length + ")"];
  batch.forEach((r) => { const row = rows.find((x) => x.id === r.video); lines.push("- " + (row ? "#" + row.n + " " : "") + r.video + " " + (row ? row.title : r.spot)); });
  const fk = Object.keys(fresh);
  lines.push("", "### Net new monsters (" + fk.length + ")");
  if (!fk.length) lines.push("- none");
  fk.map((s) => name(s) + ": " + fresh[s].join(", ")).sort().forEach((t) => lines.push("- " + t));
  lines.push("", "### Additional spawns or vocations (" + more.length + ")");
  if (!more.length) lines.push("- none");
  more.sort().forEach((t) => lines.push("- " + t));
  const left = rows.filter((x) => x.status === "todo" && !doneIds.has(x.id)), checks = rows.filter((x) => x.status === "check");
  const eras = {}, vocs = {};
  left.forEach((x) => { eras[x.era] = (eras[x.era] || 0) + 1; vocs[x.vocation] = (vocs[x.vocation] || 0) + 1; });
  lines.push("", "### Videos left: " + left.length + " todo (" + Object.keys(eras).map((e) => eras[e] + " " + e).join(", ") + "; " +
    Object.keys(vocs).map((v) => vocs[v] + " " + v).join(", ") + ")" + (checks.length ? ", " + checks.length + " to check" : ""));
  lines.push("Next up:");
  left.slice(0, 10).forEach((x) => lines.push("- #" + x.n + " " + x.id + " [" + x.era + "] " + x.title));
  return lines.join("\n");
}

async function cmdEmbed() {
  const file = process.argv[3], staged = JSON.parse(read(file));
  const res = await check(staged);
  if (res.blocking.length) {
    console.log(table(res.results));
    printIssues(res.results);
    console.error("\nNot embedded: fix the issues above, or pass --accept <id,...> once a person has OK'd them.");
    process.exit(1);
  }
  const date = arg("--date") || localDate();
  const data = dataList(), known = new Set(data.map((d) => gen.slugify(d.n)));
  const rawReadings = read(READINGS), before = JSON.parse(rawReadings);
  const batch = res.results.map((x) => finish(x.r, x.diff));
  const all = before.concat(batch);

  // Regenerate REFERENCE in memory first, so a generator error leaves every file untouched.
  const built = gen.build(all, known);
  if (built.errors.length) { built.errors.forEach((e) => console.error("error: " + e)); process.exit(1); }

  // readings.json: append the records as text, so the existing ones stay byte for byte.
  const body = batch.map((r) => JSON.stringify(r, null, 2).replace(/^/gm, "  ")).join(",\n");
  const readingsOut = rawReadings.replace(/\s*\]\s*$/, ",\n" + body + "\n]\n");
  if (JSON.stringify(JSON.parse(readingsOut)) !== JSON.stringify(all)) throw new Error("readings.json append went wrong; nothing written");

  // REFERENCE_VIDEOS.md: mark the rows done and recount the Status line (keeping maybe and skipped as they are).
  const vdoc = read(VIDEOS), q = queueRows(vdoc), ids = new Set(batch.map((r) => r.video));
  q.rows.forEach((r) => { if (ids.has(r.id)) q.lines[r.line] = q.lines[r.line].replace(/^(\| \d+ \| )todo( \|)/, "$1done " + date + "$2"); });
  const after = queueRows(q.lines.join("\n")).rows;
  const count = (f) => after.filter(f).length;
  const st = q.lines.findIndex((l) => /^Status:/.test(l));
  const done = count((r) => /^done/.test(r.status)), todo = count((r) => r.status === "todo"), chk = count((r) => r.status === "check");
  q.lines[st] = q.lines[st].replace(/^Status: \d+ done, \d+ to do, (\d+ to check, )?/, "Status: " + done + " done, " + todo + " to do, " + (chk ? chk + " to check, " : ""));

  // REFERENCE_DB_PLAN.md: "N seed entries from M videos".
  const plan = read(PLAN);
  const planOut = plan.replace(/\d+ seed entries from \d+ videos/, all.length + " seed entries from " + new Set(all.map((r) => r.video)).size + " videos");

  gen.writeKeeping(gen.OUT, built.text);
  write(READINGS, readingsOut, rawReadings);
  write(VIDEOS, q.lines.join("\n"), vdoc);
  write(PLAN, planOut, plan);
  console.log("Embedded " + batch.length + " readings (" + all.length + " in all); marked " + ids.size + " Queue rows done " + date + ".\n");
  console.log(table(res.results));
  printIssues(res.results);
  console.log("\n" + report(before, batch, known, data, q.rows, ids));
}

if (require.main === module) {
  const cmds = { next: cmdNext, check: cmdCheck, embed: cmdEmbed, history: cmdHistory, recheck: cmdRecheck };
  const cmd = cmds[process.argv[2]];
  if (!cmd || (!["next", "recheck"].includes(process.argv[2]) && !process.argv[3])) {
    console.error("usage: node tools/reference/batch.js next [n] [--skeleton <file>] | check <file> [--accept ids] | embed <file> [--accept ids] [--date YYYY-MM-DD] | history <file | reading id | \"creature, creature\"> | recheck");
    process.exit(2);
  }
  cmd().catch((e) => { console.error("error: " + e.message); process.exit(1); });
}

module.exports = { fromTitle, finish, coverage, report, queueRows, xpSentence, dataList, loadExp, wikiHistory, expAtPublish, MONTHS, READINGS };
