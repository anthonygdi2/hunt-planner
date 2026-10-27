// The data the page embeds and the reference tools, checked offline (moved from the old smoke and planner tests when
// the old UI went): reference seeds, the generated reference.json, PL_EXP against wiki-exp.json, the video queue
// refresh and the batch helper. Run: node --test tests/data.test.js
"use strict";
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const { readData } = require("../tools/assemble.js");

const ROOT = path.join(__dirname, "..");
const seeds = readData("reference.json"), creatureList = readData("creatures.json");
const known = new Set(creatureList.map((d) => d.n.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")));

test("reference seeds: every creature exists, ids are unique, every seed has its video", () => {
  const badSlugs = seeds.flatMap((e) => e.creatures.map((c) => c.slug)).filter((s) => !known.has(s));
  assert.ok(seeds.length > 0);
  assert.deepStrictEqual(badSlugs, []);
  const ids = seeds.map((e) => e.id), dupIds = ids.filter((x, i) => ids.indexOf(x) !== i);
  assert.deepStrictEqual(dupIds, []);
  assert.ok(seeds.every((e) => e.source && /youtube\.com\/watch\?v=/.test(e.source.url)), "missing source url");
});

test("src/data/reference.json matches tools/reference/readings.json (run node tools/reference/generate.js)", () => {
  const gen = require("../tools/reference/generate.js").build(JSON.parse(fs.readFileSync(path.join(ROOT, "tools", "reference", "readings.json"), "utf8")));
  const refFile = fs.readFileSync(path.join(ROOT, "src", "data", "reference.json"), "utf8").replace(/\r\n/g, "\n");
  assert.deepStrictEqual(gen.errors, []);
  assert.ok(gen.text === refFile, "file differs from the readings");
});

test("the planner's exp table (PL_EXP) matches tools/reference/wiki-exp.json", () => {
  const wiki = JSON.parse(fs.readFileSync(path.join(ROOT, "tools", "reference", "wiki-exp.json"), "utf8")).exp, exp = readData("creature-exp.json");
  assert.ok(Object.keys(exp).length > 300);
  assert.deepStrictEqual(Object.keys(exp).filter((k) => exp[k] !== wiki[k]), []);
});

test("the video queue refresh (offline)", () => {
  const vids = require("../tools/reference/refresh-videos.js");
  const qdoc = ["Listed October 24, 2026 from all 3 videos on the channel. Age is as of October 24, 2026.", "", "Status: 1 done, 0 to do, 0 maybe, 1 skipped.", "", "## Queue", "",
    "| # | Status | Video | Age | Era | Vocation | Level | Title |", "|---|---|---|---|---|---|---|---|",
    "| 1 | done 2026-10-24 | [-21t1-7GFQ4](https://www.youtube.com/watch?v=-21t1-7GFQ4) | 1d ago | post | Paladin | 90+ | Liberty Bay Quaras · 90+ Paladin |", "",
    "## Maybe", "", "| # | Video | Age | Vocation | Level | Why | Title |", "|---|---|---|---|---|---|---|", "", "## Skipped", "", "Not listed: 1 other."].join("\n");
  const qres = vids.update(qdoc, { items: [
    { id: "aaaaaaaaaaa", title: "Grimvale -1 | 70+ Paladin | Tibia", age: "1h ago" },
    { id: "bbbbbbbbbbb", title: "Asura Mirror | Monk + Sorcerer Duo Showcase | Level 250+", age: "2h ago" },
    { id: "ccccccccccc", title: "Roast My Hunt #4 | 500 Knight at Falcons", age: "3h ago" },
    { id: "-21t1-7GFQ4", title: "Liberty Bay Quaras | 90+ Paladin | Tibia", age: "2d ago" }], complete: true }, "2026-10-26");
  const qlines = qres.text.split("\n");
  assert.strictEqual(qlines[qlines.indexOf("|---|---|---|---|---|---|---|---|") + 1], "| 1 | todo | [aaaaaaaaaaa](https://www.youtube.com/watch?v=aaaaaaaaaaa) | 1h ago | post | Paladin | 70+ | Grimvale -1 · 70+ Paladin |",
    "a new guide goes at the top of the Queue as todo");
  assert.ok(qres.text.includes("| 4 | done 2026-10-24 | [-21t1-7GFQ4](https://www.youtube.com/watch?v=-21t1-7GFQ4) | 2d ago |"), "keeps the done row and updates its # and age");
  assert.ok(/\| 2 \| \[bbbbbbbbbbb\].*\| duo\/team \|/.test(qres.text) && qres.text.includes("Not listed: 1 other, 1 player review.") && qres.text.includes("Status: 1 done, 1 to do, 1 maybe, 2 skipped."),
    "duos go to Maybe and reviews to the skipped counts");
});

test("the batch helper (offline): title parsing, remark and notes, the new-monster report", () => {
  const batch = require("../tools/reference/batch.js");
  const ft = batch.fromTitle({ title: "Flimsy Venore -1 (Advanced) · 300+ Paladin", level: "300+", vocation: "Paladin" });
  assert.ok(ft.spot === "Flimsy Venore -1" && ft.aliases[0] === "Flimsy Venore -1 (Advanced)" && ft.levelMin === 300 && ft.vocation === "Royal Paladin" && ft.notes === "Advanced guide.", JSON.stringify(ft));
  const fin = batch.finish({ levelMin: 600, analyser: { rawXpGain: 100000 }, notes: "Advanced guide.", notesTail: "Kill list may be incomplete.",
    slide: { start: "500+", raw: "9.0kk/h", loot: "1.8kk/h", bountyPreys: false, charms: true, animus: true } }, -4000);
  assert.strictEqual(fin.remark, "Slide: charms and animus used; no preys or bounty. Kills x TibiaWiki exp is 4,000 (4.0%) short of raw XP.");
  assert.strictEqual(fin.notes, "Advanced guide. His slide: 500+, 9.0kk/h raw, 1.8kk/h. Charms and animus on. Kill list may be incomplete.");
  assert.ok(!("slide" in fin));
  const rd = (id, spot, vocation, kills) => ({ id, video: id, published: "2026-10-01", spot, vocation, levelMin: 100,
    analyser: { rawXpGain: 1000000, rawXph: 4000000, balance: 0 }, kills });
  const rep = batch.report([rd("a", "Spot A", "Royal Paladin", { crusader: 50 })],
    [rd("b", "Spot B", "Master Sorcerer", { crusader: 40, headwalker: 30 })], known, creatureList, [], new Set(["b"]));
  assert.ok(/Net new monsters \(1\)\n- Headwalker: Spot B \(MS\)/.test(rep) && rep.includes("- Crusader: new spot Spot B, new vocation Master Sorcerer (160/h)"), rep);
});
