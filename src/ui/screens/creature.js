// One creature: its tier and numbers for the Creatures screen's difficulty, where they come from, the spots it lives in,
// Preferred / Unwanted / Avoid, bestiary and Echo Warden done, notes; in Advanced, typed numbers, a pinned spot and the
// level it's usable from.
import { h, icon } from "../dom.js";
import { badges, switchCtl, settingRow, selectField } from "../components.js";

// view: app/views.js creatureView (null: unknown creature). on: {back(), spot(id), preferred(on), unwanted(on), avoid(on),
// bestiary(on), warden(on), notesDraft(text), notes(text), nums(key, text), pin(spot), minLevel(text)}.
export function render(view, on) {
  const back = h("div", null, h("a", { href: "#/creatures", class: "hp-back", onClick: (e) => { e.preventDefault(); on.back(); } }, icon("back", 20), "Creatures"));
  if (!view) return h("div", { class: "hp-section hp-narrow" }, back, h("p", { class: "hp-p hp-muted" }, "There’s no creature by that name."));
  const section = (id, title, ...body) => h("section", { class: "hp-section", "aria-labelledby": id }, h("h2", { id, class: "hp-eyebrow" }, title), ...body);
  const toggle = (id, label, pressed, fn) => h("button", { id, type: "button", class: "hp-toggle", "aria-pressed": pressed ? "true" : "false", onClick: () => fn(!pressed) }, label);
  const a = view.advanced;
  return h("div", { class: "hp-section hp-narrow" },
    back,
    h("div", { class: "hp-spot-title" },
      h("h1", { class: "hp-panel-title big" }, view.name),
      h("span", { class: "hp-caption" }, view.classLine, " · ", h("a", { href: view.wiki, target: "_blank", rel: "noopener noreferrer" }, "TibiaWiki")),
      h("span", { id: "cr-score", class: "hp-muted" }, view.scoreLine)),
    view.marks.length ? h("div", { class: "hp-badges big" }, view.marks.map((m) => h("span", { class: "hp-badge low" }, m))) : null,
    h("dl", { class: "hp-statgrid" }, view.stats.map((s) => h("div", null, h("dt", { class: "hp-caption" }, s.label), h("dd", { class: "hp-stat small" }, s.value)))),
    view.badge ? badges([view.badge], true) : null,
    h("p", { class: "hp-p hp-small hp-muted" }, view.source),
    view.weekly ? h("p", { class: "hp-p hp-small hp-muted" }, view.weekly) : null,
    h("div", { class: "hp-toggles", role: "group", "aria-label": "Lists" },
      toggle("cr-pref", "★ Preferred", view.preferred, on.preferred), toggle("cr-unw", "⊘ Unwanted", view.unwanted, on.unwanted), toggle("cr-avoid", "Avoid", view.avoid, on.avoid)),
    h("span", { class: "hp-caption" }, view.listsNote),
    section("crs-h", "Where it lives",
      view.spots.length ? view.spots.map((s) => h("div", { class: "hp-card" + (s.used ? " used" : "") },
        h("div", { class: "hp-line" },
          s.id ? h("a", { href: "#/spot/" + encodeURIComponent(s.id), onClick: (e) => { e.preventDefault(); on.spot(s.id); } }, h("b", null, s.name)) : h("b", null, s.name),
          badges([s.badge])),
        h("span", { class: "hp-small" }, s.kph + " · " + s.exp + " · " + s.profit),
        s.note ? h("span", { class: "hp-caption" }, s.note) : null))
        : h("div", { class: "hp-empty" }, view.noSpots)),
    section("crb-h", "Bestiary",
      h("p", { class: "hp-p hp-small hp-muted" }, view.bestiary),
      h("div", { class: "hp-card flush" },
        settingRow("Bestiary finished", null, switchCtl({ id: "cr-bestiary", label: "Bestiary finished", on: view.bestiaryDone, onToggle: on.bestiary })),
        view.rare ? null : settingRow("Echo Warden done", null, switchCtl({ id: "cr-warden", label: "Echo Warden done", on: view.wardenDone, onToggle: on.warden })))),
    section("crn-h", "Notes",
      h("textarea", { id: "cr-notes", class: "hp-input hp-notes", rows: 3, "aria-labelledby": "crn-h", maxlength: 2000, placeholder: "Anything worth remembering",
        onInput: (e) => on.notesDraft(e.target.value), onChange: (e) => on.notes(e.target.value) }, view.notes)),
    a ? section("cra-h", "Advanced",
      h("div", { class: "hp-grid3" }, a.nums.map((n) => h("label", { class: "hp-field" }, n.label,
        h("input", { id: "cr-num-" + n.key, class: "hp-input", inputmode: "decimal", value: n.value, autocomplete: "off", onChange: (e) => on.nums(n.key, e.target.value),
          onKeydown: (e) => { if (e.key === "Enter") e.target.blur(); } })))),
      h("span", { class: "hp-caption" }, "Typed numbers win over hunts and the reference, field by field. Clear a field to go back."),
      a.pin ? selectField({ id: "cr-pin", label: "Spot its numbers come from", value: a.pin.value, options: a.pin.options, onPick: on.pin }) : null,
      h("label", { class: "hp-field" }, a.minLevelLabel, h("input", { id: "cr-minlevel", class: "hp-input", inputmode: "numeric", value: a.minLevel, autocomplete: "off",
        onChange: (e) => on.minLevel(e.target.value), onKeydown: (e) => { if (e.key === "Enter") e.target.blur(); } })),
      h("span", { class: "hp-caption" }, "Shared by every character of this vocation. Below it, the creature is marked and left out of suggestions.")) : null,
    view.updated ? h("span", { class: "hp-caption" }, view.updated) : null);
}
