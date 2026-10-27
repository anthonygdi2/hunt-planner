// The language the screens show: one translator for the whole app, switched by the Language setting. View models and
// screens call t(...) from here; core code gets a translator passed in (core/i18n.js).
import { makeT, EN } from "../core/i18n.js";

let cur = EN;
export const t = (s, p) => cur(s, p);
t.n = (n, one, other, p) => cur.n(n, one, other, p);
t.and = (a) => cur.and(a);
export { _ } from "../core/i18n.js";
// The translator itself (for core functions that take one), and the current language and locale.
export const translator = () => cur;
export function setLang(lang) { if (cur.lang !== lang) cur = makeT(lang); }
export const lang = () => cur.lang;
export const locale = () => cur.locale;
