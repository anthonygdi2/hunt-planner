// The layer rule (docs/ARCHITECTURE.md): imports only point down ui → app → core → data and app → store, and core/
// and store/ don't reach for the browser, storage or the clock. Parses every module under src/ (src/legacy/ is exempt
// until it's gone) and checks its imports and global references. Run: node --test tests/layers.test.js
"use strict";
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const acorn = require("acorn");
const walk = require("acorn-walk");

const SRC = path.join(__dirname, "..", "src");

// What each layer may import: layer names, or "core/text.js" for that one file.
const ALLOWED = {
  data: ["data"],
  core: ["core", "data"],
  store: ["store", "data"],
  app: ["app", "core", "store", "data"],
  ui: ["ui", "app", "core/text.js"],
  main: ["main", "ui", "app", "core", "store", "data", "legacy"],
};
// Globals a layer must not use. "Date.now", "new Date()" (no arguments), "Date()" and "Math.random" are checked as
// expressions; the rest as plain identifiers. store/ gets its host objects (window.claude, localStorage) as
// parameters from main.js, so it can be tested with in-memory fakes.
const BROWSER = ["document", "window", "globalThis", "self", "localStorage", "sessionStorage", "navigator", "location"];
const CLOCK = ["Date.now", "new Date()", "Date()"];
const FORBIDDEN = {
  core: BROWSER.concat(CLOCK, ["Math.random", "fetch", "setTimeout", "setInterval", "clearTimeout", "clearInterval", "requestAnimationFrame", "queueMicrotask", "performance"]),
  store: BROWSER.concat(CLOCK),
};

function layerOf(rel) {
  const parts = rel.split("/");
  return parts.length === 1 ? (parts[0] === "main.js" ? "main" : null) : parts[0];
}

// Problems with one module's source: imports its layer may not make, and forbidden globals it uses.
function check(rel, code) {
  const layer = layerOf(rel), problems = [];
  let ast;
  try { ast = acorn.parse(code, { ecmaVersion: "latest", sourceType: "module", locations: true }); }
  catch (e) { return [rel + ": doesn't parse as a module: " + e.message]; }
  const at = (n) => rel + ":" + n.loc.start.line;
  const allowed = ALLOWED[layer] || [];
  const imp = (node, spec) => {
    if (typeof spec !== "string") { problems.push(at(node) + ": dynamic import of a computed path"); return; }
    if (!spec.startsWith(".")) { problems.push(at(node) + ": imports package " + spec + " (the app has no runtime dependencies)"); return; }
    const target = path.posix.normalize(path.posix.join(path.posix.dirname(rel), spec));
    if (target.startsWith("..")) { problems.push(at(node) + ": imports " + spec + ", outside src/"); return; }
    const tl = layerOf(target);
    if (!allowed.includes(tl) && !allowed.includes(target)) problems.push(at(node) + ": " + layer + "/ may not import " + target);
  };
  walk.full(ast, (n) => {
    if (n.type === "ImportDeclaration" || n.type === "ExportAllDeclaration" || (n.type === "ExportNamedDeclaration" && n.source)) imp(n, n.source.value);
    if (n.type === "ImportExpression") imp(n, n.source.type === "Literal" ? n.source.value : null);
  });
  const banned = FORBIDDEN[layer];
  if (!banned) return problems;
  const declared = new Set();
  const collect = (p) => {
    if (!p) return;
    if (p.type === "Identifier") declared.add(p.name);
    else if (p.type === "ObjectPattern") p.properties.forEach((q) => collect(q.value || q.argument));
    else if (p.type === "ArrayPattern") p.elements.forEach(collect);
    else if (p.type === "AssignmentPattern") collect(p.left);
    else if (p.type === "RestElement") collect(p.argument);
  };
  walk.full(ast, (n) => {
    if (n.type === "VariableDeclarator") collect(n.id);
    else if (/Function/.test(n.type)) { if (n.id) declared.add(n.id.name); n.params.forEach(collect); }
    else if (n.type === "CatchClause") collect(n.param);
    else if (n.type === "ImportSpecifier" || n.type === "ImportDefaultSpecifier" || n.type === "ImportNamespaceSpecifier") declared.add(n.local.name);
    else if (n.type === "ClassDeclaration" && n.id) declared.add(n.id.name);
  });
  const use = (n, what) => { if (banned.includes(what)) problems.push(at(n) + ": " + layer + "/ may not use " + what); };
  walk.ancestor(ast, {
    Identifier(n, anc) {
      const parent = anc[anc.length - 2];
      if (declared.has(n.name)) return;
      if (parent && parent.type === "MemberExpression" && parent.property === n && !parent.computed) return;
      if (parent && (parent.type === "Property" || parent.type === "MethodDefinition" || parent.type === "PropertyDefinition") && parent.key === n && !parent.computed && !parent.shorthand) return;
      if (parent && /Label|ExportSpecifier|ImportSpecifier/.test(parent.type)) return;
      use(n, n.name);
    },
    MemberExpression(n) {
      if (n.object.type === "Identifier" && !n.computed && !declared.has(n.object.name)) use(n, n.object.name + "." + n.property.name);
    },
    NewExpression(n) { if (n.callee.type === "Identifier" && n.callee.name === "Date" && !n.arguments.length && !declared.has("Date")) use(n, "new Date()"); },
    CallExpression(n) { if (n.callee.type === "Identifier" && n.callee.name === "Date" && !declared.has("Date")) use(n, "Date()"); },
  });
  return problems;
}

