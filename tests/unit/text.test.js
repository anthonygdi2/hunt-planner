import test from "node:test";
import assert from "node:assert/strict";
import { norm, slugify, parseNum, toInt, fmtBig, fmtSmall, fmtField, fmtHours, pct, joinAnd, plural } from "../../src/core/text.js";

test("norm and slugify", () => {
  assert.equal(norm("Knight's Apparition"), "knightsapparition");
  assert.equal(slugify("Knight's Apparition"), "knight-s-apparition");
  assert.equal(slugify("  -Iks Churrascan- "), "iks-churrascan");
  assert.equal(norm(""), "");
});

test("parseNum reads what players type", () => {
  assert.equal(parseNum("1,234"), 1234);
  assert.equal(parseNum("12.5k"), 12500);
  assert.equal(parseNum("1.2kk"), 1200000);
  assert.equal(parseNum("3m"), 3000000);
  assert.equal(parseNum("800k/h"), 800000);
  assert.equal(parseNum("-2k"), -2000);
  assert.equal(parseNum(".5k"), 500);
  assert.equal(parseNum(""), null);
  assert.equal(parseNum("   "), null);
  assert.ok(Number.isNaN(parseNum("abc")));
  assert.ok(Number.isNaN(parseNum("1k2")));
});

test("toInt takes the first integer", () => {
  assert.equal(toInt("1,234 xp"), 1234);
  assert.equal(toInt("Balance: -5.000"), -5000);
  assert.equal(toInt("none"), null);
});

test("fmtBig, fmtSmall, fmtField", () => {
  assert.equal(fmtBig(null), "");
  assert.equal(fmtBig(1234), "1234");
  assert.equal(fmtBig(12345), "12.35k");
  assert.equal(fmtBig(1234567), "1.23kk");
  assert.equal(fmtBig(-25000), "-25k");
  assert.equal(fmtSmall(3.14159), "3.14");
  assert.equal(fmtSmall(31.44), "31.4");
  assert.equal(fmtSmall(314.2), "314");
  assert.equal(fmtSmall(undefined), "");
  assert.equal(fmtField("kph", 120), "120");
  assert.equal(fmtField("xph", 2500000), "2.5kk");
  assert.equal(fmtField("pph", null), "");
});

test("fmtHours", () => {
  assert.equal(fmtHours(0.75), "45 min");
  assert.equal(fmtHours(2), "2 h");
  assert.equal(fmtHours(1.5), "1 h 30 min");
  assert.equal(fmtHours(null), "");
  assert.equal(fmtHours(Infinity), "");
});

test("pct, joinAnd, plural", () => {
  assert.equal(pct(0.25), "25%");
  assert.equal(pct(0.034), "3.4%");
  assert.equal(joinAnd([]), "");
  assert.equal(joinAnd(["a"]), "a");
  assert.equal(joinAnd(["a", "b", "c"]), "a, b and c");
  assert.equal(plural(1, "spot"), "1 spot");
  assert.equal(plural(2, "spot"), "2 spots");
  assert.equal(plural(2, "family", "families"), "2 families");
});
