#!/usr/bin/env node
// Assembles the app into one self-contained page, dist/index.html:
//   1. src/index.html, with each line that holds only {{src/<file>.css}} replaced by that file (the legacy CSS),
//   2. its {{src/main.js}} line replaced by the esbuild bundle of src/main.js (an IIFE targeting ES2017),
//   3. each __BTL_DATA__("<file>.json") in the bundle (src/data/index.js) replaced by that data file as a literal.
//   node tools/assemble.js        write dist/index.html (npm test and npm run build run this first)
// From tests and tools:
//   require("./tools/assemble.js").assemble()                    the page as a string
//   require("./tools/assemble.js").assemble({ reference: [...] }) the same with REFERENCE replaced (also creatures,
//                                                                 creatureExp)
"use strict";
const fs = require("fs");
const path = require("path");
const esbuild = require("esbuild");

const ROOT = path.join(__dirname, "..");
const SRC = path.join(ROOT, "src", "index.html");
const ENTRY = path.join(ROOT, "src", "main.js");
const DATA_DIR = path.join(ROOT, "src", "data");
const OUT = path.join(ROOT, "dist", "index.html");
// Each data file: the assemble() option that replaces it, and how it's written into the page ("line": on one line,
// "list": one record per line inside the block).
const FILES = {
  "creatures.json": { option: "creatures", inline: "line" },
  "reference.json": { option: "reference", inline: "list" },
  "creature-exp.json": { option: "creatureExp", inline: "line" },
};
const DATA_CALL = /__BTL_DATA__\("([^"]+)"\)/g;
// A line that holds only a stylesheet include, with its line ending: the file's text takes the whole line's place.
const INCLUDE = /^\{\{src\/([^{}]+\.css)\}\}\r?\n/gm;
const BUNDLE = /^\{\{src\/main\.js\}\}\r?\n/m;

function readData(name) { return JSON.parse(fs.readFileSync(path.join(DATA_DIR, name), "utf8")); }

// The data files' own layout, one record per line so diffs stay readable.
function formatList(list) { return "[\n" + list.map((x) => JSON.stringify(x)).join(",\n") + "\n]\n"; }
function formatMap(obj) { return "{\n" + Object.keys(obj).map((k) => JSON.stringify(k) + ": " + JSON.stringify(obj[k])).join(",\n") + "\n}\n"; }

function literal(value, inline) {
  if (inline === "line" || !Array.isArray(value) || !value.length) return JSON.stringify(value);
  return "[\n" + value.map((x) => "  " + JSON.stringify(x)).join(",\n") + "\n]";
}

// src/index.html with its stylesheet includes expanded, in the order the lines appear.
function joinSources(html) {
  const seen = {};
  return html.replace(INCLUDE, (m, rel) => {
    if (seen[rel]) throw new Error("src/index.html: {{src/" + rel + "}} appears twice");
    seen[rel] = true;
    return fs.readFileSync(path.join(ROOT, "src", rel), "utf8");
  });
}

// The esbuild bundle of src/main.js, before the data goes in. Built once per process.
let bundled = null;
function bundle() {
  if (bundled) return bundled;
  const r = esbuild.buildSync({ entryPoints: [ENTRY], bundle: true, format: "iife", target: "es2017", charset: "utf8", write: false, logLevel: "silent" });
  bundled = r.outputFiles[0].text;
  return bundled;
}

function assemble(opts) {
  opts = opts || {};
  const html = joinSources(fs.readFileSync(SRC, "utf8")), seen = {};
  const js = bundle().replace(DATA_CALL, (m, name) => {
    const f = FILES[name];
    if (!f) throw new Error("src/data/index.js: no data file " + name + " (known: " + Object.keys(FILES).join(", ") + ")");
    if (seen[name]) throw new Error("the bundle has " + m + " twice");
    seen[name] = true;
    return literal(opts[f.option] !== undefined ? opts[f.option] : readData(name), f.inline);
  });
  Object.keys(FILES).forEach((n) => { if (!seen[n]) throw new Error("the bundle has no __BTL_DATA__(\"" + n + "\")"); });
  if (/<\/script/i.test(js)) throw new Error("the bundle contains </script, which would end the inline script early");
  if (!BUNDLE.test(html)) throw new Error("src/index.html has no {{src/main.js}} line");
  return html.replace(BUNDLE, () => js);
}

if (require.main === module) {
  const html = assemble();
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, html);
  console.log("Wrote dist/index.html (" + Math.round(Buffer.byteLength(html) / 1024) + " KB)");
}

module.exports = { assemble, joinSources, readData, formatList, formatMap, FILES, DATA_DIR, OUT };