function modules(dir, rel) {
  let out = [];
  fs.readdirSync(dir, { withFileTypes: true }).forEach((e) => {
    const r = rel ? rel + "/" + e.name : e.name;
    if (e.isDirectory()) { if (r !== "legacy") out = out.concat(modules(path.join(dir, e.name), r)); }
    else if (/\.m?js$/.test(e.name)) out.push(r);
  });
  return out;
}

test("every module under src/ follows the layer rule", () => {
  const files = modules(SRC, "");
  assert.ok(files.includes("main.js"), "found src/main.js");
  const problems = [];
  files.forEach((rel) => {
    if (!layerOf(rel) || !ALLOWED[layerOf(rel)]) { problems.push(rel + ": not in a known layer folder"); return; }
    problems.push(...check(rel, fs.readFileSync(path.join(SRC, rel), "utf8")));
  });
  assert.deepStrictEqual(problems, []);
});

test("the checker catches what it should", () => {
  assert.deepStrictEqual(check("core/a.js", 'import { x } from "../store/db.js";'), ["core/a.js:1: core/ may not import store/db.js"]);
  assert.deepStrictEqual(check("ui/a.js", 'import { norm } from "../core/text.js";\nimport { s } from "../core/score.js";'), ["ui/a.js:2: ui/ may not import core/score.js"]);
  assert.deepStrictEqual(check("core/a.js", 'import x from "lodash";'), ["core/a.js:1: imports package lodash (the app has no runtime dependencies)"]);
  assert.deepStrictEqual(check("core/a.js", "export const f = () => Date.now();"), ["core/a.js:1: core/ may not use Date.now"]);
  assert.deepStrictEqual(check("core/a.js", "export const f = () => new Date();"), ["core/a.js:1: core/ may not use new Date()"]);
  assert.deepStrictEqual(check("store/a.js", "export const f = () => localStorage.getItem('x');"), ["store/a.js:1: store/ may not use localStorage"]);
  assert.deepStrictEqual(check("core/a.js", "export const f = () => setTimeout(g, 1);\nfunction g() {}"), ["core/a.js:1: core/ may not use setTimeout"]);
  assert.deepStrictEqual(check("core/a.js", "export const f = (t) => new Date(t).getUTCDay() + Math.random();"), ["core/a.js:1: core/ may not use Math.random"]);
  // Property names, parameters and locals with these names are fine.
  assert.deepStrictEqual(check("core/a.js", "export function f(window, o) { const document = o.document; return { window, document, now: o.now }; }"), []);
  assert.deepStrictEqual(check("store/a.js", "export const f = () => setTimeout(() => {}, 1);"), []);
});
