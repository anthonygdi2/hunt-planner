import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { makeT, pickLang, fill, LOCALES } from "../../src/core/i18n.js";

const require = createRequire(import.meta.url);
const { usedStrings, catalog, holes, LANGS } = require("../../tools/i18n.js");

test("the translator: placeholders, plurals by language, English for anything missing", () => {
  assert.equal(fill("{n} spots, {x}", { n: 3 }), "3 spots, {x}");
  const en = makeT("en");
  assert.equal(en("Search"), "Search");
  assert.equal(en.n(1, "{n} hunt", "{n} hunts"), "1 hunt");
  assert.equal(en.n(2, "{n} hunt", "{n} hunts"), "2 hunts");
  assert.equal(en.and(["a", "b", "c"]), "a, b and c");
  assert.equal(makeT("xx").lang, "en");
  assert.equal(makeT("pl")("Some text nobody translated"), "Some text nobody translated");
  assert.deepEqual([pickLang("pl", "es-AR"), pickLang(null, "pt-BR"), pickLang(null, "es"), pickLang(null, "de-DE"), pickLang("xx", undefined)], ["pl", "pt", "es", "en", "en"]);
});

test("every catalog has every string, with the same placeholders and its language's plural forms", () => {
  const used = usedStrings();
  assert.ok(used.size > 200, "the strings are found in src/");
  LANGS.forEach((lang) => {
    const cat = catalog(lang), cats = new Intl.PluralRules(LOCALES[lang]).resolvedOptions().pluralCategories;
    const missing = [...used.keys()].filter((k) => !(k in cat));
    assert.deepEqual(missing, [], lang + ": missing translations (node tools/i18n.js --missing)");
    assert.deepEqual(Object.keys(cat).filter((k) => !used.has(k)), [], lang + ": translations the code no longer uses");
    used.forEach((e, k) => {
      const v = cat[k], allowed = holes(k);
      if (e.plural) holes(e.other).forEach((h) => allowed.add(h));
      // A vocation is passed both with its English article ({aVoc}) and bare ({voc}).
      if (allowed.has("aVoc")) allowed.add("voc");
      if (e.plural) {
        assert.equal(typeof v, "object", lang + ": " + k + " needs plural forms");
        cats.forEach((c) => assert.equal(typeof v[c], "string", lang + ": " + k + " needs the " + c + " form"));
        Object.values(v).forEach((form) => holes(form).forEach((h) => assert.ok(allowed.has(h), lang + ": " + k + " uses {" + h + "}")));
      } else {
        assert.equal(typeof v, "string", lang + ": " + k + " should be a string");
        holes(v).forEach((h) => assert.ok(allowed.has(h), lang + ": " + k + " uses {" + h + "}"));
      }
    });
  });
});
