// Spots: search, sort, the lens toggles, "Log a clean hunt at a new spot", every spot that fits with its score,
// numbers, creatures and badges, and what the badges mean.
import { h, icon } from "../dom.js";
import { segmented } from "../components.js";

// view: app/views.js spotsView. on: {query(text), sort(key), toggle(key, on), open(id), logNew(), more()}.
export function render(view, on) {
  return h("div", { class: "hp-section" },
    h("h1", { class: "hp-title" }, "Spots"),
    h("label", { class: "hp-field" }, "Search",
      h("input", { id: "spots-q", type: "search", class: "hp-input", placeholder: "Spot or creature", value: view.query, autocomplete: "off", onInput: (e) => on.query(e.target.value) })),
    segmented({ label: "Sort by", options: view.sorts, value: view.sort, onPick: on.sort }),
    h("div", { class: "hp-toggles" }, view.toggles.map((t) =>
      h("button", { id: "spots-" + t.key, type: "button", class: "hp-toggle", "aria-pressed": t.on ? "true" : "false", onClick: () => on.toggle(t.key, !t.on) }, t.label))),
    h("p", { id: "spots-count", class: "hp-p hp-caption", role: "status" }, view.count),
    h("a", { id: "spots-log", href: "#/log", class: "hp-dashed", onClick: (e) => { e.preventDefault(); on.logNew(); } }, icon("plus", 18), "Log a clean hunt at a new spot"),
    view.empty ? h("p", { class: "hp-p hp-muted" }, view.empty) : null,
    h("ul", { class: "hp-spots" }, view.rows.map((r) => h("li", null,
      h("a", { href: "#/spot/" + encodeURIComponent(r.id), class: "hp-spot" + (r.taken ? " taken" : ""), onClick: (e) => { e.preventDefault(); on.open(r.id); } },
        h("span", { class: "hp-spot-head" },
          h("span", { class: "hp-spot-name" }, h("b", null, r.name), r.sub ? h("span", { class: "hp-caption" }, r.sub) : null),
          r.score != null ? h("span", { class: "hp-spot-score", "aria-label": "Score " + r.score }, r.score) : h("span", { class: "hp-caption" }, "No score")),
        r.numbers ? h("span", { class: r.taken ? "hp-muted" : null }, r.numbers) : h("span", { class: "hp-muted hp-none" }, r.none),
        r.creatures ? h("span", { class: "hp-small hp-muted" }, r.creatures) : null,
        r.taken || r.badges.length ? h("span", { class: "hp-badges" }, r.taken ? h("span", { class: "hp-badge taken" }, r.taken) : null,
          r.badges.map((b) => h("span", { class: "hp-badge " + b.kind }, b.text))) : null)))),
    view.more ? h("button", { id: "spots-more", type: "button", class: "hp-btn", onClick: on.more }, "Show " + view.more + " more") : null,
    h("details", { class: "hp-card hp-legend" }, h("summary", null, h("b", null, "What the badges mean")),
      h("ul", { class: "hp-legend-list" }, view.legend.map((l) => h("li", null, h("b", { class: "hp-legend-name " + l.kind }, l.name), ": " + l.text)))));
}
