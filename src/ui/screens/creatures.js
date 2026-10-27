// Creatures (was the Classic view): tiers S–D and Avoid, or a table, for one task difficulty and the goal mix; search;
// each creature opens its page. Below, the Preferred and Unwanted lists open inline with board odds and suggestions.
import { h } from "../dom.js";
import { segmented, badges } from "../components.js";

// A creature as a chip: name, then its markers (bounty, Preferred ★, Unwanted ⊘, a level it needs).
function chip(c, on) {
  return h("a", { href: "#/creature/" + c.slug, class: "hp-cchip" + (c.bounty ? " bounty" : "") + (c.locked ? " locked" : ""), "aria-label": c.label,
    onClick: (e) => { e.preventDefault(); on.open(c.slug); } },
    c.preferred ? h("span", { class: "hp-mark pref", "aria-hidden": "true" }, "★") : null,
    c.unwanted ? h("span", { class: "hp-mark unw", "aria-hidden": "true" }, "⊘") : null,
    c.name,
    c.bounty ? h("span", { class: "hp-cchip-note", "aria-hidden": "true" }, " · " + (c.bounty === "bounty" ? "bounty" : c.bounty)) : null,
    c.locked ? h("span", { class: "hp-cchip-note", "aria-hidden": "true" }, " · " + c.locked + "+") : null);
}

// The Preferred / Unwanted editor. v: app/views.js slotsView. on: {open(slug), slot(which, slug, on), type(which, text)}.
function listsEditor(v, on) {
  const list = (l) => h("section", { class: "hp-card", "aria-labelledby": "list-" + l.which },
    h("h3", { id: "list-" + l.which, class: "hp-panel-title" }, l.title),
    h("ol", { class: "hp-slots" },
      l.rows.map((r) => h("li", null,
        h("span", null, h("button", { type: "button", class: "hp-linkbtn", onClick: () => on.open(r.slug) }, r.name), h("br"),
          h("span", { class: "hp-caption" + (r.warn ? " warn" : "") }, r.why)),
        h("button", { id: "list-" + l.which + "-rm-" + r.slug, type: "button", class: "hp-iconbtn small", "aria-label": "Remove " + r.name, onClick: () => on.slot(l.which, r.slug, false) }, "✕"))),
      Array.from({ length: l.empty }, () => h("li", { class: "hp-slot-empty" }, "Empty slot"))),
    l.full ? null : h("label", { class: "hp-field" }, "Add a creature",
      h("input", { id: "list-" + l.which + "-add", class: "hp-input", value: l.typed, autocomplete: "off", placeholder: "Type a name", onInput: (e) => on.type(l.which, e.target.value) })),
    l.matches.length ? h("div", { class: "hp-suggest", role: "group", "aria-label": "Matching creatures" },
      l.matches.map((m) => h("button", { type: "button", class: "hp-btn", onClick: () => on.slot(l.which, m.slug, true) }, m.name))) : null,
    h("div", { class: "hp-suggest", role: "group", "aria-label": "Suggestions for " + l.title },
      l.suggestions.length ? l.suggestions.map((s) => h("button", { id: "list-" + l.which + "-sug-" + s.slug, type: "button", class: "hp-btn dashed", onClick: () => on.slot(l.which, s.slug, true) },
        "+ " + s.name + " ", h("span", { class: "hp-caption" }, s.why))) : h("span", { class: "hp-caption" }, l.none)));
  return h("section", { id: "lists-editor", class: "hp-editor", "aria-label": "Preferred and Unwanted lists" },
    list(v.preferred), list(v.unwanted),
    h("div", { class: "hp-card", role: "status" }, h("b", null, "Board odds"), v.odds.map((t) => h("p", { class: "hp-p hp-small" }, t)), h("span", { class: "hp-caption" }, v.note)));
}

// view: app/views.js creaturesView. on: {difficulty(d), mode(m), query(text), open(slug), lists(open), slot(which, slug,
// on), type(which, text)}.
export function render(view, on) {
  return h("div", { class: "hp-section" },
    h("div", { class: "hp-spot-title" }, h("h1", { class: "hp-title" }, "Creatures"), h("span", { class: "hp-caption" }, view.sub)),
    segmented({ label: "Task difficulty", options: view.difficulties, value: view.difficulty, onPick: on.difficulty }),
    segmented({ label: "View", options: [{ value: "tiers", label: "Tiers" }, { value: "table", label: "Table" }], value: view.mode, onPick: on.mode }),
    h("input", { id: "cr-q", type: "search", class: "hp-input", "aria-label": "Search creatures", placeholder: "Search creatures", value: view.query, autocomplete: "off", onInput: (e) => on.query(e.target.value) }),
    view.empty ? h("p", { class: "hp-p hp-muted" }, view.empty) : null,
    view.mode === "tiers" ? h("div", { class: "hp-tiers" },
      view.tiers.map((t) => h("div", { class: "hp-tier-row", role: "group", "aria-label": t.label },
        h("span", { class: "hp-tier " + t.id, "aria-hidden": "true" }, t.id === "X" ? "AVOID" : t.id),
        h("div", { class: "hp-chips" }, t.items.length ? t.items.map((c) => chip(c, on)) : h("span", { class: "hp-caption" }, "None")))),
      view.unscored.length ? h("details", { class: "hp-card" }, h("summary", null, view.unscoredText), h("div", { class: "hp-chips" }, view.unscored.map((c) => chip(c, on)))) : null)
      : h("div", { class: "hp-table-wrap" }, h("table", { class: "hp-table" },
        h("thead", null, h("tr", null, ["Creature", "Tier", "Best spot", "Exp/h", "Profit/h", "Source"].map((x, i) => h("th", { scope: "col", class: i > 2 && i < 5 ? "num" : null }, x)))),
        h("tbody", null, view.table.map((c) => h("tr", null,
          h("th", { scope: "row" }, h("a", { href: "#/creature/" + c.slug, onClick: (e) => { e.preventDefault(); on.open(c.slug); } }, c.name)),
          h("td", null, c.avoid ? "Avoid" : c.tier ? c.tier + " " + c.score : "–"), h("td", null, c.spot),
          h("td", { class: "num" }, c.exp), h("td", { class: "num" }, c.profit), h("td", null, c.badge ? badges([c.badge]) : "–")))))),
    h("div", { class: "hp-card" }, h("b", null, "Preferred and unwanted"),
      h("span", { class: "hp-small hp-muted" }, "Your in-game lists."),
      h("button", { id: "cr-lists", type: "button", class: "hp-btn", "aria-expanded": view.lists ? "true" : "false", "aria-controls": "lists-editor", onClick: () => on.lists(!view.lists) },
        view.lists ? "Close the lists" : "Edit the lists")),
    view.lists ? listsEditor(view.lists, on) : null);
}
