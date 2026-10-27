// The data files the page embeds (sources and licenses in README.md). This module only works in the bundle:
// tools/assemble.js replaces each __BTL_DATA__("<file>") call in esbuild's output with that file's contents as a
// literal (or with the value a test passes to assemble()). Node code reads the JSON files directly.
/* global __BTL_DATA__ */

// The 730 creatures: n name, c bestiary class (E, M, H, C), m task-pool bitmask (Beginner 1, Adept 2, Expert 4,
// Master 8), w TibiaWiki title when it differs from the name, r 1 for rare creatures. TibiaWiki, CC BY-SA.
export const DATA = __BTL_DATA__("creatures.json");

// Reference hunts: goalposts read from published hunt videos (Kusnier on YouTube, indexed by tibiapal.com). They fill in
// creatures a character hasn't logged and are scaled to that character by calibration; its own numbers always win.
// Fields: spot, aliases (other names people log it under), vocation (or "any"), levelMin/levelMax, team, hours (analyser
// session length), rawXph (required), xph (boosted, optional), profitph (balance/h), creatures [{slug, kph, how}] where how
// is "bounty" (his bounty-time list), "kills" (analyser kill list) or "single" (raw exp/h / creature exp),
// source {who, url, date, postRebalance}, profitStale (optional: profit is dated even if post-rebalance). See docs/REFERENCE_DB_PLAN.md.
// The entries are generated from tools/reference/readings.json (what the analyser showed in each video) by
// tools/reference/generate.js; edit the readings and rerun it, not reference.json. Kills/h = kill count / session length,
// where the length is XP gain / XP per hour (the analyser rounds "00:15h" down); profit/h = balance over the same length;
// creatures with fewer than 5 kills are left out. His results tables label balance as "Loot" (old) or "Expected Loot
// (market values)" (2026). The vocation rebalance went live mid-June 2026 (first post-rebalance guide 2026-06-18).
// Videos still to read are tracked in docs/REFERENCE_VIDEOS.md.
export const REFERENCE = __BTL_DATA__("reference.json");

// TibiaWiki base exp per creature (CC BY-SA), a copy of tools/reference/wiki-exp.json for the creatures in DATA
// (node tools/reference/generate.js --exp). tests/planner.test.js checks every value against that file.
export const PL_EXP = __BTL_DATA__("creature-exp.json");
