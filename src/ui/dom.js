// A small element builder. h("button", {class: "hp-btn", onClick: fn, "aria-pressed": "true"}, "Text", child...)
// Props: class, text, html is not supported (text only); on<Event> handlers; value, checked, disabled, hidden, selected,
// type and other DOM properties when they exist on the element; everything else as an attribute (null/false skips it).
export function h(tag, props, ...children) {
  const el = document.createElement(tag);
  Object.keys(props || {}).forEach((k) => {
    const v = props[k];
    if (v == null || v === false) return;
    if (k === "class") el.className = v;
    else if (k === "text") el.textContent = v;
    else if (/^on[A-Z]/.test(k)) el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === "value" || k === "checked" || k === "disabled" || k === "hidden" || k === "selected") el[k] = v;
    else el.setAttribute(k, v === true ? "" : String(v));
  });
  children.flat(Infinity).forEach((c) => { if (c == null || c === false) return; el.appendChild(typeof c === "string" || typeof c === "number" ? document.createTextNode(String(c)) : c); });
  return el;
}

// Re-renders root's contents with render(), keeping the focused control (by id) and its caret.
export function rerender(root, render) {
  const a = root.ownerDocument.activeElement, id = a && root.contains(a) ? a.id : null;
  const sel = id && typeof a.selectionStart === "number" ? [a.selectionStart, a.selectionEnd] : null;
  root.replaceChildren(render());
  if (!id) return;
  const b = root.ownerDocument.getElementById(id);
  if (!b) return;
  b.focus();
  if (sel && typeof b.setSelectionRange === "function") { try { b.setSelectionRange(sel[0], sel[1]); } catch (e) { /* not a text field */ } }
}

// Icons (24px stroke icons from the design).
const ICONS = {
  plan: "M9 6h11M9 12h11M9 18h11 M4 6h1M4 12h1M4 18h1",
  spots: "M12 21s-7-6.2-7-11a7 7 0 1 1 14 0c0 4.8-7 11-7 11z",
  creatures: "M4 5h16M4 10h12M4 15h8M4 20h4",
  weekly: "M3 10h18M8 3v4M16 3v4",
  back: "M15 5l-7 7 7 7",
  plus: "M12 5v14M5 12h14",
  settings: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z",
};
export function icon(name, size) {
  const NS = "http://www.w3.org/2000/svg", s = document.createElementNS(NS, "svg"), p = document.createElementNS(NS, "path");
  [["aria-hidden", "true"], ["width", size || 22], ["height", size || 22], ["viewBox", "0 0 24 24"], ["fill", "none"], ["stroke", "currentColor"], ["stroke-width", "2"],
    ["stroke-linecap", "round"], ["stroke-linejoin", "round"]].forEach(([k, v]) => s.setAttribute(k, String(v)));
  p.setAttribute("d", ICONS[name]);
  s.appendChild(p);
  if (name === "weekly") { const r = document.createElementNS(NS, "rect"); [["x", 3], ["y", 5], ["width", 18], ["height", 16], ["rx", 2]].forEach(([k, v]) => r.setAttribute(k, String(v))); s.appendChild(r); }
  if (name === "spots") { const c = document.createElementNS(NS, "circle"); [["cx", 12], ["cy", 10], ["r", 2.5]].forEach(([k, v]) => c.setAttribute(k, String(v))); s.appendChild(c); }
  return s;
}
