#!/usr/bin/env node
// The translatable strings in src/ and how each language's catalog (src/data/i18n/<lang>.js) covers them.
// A string is translatable when it's the literal first argument of t(...) or _(...), or the "one" and "other"
// arguments of t.n(count, one, other) (the catalog keys a plural by its "one" form).
//   node tools/i18n.js            per language: how many strings, which are missing, which the code no longer uses
//   node tools/i18n.js --missing  the missing strings as a JSON object to fill in, per language
// From tests: require("./tools/i18n.js").usedStrings() and .catalog(lang).
"use strict";
const fs = require("fs");
const path = require("path");
const acorn = require("acorn");
const walk = require("acorn-walk");

const ROOT = path.join(__dirname, "..");
const LANGS = ["es", "pt", "pl"];

const files = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
  const p = path.join(dir, e.name);
  return e.isDirectory() ? (p.endsWith(path.join("data", "i18n")) ? [] : files(p)) : p.endsWith(".js") ? [p] : [];
});

// Map English text → {plural, other, files}.
function usedStrings() {
  const out = new Map();
  const add = (s, file, plural, other) => {
    const e = out.get(s) || { plural: false, other: null, files: new Set() };
    if (plural) { e.plural = true; e.other = other; }
    e.files.add(path.relative(ROOT, file).replace(/\\/g, "/"));
    out.set(s, e);
  };
  files(path.join(ROOT, "src")).forEach((file) => {
    const ast = acorn.parse(fs.readFileSync(file, "utf8"), { ecmaVersion: "latest", sourceType: "module" });
    walk.simple(ast, { CallExpression(node) {
      const c = node.callee, a = node.arguments, lit = (x) => x && x.type === "Literal" && typeof x.value === "string";
      if (c.type === "Identifier" && (c.name === "t" || c.name === "_") && lit(a[0])) add(a[0].value, file, false);
      if (c.type === "MemberExpression" && c.object.type === "Identifier" && c.object.name === "t" && c.property.name === "n" && lit(a[1]) && lit(a[2])) add(a[1].value, file, true, a[2].value);
    } });
  });
  return out;
}

// A language's catalog, read without importing the ES module.
function catalog(lang) {
  const src = fs.readFileSync(path.join(ROOT, "src", "data", "i18n", lang + ".js"), "utf8");
  const ast = acorn.parse(src, { ecmaVersion: "latest", sourceType: "module" });
  const decl = ast.body.find((n) => n.type === "ExportDefaultDeclaration");
  return new Function("return (" + src.slice(decl.declaration.start, decl.declaration.end) + ");")();
}

// {placeholder names} in a string.
const holes = (s) => new Set((String(s).match(/\{(\w+)\}/g) || []).map((x) => x.slice(1, -1)));

if (require.main === module) {
  const used = usedStrings(), missingOnly = process.argv.includes("--missing"), report = {};
  LANGS.forEach((lang) => {
    const cat = catalog(lang), missing = {}, unused = Object.keys(cat).filter((k) => !used.has(k));
    used.forEach((e, k) => { if (!(k in cat)) missing[k] = e.plural ? { one: k, other: e.other } : k; });
    if (missingOnly) report[lang] = missing;
    else console.log(lang + ": " + used.size + " strings, " + Object.keys(missing).length + " missing, " + unused.length + " unused" + (unused.length ? ": " + unused.slice(0, 5).join(" | ") : ""));
  });
  if (missingOnly) console.log(JSON.stringify(report, null, 2));
}

module.exports = { usedStrings, catalog, holes, LANGS };
