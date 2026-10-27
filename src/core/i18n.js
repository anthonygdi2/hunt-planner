// Translating visible text. Code writes each string in English, wrapped in t("...") (or t.n(count, one, other) for
// counts, or _("...") to mark a string kept in a table and translated where it's shown); each language's catalog in
// src/data/i18n/ maps the English text to its translation, and a missing entry shows the English. Placeholders are
// {name}. Plural entries in a catalog are keyed by the English "one" form and hold the language's forms
// (Intl.PluralRules categories: one, few, many, other). Creature, spot and in-game feature names stay in English, as
// Tibia's client shows them.
import { CATALOGS } from "../data/i18n/index.js";

export const LANGS = [["en", "English"], ["es", "Español"], ["pt", "Português (Brasil)"], ["pl", "Polski"]];
export const LOCALES = { en: "en-US", es: "es-ES", pt: "pt-BR", pl: "pl-PL" };

// Marks a string for translation without translating it (for tables built once).
export const _ = (s) => s;
// Fills {name} placeholders.
export function fill(s, p) { return p ? String(s).replace(/\{(\w+)\}/g, (m, k) => (k in p ? String(p[k]) : m)) : String(s); }

// The language for a stored choice, else the browser's language, else English.
export function pickLang(stored, browser) {
  if (stored && LOCALES[stored]) return stored;
  const b = String(browser || "").toLowerCase().slice(0, 2);
  return LOCALES[b] ? b : "en";
}

// A translator for a language: t(text, params), t.n(count, one, other, params) with {n} the count, t.and(list),
// t.lang and t.locale.
export function makeT(lang) {
  if (!LOCALES[lang]) lang = "en";
  const cat = CATALOGS[lang] || {}, locale = LOCALES[lang];
  const rules = typeof Intl !== "undefined" && Intl.PluralRules ? new Intl.PluralRules(locale) : null;
  const t = (s, p) => fill(typeof cat[s] === "string" ? cat[s] : s, p);
  t.n = (n, one, other, p) => {
    const q = Object.assign({ n }, p), e = cat[one];
    if (e && typeof e === "object") return fill(e[rules ? rules.select(n) : n === 1 ? "one" : "other"] || e.other, q);
    return fill(n === 1 ? one : other, q);
  };
  // "a", "a and b", "a, b and c" in the language.
  t.and = (a) => (a.length < 2 ? a.join("") : a.slice(0, -1).join(", ") + " " + t("and") + " " + a[a.length - 1]);
  t.lang = lang;
  t.locale = locale;
  return t;
}
export const EN = makeT("en");
