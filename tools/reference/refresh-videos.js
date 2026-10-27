#!/usr/bin/env node
// Refreshes docs/REFERENCE_VIDEOS.md from the YouTube channel @Kusnierr (its Videos tab, newest first).
//   node tools/reference/refresh-videos.js            update the file
//   node tools/reference/refresh-videos.js --dry-run  print what would change
// New uploads (everything above the newest video already checked) go to the top of the Queue: titles that look like a
// solo hunt guide ("Spot | 90+ Paladin") as "todo", duo/team showcases to Maybe, "Roast My Hunt" reviews to the skipped
// counts, anything else as "check" for a person to sort. Existing rows keep their status; their # (position on the
// channel) and Age are updated from the live list when the whole list loads.
"use strict";
const fs = require("fs");
const path = require("path");

const DOC = path.join(__dirname, "..", "..", "docs", "REFERENCE_VIDEOS.md");
const CHANNEL = "https://www.youtube.com/@Kusnierr/videos";
const REBALANCE = "2026-06-18";
const VOCS = ["Knight", "Paladin", "Sorcerer", "Druid", "Monk"];
const HEADERS = { "accept-language": "en-US,en;q=0.9", "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36" };

// "1 day ago" / "1d ago" / "Streamed 2 weeks ago" -> "1d ago" (the doc's short form).
function shortAge(s) {
  const m = /(\d+)\s*(second|minute|hour|day|week|month|year|s|min|h|d|w|mo|y)s?\b/i.exec(s || "");
  if (!m) return s || "";
  const unit = { second: "s", minute: "min", hour: "h", day: "d", week: "w", month: "mo", year: "y" }[m[2].toLowerCase()] || m[2].toLowerCase();
  return m[1] + unit + " ago";
}
function ageDays(age) {
  const m = /^(\d+)(s|min|h|d|w|mo|y) ago$/.exec(age || "");
  if (!m) return null;
  return +m[1] * ({ s: 0, min: 0, h: 1 / 24, d: 1, w: 7, mo: 30.4, y: 365 })[m[2]];
}
const daysBetween = (a, b) => (Date.parse(b) - Date.parse(a)) / 864e5;
const today = () => new Date().toISOString().slice(0, 10);
const longDate = (d) => new Date(d + "T12:00:00Z").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });

// Pulls {id, title, age} items and the next continuation token out of a YouTube JSON response, in page order.
function collect(json) {
  const items = [];
  let token = null;
  JSON.stringify(json, (k, v) => {
    if (k === "lockupViewModel" && v.contentId) {
      const md = v.metadata && v.metadata.lockupMetadataViewModel;
      const parts = [];
      JSON.stringify(md, (k2, v2) => { if (k2 === "content" && typeof v2 === "string") parts.push(v2); return v2; });
      items.push({ id: v.contentId, title: md.title.content, age: shortAge(parts.find((p) => /\bago\b/.test(p))) });
    } else if (k === "videoRenderer" && v.videoId) {
      items.push({ id: v.videoId, title: v.title.runs.map((r) => r.text).join(""), age: shortAge(v.publishedTimeText && v.publishedTimeText.simpleText) });
    } else if (k === "continuationItemRenderer") {
      // The video grid's "load more" item comes first; later ones on the page belong to other parts of it.
      const c = v.continuationEndpoint && v.continuationEndpoint.continuationCommand;
      if (c && c.token && !token) token = c.token;
    }
    return v;
  });
  return { items, token };
}

