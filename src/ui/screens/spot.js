// One spot: its score and numbers, Mark taken / Free again, Log a clean hunt, the creatures here, where the numbers
// come from, the character's variations of it, and the hunts logged here (delete with an inline confirm; Echo Raid
// counts in Advanced). Advanced mode also renames or deletes a spot the character made.
import { h, icon } from "../dom.js";
import { badges, confirmButton } from "../components.js";

// view: app/views.js spotView (null: no such spot). on: {back(), taken(), free(), log(), vary(), open(id),
// arm(id | "spot" | null), deleteSession(id), raid(sessionId, name, value), rename(name), deleteSpot()}.
export function render(view, on) {
  const back = h("div", null, h("a", { href: "#/spots", class: "hp-back", onClick: (e) => { e.preventDefault(); on.back(); } }, icon("back", 20), "Spots"));
  if (!view) return h("div", { class: "hp-section hp-narrow" }, back, h("p", { class: "hp-p hp-muted" }, "That spot isn’t in the list any more."));
  const section = (id, title, ...body) => h("section", { class: "hp-section", "aria-labelledby": id }, h("h2", { id, class: "hp-eyebrow" }, title), ...body);
  const src = view.sources, ref = src.reference;
  return h("div", { class: "hp-section hp-narrow" },
    back,
    h("div", { class: "hp-spot-title" },
      h("h1", { class: "hp-panel-title big" }, view.name),
      view.sub ? h("span", { class: "hp-caption" }, view.sub) : null,
      h("span", { id: "spot-score", class: "hp-muted" }, view.scoreLine)),
    h("div", { class: "hp-stats" },
      h("div", null, h("div", { class: "hp-stat" }, view.exp), h("div", { class: "hp-caption" }, "exp/h")),
      h("div", null, h("div", { class: "hp-stat" }, view.profit), h("div", { class: "hp-caption" }, "profit/h"))),
    badges(view.badges, true),
    view.taken ? h("p", { class: "hp-p hp-badges" }, h("span", { class: "hp-badge taken" }, view.taken)) : null,
    h("div", { class: "hp-grid2" },
      view.taken ? h("button", { id: "spot-free", type: "button", class: "hp-btn", onClick: on.free }, "Free again")
        : h("button", { id: "spot-taken", type: "button", class: "hp-btn", onClick: on.taken }, "Mark taken"),
      h("button", { id: "spot-log", type: "button", class: "hp-btn", onClick: on.log }, "Log a clean hunt")),
    section("cr-h", "Creatures here",
      view.creatures.length ? h("div", { class: "hp-card flush" }, view.creatures.map((c) => h("div", { class: "hp-line" },
        h("span", null, h("b", null, c.name), c.tag ? [h("br"), h("span", { class: "hp-caption" + (c.gold ? " gold" : "") }, c.tag)] : null),
        h("span", { class: "hp-muted" }, c.perHour))))
        : h("p", { class: "hp-p hp-muted" }, "No creatures known here yet.")),
    section("src-h", "Where the numbers come from",
      h("div", { class: "hp-card" },
        h("div", { class: "hp-stack" }, h("b", null, "Your hunts here"), h("span", { class: "hp-small hp-muted" }, src.hunts)),
        ref ? h("div", { class: "hp-stack hp-sep" }, h("b", null, "Reference hunt"),
          h("span", { class: "hp-small" }, ref.who, ref.url ? [" · ", h("a", { href: ref.url, target: "_blank", rel: "noopener noreferrer" }, "Watch")] : null),
          h("span", { class: "hp-small hp-muted" }, ref.recorded), h("span", { class: "hp-small hp-muted" }, ref.adjusted)) : null,
        src.skipped.length ? h("div", { class: "hp-stack hp-sep" }, h("b", null, "Other sources not used here"),
          src.skipped.map((t) => h("span", { class: "hp-small hp-muted" }, t))) : null)),
    view.variations ? section("var-h", "Your variations",
      view.variations.map((v) => h("a", { href: "#/spot/" + encodeURIComponent(v.id), class: "hp-spot", onClick: (e) => { e.preventDefault(); on.open(v.id); } },
        h("span", { class: "hp-spot-head" }, h("b", null, v.name), v.score != null ? h("span", { class: "hp-spot-score", "aria-label": "Score " + v.score }, v.score) : null),
        h("span", { class: "hp-small" }, v.numbers), h("span", { class: "hp-caption" }, v.meta))),
      h("button", { id: "spot-vary", type: "button", class: "hp-dashed", onClick: on.vary }, "Log a hunt as a new variation")) : null,
    section("ses-h", "Your sessions",
      view.sessions.length ? view.sessions.map((x) => h("div", { class: "hp-card hp-session" },
        h("div", { class: "hp-line" },
          h("span", null, h("b", null, x.date + " · " + x.length), h("br"), h("span", { class: "hp-small hp-muted" }, x.exp + " · " + x.profit + (x.breaks ? " · with breaks" : ""))),
          x.armed ? null : h("button", { id: "ses-del-" + x.id, type: "button", class: "hp-linkbtn", "aria-label": "Delete the hunt of " + x.date, onClick: () => on.arm(x.id) }, "Delete")),
        x.armed ? h("div", { class: "hp-pick", role: "alert" }, h("b", null, "Delete this hunt?"),
          h("span", { class: "hp-small hp-muted" }, "Its numbers stop counting for this spot. This can’t be undone."),
          h("div", { class: "hp-grid2" }, h("button", { id: "ses-yes-" + x.id, type: "button", class: "hp-btn danger", onClick: () => on.deleteSession(x.id) }, "Delete"),
            h("button", { id: "ses-no-" + x.id, type: "button", class: "hp-btn", onClick: () => on.arm(null) }, "Keep it"))) : null,
        x.raids && x.raids.length ? h("div", { class: "hp-raids", role: "group", "aria-label": "Echo Raids" }, x.raids.map((r, i) =>
          h("label", { class: "hp-field" }, r.name + " raids", h("input", { id: "ses-raid-" + x.id + "-" + i, class: "hp-input", inputmode: "numeric", value: r.value,
            onChange: (e) => on.raid(x.id, r.name, e.target.value) })))) : null))
        : h("div", { class: "hp-empty" }, view.emptySessions)),
    view.own ? section("own-h", "Your spot (advanced)",
      h("label", { class: "hp-field" }, "Name", h("input", { id: "spot-name", class: "hp-input", value: view.own.name, maxlength: 60, autocomplete: "off",
        onChange: (e) => on.rename(e.target.value), onKeydown: (e) => { if (e.key === "Enter") e.target.blur(); } })),
      h("span", { class: "hp-caption" }, view.own.deleteText),
      confirmButton({ id: "spot-delete", label: "Delete this spot", confirmLabel: "Tap again to delete", armed: view.own.armed, onArm: () => on.arm("spot"), onConfirm: on.deleteSpot })) : null);
}
