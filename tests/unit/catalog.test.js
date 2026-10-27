import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { makeCatalog, poolBits, creatureInPool, poolsOf, topPool } from "../../src/core/catalog.js";

const SAMPLE = [
  { n: "Rat", c: "E", m: 3 },
  { n: "Cobra Assassin", c: "H", m: 12 },
  { n: "Gorerilla", c: "C", m: 8 },
  { n: "Grim Reaper", c: "H", m: 12, w: "Grim Reaper (Creature)" },
  { n: "Werebear", c: "M", m: 6, r: 1 },
  { n: "Ghost Wolf", c: "M", m: 0 },
];

test("lookup by slug and by name", () => {
  const cat = makeCatalog(SAMPLE);
  assert.equal(cat.list.length, 6);
  assert.equal(cat.bySlug["cobra-assassin"].name, "Cobra Assassin");
  assert.equal(cat.byName.cobraassassin.slug, "cobra-assassin");
  assert.deepEqual(cat.list[1], { name: "Cobra Assassin", key: "cobraassassin", slug: "cobra-assassin", cls: "H", m: 12, w: undefined, r: undefined, tier: undefined });
  assert.equal(cat.bySlug.werebear.r, 1);
  assert.equal(cat.bySlug["no-such-thing"], undefined);
});

test("the wiki title is a second name, unless a creature already has it", () => {
  const cat = makeCatalog(SAMPLE.concat([{ n: "Wolf", c: "E", m: 1, w: "Rat" }]));
  assert.equal(cat.byName.grimreaper.name, "Grim Reaper");
  assert.equal(cat.byName.rat.name, "Rat");
});

test("pools", () => {
  const cat = makeCatalog(SAMPLE);
  assert.equal(poolBits("all"), 15);
  assert.equal(poolBits("expert"), 4);
  assert.equal(poolBits("nonsense"), 0);
  assert.deepEqual(cat.poolOf("master").map((c) => c.slug), ["cobra-assassin", "gorerilla", "grim-reaper"]);
  assert.deepEqual(cat.poolOf("all").map((c) => c.slug), ["rat", "cobra-assassin", "gorerilla", "grim-reaper", "werebear"]);
  assert.equal(cat.inPool("rat", "adept"), true);
  assert.equal(cat.inPool("rat", "expert"), false);
  assert.equal(cat.inPool("unknown", "all"), false);
  assert.equal(creatureInPool(null, "all"), false);
  assert.deepEqual(poolsOf(cat.bySlug.werebear), ["adept", "expert"]);
  assert.deepEqual(poolsOf(cat.bySlug["ghost-wolf"]), []);
  assert.equal(topPool(cat.bySlug.rat), "adept");
  assert.equal(topPool(cat.bySlug.gorerilla), "master");
});

test("keys for logged kills and typed names", () => {
  const cat = makeCatalog(SAMPLE);
  assert.equal(cat.killKey({ slug: "rat", name: "rat" }), "rat");
  assert.equal(cat.killKey({ slug: "gone", name: "Old Thing" }), "n:oldthing");
  assert.equal(cat.killKey({ name: "Rat" }), "n:rat", "a kill without a slug wasn't matched when it was saved");
  assert.equal(cat.nameKey("cobra assassin"), "cobra-assassin");
  assert.equal(cat.nameKey("Grim Reaper (Creature)"), "n:grimreapercreature");
  assert.equal(cat.nameKey(""), "n:");
});

test("the real creature list: pool sizes as PROJECT_CONTEXT records them", () => {
  const cat = makeCatalog(JSON.parse(fs.readFileSync(new URL("../../src/data/creatures.json", import.meta.url), "utf8")));
  assert.equal(cat.list.length, 730);
  assert.deepEqual(["beginner", "adept", "expert", "master"].map((d) => cat.poolOf(d).length), [153, 450, 498, 280]);
  assert.equal(new Set(cat.list.map((c) => c.slug)).size, 730);
});