async function fetchChannel() {
  const page = await (await fetch(CHANNEL, { headers: HEADERS })).text();
  const init = page.match(/var ytInitialData = (\{.*?\});<\/script>/);
  if (!init) throw new Error("couldn't read the channel page (no ytInitialData)");
  const key = (page.match(/"INNERTUBE_API_KEY":"([^"]+)"/) || [])[1];
  const version = (page.match(/"INNERTUBE_CLIENT_VERSION":"([^"]+)"/) || page.match(/"clientVersion":"([^"]+)"/) || [])[1];
  let { items, token } = collect(JSON.parse(init[1]));
  let complete = !token;
  for (let i = 0; token && key && i < 100; i++) {
    const res = await fetch("https://www.youtube.com/youtubei/v1/browse?key=" + key, {
      method: "POST", headers: Object.assign({ "content-type": "application/json" }, HEADERS),
      body: JSON.stringify({ context: { client: { clientName: "WEB", clientVersion: version, hl: "en", gl: "US" } }, continuation: token })
    });
    if (!res.ok) { console.warn("warning: continuation request failed (" + res.status + "); only the first " + items.length + " videos loaded"); break; }
    const more = collect(await res.json());
    items = items.concat(more.items);
    token = more.token;
    if (!token) complete = true;
  }
  const seen = {};
  items = items.filter((v) => !seen[v.id] && (seen[v.id] = 1));
  return { items, complete };
}

// Doc title style: "Spot | 90+ Paladin | Tibia" -> "Spot · 90+ Paladin".
const docTitle = (t) => t.replace(/\s*\|\s*/g, " · ").replace(/\s*·\s*Tibia\s*$/i, "").replace(/\|/g, "/").trim();

function classify(title) {
  const at = (v) => title.search(new RegExp("\\b" + v + "s?\\b", "i"));
  const vocs = VOCS.filter((v) => at(v) >= 0).sort((a, b) => at(a) - at(b));
  const level = (title.match(/(\d{1,4})\s*\+/) || [])[1] || "";
  const base = { vocation: vocs.join(" + "), level: level ? level + "+" : "" };
  if (/roast my hunt/i.test(title)) return Object.assign(base, { kind: "skip", why: "player review" });
  if (/\b(duo|team|party|showcase)\b/i.test(title) || vocs.length > 1) return Object.assign(base, { kind: "maybe", why: "duo/team" });
  if (vocs.length === 1 && level) return Object.assign(base, { kind: "todo" });
  return Object.assign(base, { kind: "check" });
}

const cells = (line) => line.split("|").slice(1, -1).map((c) => c.trim());
const row = (c) => "| " + c.join(" | ") + " |";
const vidCell = (id) => "[" + id + "](https://www.youtube.com/watch?v=" + id + ")";
const idOf = (cell) => (cell.match(/\[([\w-]{11})\]/) || [])[1];

