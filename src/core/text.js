// Names, slugs, number parsing and formatting. Pure; the UI may import this module directly.

// Lowercase letters and digits only: the key creature names are matched by ("Knight's Apparition" → "knightsapparition").
export const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
// URL-style slug: "Knight's Apparition" → "knight-s-apparition".
export const slugify = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

// A number as players type it: "1,234", "12.5k", "1.2kk", "3m", "800k/h". Null for blank, NaN for anything else;
// rounded to an integer.
export function parseNum(s) {
  s = String(s).trim().toLowerCase().replace(/[,\s]/g, "").replace(/\/h$/, "");
  if (!s) return null;
  const m = s.match(/^(-?)(\d+\.?\d*|\.\d+)(kk|k|m)?$/);
  if (!m) return NaN;
  let v = parseFloat(m[2]);
  if (m[3] === "k") v *= 1e3; else if (m[3] === "kk" || m[3] === "m") v *= 1e6;
  return Math.round(m[1] ? -v : v);
}
// The first integer in a string, ignoring thousands separators: "1,234 xp" → 1234. Null when there is none.
export function toInt(v) { const m = String(v).match(/-?\d[\d,.]*/); return m ? parseInt(m[0].replace(/[,.]/g, ""), 10) : null; }

const trim2 = (x) => String(Math.round(x * 100) / 100);
// Big amounts in Tibia's shorthand: 1234 → "1234", 12345 → "12.35k", 1234567 → "1.23kk". "" for null.
export function fmtBig(v) {
  if (v == null) return "";
  const a = Math.abs(v), sign = v < 0 ? "-" : "";
  if (a >= 1e6) return sign + trim2(a / 1e6) + "kk";
  if (a >= 1e4) return sign + trim2(a / 1e3) + "k";
  return sign + String(Math.round(a));
}
// Small amounts with up to two decimals, fewer as they grow: 3.14159 → "3.14", 31.4 → "31.4", 314.2 → "314".
export function fmtSmall(v) { return v == null ? "" : (Math.abs(v) >= 100 ? String(Math.round(v)) : Math.abs(v) >= 10 ? String(Math.round(v * 10) / 10) : trim2(v)); }
// A creature number field as shown in its input: kills/h plain, exp and profit in shorthand.
export function fmtField(k, v) { return v == null ? "" : (k === "kph" ? String(v) : fmtBig(v)); }
// Hours as "45 min", "2 h" or "1 h 30 min". "" for null or non-finite.
export function fmtHours(h) {
  if (h == null || !isFinite(h)) return "";
  const mins = Math.round(h * 60);
  return mins < 60 ? mins + " min" : Math.floor(mins / 60) + " h" + (mins % 60 ? " " + (mins % 60) + " min" : "");
}
// A fraction as a percentage, one decimal below 10%: 0.25 → "25%", 0.034 → "3.4%".
export function pct(p) { return (p * 100 >= 10 ? Math.round(p * 100) : Math.round(p * 1000) / 10) + "%"; }
// "a", "a and b", "a, b and c".
export function joinAnd(a) { return a.length < 2 ? a.join("") : a.slice(0, -1).join(", ") + " and " + a[a.length - 1]; }
// "1 spot", "2 spots", or a given plural.
export function plural(n, one, many) { return n + " " + (n === 1 ? one : (many || one + "s")); }
