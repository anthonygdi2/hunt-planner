#!/usr/bin/env node
// TibiaWiki hit points per creature: "| hp =" in each creature's infobox (tibia.fandom.com api.php, 50 titles a
// request), cached in wiki-hp.json as {note, hp {slug: hit points}} for every creature in src/data/creatures.json.
//   node tools/reference/fetch-hp.js          fetch the creatures the cache doesn't have yet
//   node tools/reference/fetch-hp.js --all    fetch every creature again
// Then `node tools/reference/generate.js --hp` rewrites src/data/creature-hp.json (the planner's PL_HP) from it.
"use strict";
const fs = require("fs");
const path = require("path");
const gen = require("./generate.js");

const CACHE = path.join(__dirname, "wiki-hp.json");
const DATA = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "..", "src", "data", "creatures.json"), "utf8"));
const API = "https://tibia.fandom.com/api.php?action=query&prop=revisions&rvprop=content&rvslots=main&format=json&redirects=1&titles=";

// The hit points in a page's wikitext, or null: the first "| hp = 1,234" of its infobox.
function hpOf(text) {
  const m = String(text || "").match(/\|\s*hp\s*=\s*([\d,.]+)/);
  const n = m ? +m[1].replace(/[,.]/g, "") : NaN;
  return n > 0 ? n : null;
}

async function fetchBatch(titles) {
  const q = (await (await fetch(API + encodeURIComponent(titles.join("|")))).json()).query || {};
  // The title asked for → the title the page has (normalized, then redirected).
  const to = {};
  (q.normalized || []).concat(q.redirects || []).forEach((r) => { to[r.from] = r.to; });
  const final = (t) => { let x = t, n = 0; while (to[x] && n++ < 5) x = to[x]; return x; };
  const byTitle = {};
  Object.values(q.pages || {}).forEach((p) => { byTitle[p.title] = p.revisions ? p.revisions[0].slots.main["*"] : ""; });
  const out = {};
  titles.forEach((t) => { out[t] = hpOf(byTitle[final(t)]); });
  return out;
}

async function main() {
  const cache = fs.existsSync(CACHE) && !process.argv.includes("--all") ? JSON.parse(fs.readFileSync(CACHE, "utf8")) : { note: "", hp: {} };
  const todo = DATA.filter((d) => cache.hp[gen.slugify(d.n)] == null), missing = [];
  for (let i = 0; i < todo.length; i += 50) {
    const part = todo.slice(i, i + 50), got = await fetchBatch(part.map((d) => d.w || d.n));
    part.forEach((d) => { const hp = got[d.w || d.n]; if (hp) cache.hp[gen.slugify(d.n)] = hp; else missing.push(d.n); });
  }
  const sorted = {};
  Object.keys(cache.hp).sort().forEach((k) => { sorted[k] = cache.hp[k]; });
  const d = new Date(), day = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  if (todo.length) {
    fs.writeFileSync(CACHE, JSON.stringify({ note: "TibiaWiki hit points per creature (tibia.fandom.com, \"| hp =\" in the infobox, CC BY-SA), cached by tools/reference/fetch-hp.js. Last fetched " + day + ".", hp: sorted }, null, 2) + "\n");
  }
  console.log(Object.keys(sorted).length + " of " + DATA.length + " creatures have hit points" + (missing.length ? "; none found for: " + missing.join(", ") : ""));
}

if (require.main === module) main().catch((e) => { console.error(e.message); process.exit(1); });
module.exports = { hpOf };