function update(doc, live, date) {
  const complete = live.complete;
  const lines = doc.split(/\r?\n/);
  const sec = (name) => lines.findIndex((l) => l.trim() === "## " + name);
  const known = new Set();
  lines.forEach((l) => { const id = idOf(l); if (id) known.add(id); });
  const newestLine = lines.findIndex((l) => /^Newest video checked:/.test(l));
  if (newestLine >= 0) known.add(idOf(lines[newestLine]));
  const firstKnown = live.items.findIndex((v) => known.has(v.id));
  if (firstKnown < 0) throw new Error("none of the channel's videos are in the doc; is the list right?");
  const fresh = live.items.slice(0, firstKnown);
  const pos = {};
  live.items.forEach((v, i) => { pos[v.id] = { n: i + 1, age: v.age }; });

  // Renumber and re-age existing rows (Queue: # Status Video Age ...; Maybe: # Video Age ...).
  let missing = 0;
  const qStart = sec("Queue"), mStart = sec("Maybe"), sStart = sec("Skipped");
  lines.forEach((l, i) => {
    if (!/^\| \d+ \|/.test(l)) return;
    const c = cells(l), inQueue = i > qStart && i < mStart, vi = inQueue ? 2 : 1, id = idOf(c[vi]);
    if (pos[id]) { c[0] = String(pos[id].n); c[vi + 1] = pos[id].age; }
    else if (complete) missing++;
    else c[0] = String(+c[0] + fresh.length);
    lines[i] = row(c);
  });

  const queueRows = [], maybeRows = [], skips = {}, report = [];
  fresh.forEach((v, i) => {
    const k = classify(v.title), n = String(i + 1), days = ageDays(v.age);
    const era = days != null && days <= daysBetween(REBALANCE, date) ? "post" : "pre";
    report.push(k.kind + ": " + v.id + " " + v.title);
    if (k.kind === "skip") skips[k.why] = (skips[k.why] || 0) + 1;
    else if (k.kind === "maybe") maybeRows.push(row([n, vidCell(v.id), v.age, k.vocation, k.level, k.why, docTitle(v.title)]));
    else queueRows.push(row([n, k.kind, vidCell(v.id), v.age, era, k.vocation, k.level, docTitle(v.title)]));
  });
  const insertAfterHeader = (start, rows) => {
    const h = lines.findIndex((l, i) => i > start && /^\|---/.test(l));
    lines.splice(h + 1, 0, ...rows);
  };
  // Insert from the bottom up so earlier indexes stay valid.
  if (maybeRows.length) insertAfterHeader(sec("Maybe"), maybeRows);
  if (queueRows.length) insertAfterHeader(sec("Queue"), queueRows);

  // Skipped counts: "Not listed: 106 other, 29 level guide, ..."
  const nl = lines.findIndex((l) => /^Not listed:/.test(l));
  if (nl >= 0 && Object.keys(skips).length) {
    const counts = {};
    lines[nl].replace(/(\d+) ([a-z][a-z ]*?)(?=,|\.)/g, (m, c, what) => { counts[what] = +c; });
    Object.keys(skips).forEach((w) => { counts[w] = (counts[w] || 0) + skips[w]; });
    lines[nl] = lines[nl].replace(/^Not listed: [^.]*\./, "Not listed: " + Object.keys(counts).map((w) => counts[w] + " " + w).join(", ") + ".");
  }

  // Status line, newest-checked marker and dates.
  const q = { done: 0, todo: 0, check: 0 };
  let maybe = 0;
  const m2 = sec("Maybe"), s2 = sec("Skipped");
  lines.forEach((l, i) => {
    if (!/^\| \d+ \|/.test(l)) return;
    if (i < m2) { const s = cells(l)[1]; q[/^done/.test(s) ? "done" : s === "check" ? "check" : "todo"]++; }
    else if (i < s2) maybe++;
  });
  let skipped = 0;
  if (nl >= 0) lines[lines.findIndex((l) => /^Not listed:/.test(l))].replace(/(\d+) [a-z]/g, (m, c) => { skipped += +c; });
  const st = lines.findIndex((l) => /^Status:/.test(l));
  lines[st] = "Status: " + q.done + " done, " + q.todo + " to do, " + (q.check ? q.check + " to check, " : "") + maybe + " maybe, " + skipped + " skipped.";
  const marker = "Newest video checked: " + vidCell(live.items[0].id) + " (" + date + ").";
  if (newestLine >= 0) lines[newestLine] = marker;
  else lines.splice(st + 1, 0, "", marker);
  // Deleted videos stay in the skipped counts (they aren't listed by id), so the channel's own count can be lower.
  const total = complete ? live.items.length : q.done + q.todo + q.check + maybe + skipped;
  lines.forEach((l, i) => {
    lines[i] = l.replace(/(from all )\d+( videos on the channel)/, "$1" + total + "$2")
      .replace(/Age is as of [A-Z][a-z]+ \d+, \d{4}/, "Age is as of " + longDate(date));
  });
  return { text: lines.join("\n"), fresh, report, missing };
}

if (require.main === module) {
  (async () => {
    const dry = process.argv.includes("--dry-run");
    const live = await fetchChannel();
    console.log("Loaded " + live.items.length + " videos from the channel" + (live.complete ? "" : " (incomplete list)"));
    const doc = fs.readFileSync(DOC, "utf8");
    const res = update(doc, live, today());
    res.report.forEach((r) => console.log("new " + r));
    if (!res.fresh.length) console.log("No new uploads.");
    if (res.missing) console.warn("warning: " + res.missing + " listed videos are no longer on the channel (kept as they were)");
    const out = /\r\n/.test(doc) ? res.text.replace(/\n/g, "\r\n") : res.text;
    if (dry) console.log(out === doc ? "(no changes)" : "(dry run: docs/REFERENCE_VIDEOS.md not written)");
    else if (out !== doc) { fs.writeFileSync(DOC, out); console.log("Updated docs/REFERENCE_VIDEOS.md"); }
  })().catch((e) => { console.error("error: " + e.message); process.exit(1); });
}

module.exports = { update, classify, shortAge, docTitle };
