// Log a clean hunt (full page): paste the Hunting Session Analyser text, say where (a known spot, or a new spot or
// variation), check the preview, save or don't. Leaving after a paste asks inline whether to discard it.
import { h, icon } from "../dom.js";
import { segmented, selectField } from "../components.js";
import { t } from "../../app/lang.js";

// view: app/views.js logView; ui: {leaving}. on: {text(t), where(w), spot(id), name(n), parent(id), note(n), raid(name, n),
// save(), discard(), back(), keep()}.
export function render(view, ui, on) {
  const field = (id, label, value, onCommit, opts) => h("label", { class: "hp-field" }, label,
    h("input", Object.assign({ id, class: "hp-input", value, autocomplete: "off", onChange: (e) => onCommit(e.target.value) }, opts || {})));
  return h("div", { class: "hp-section hp-narrow" },
    h("div", null, h("a", { href: "#/plan", class: "hp-back", onClick: (e) => { e.preventDefault(); on.back(); } }, icon("back", 20), t("Back"))),
    ui.leaving ? h("div", { class: "hp-pick", role: "alert" }, h("b", null, t("Discard this hunt?")),
      h("div", { class: "hp-grid2" }, h("button", { id: "log-discard", type: "button", class: "hp-btn solid", onClick: on.discard }, t("Discard")),
        h("button", { id: "log-keep", type: "button", class: "hp-btn", onClick: on.keep }, t("Keep it")))) : null,
    h("h1", { class: "hp-panel-title" }, t("Log a clean hunt")),
    h("p", { class: "hp-p hp-small hp-muted" }, t("Only focused hunts with no breaks.")),
    h("label", { class: "hp-field strong" }, t("Hunting Session Analyser text"),
      h("textarea", { id: "log-text", class: "hp-input hp-paste", rows: 6, placeholder: t("Paste the text from the analyser here"), onInput: (e) => on.text(e.target.value) }, view.text)),
    view.read ? h("p", { class: "hp-p hp-caption", role: "status" }, view.read) : null,
    view.problem ? h("p", { class: "hp-p hp-notice", role: "alert" }, view.problem) : null,
    view.preview ? h("section", { class: "hp-section", "aria-labelledby": "prev-h" },
      h("h2", { id: "prev-h", class: "hp-eyebrow" }, t("Preview")),
      segmented({ label: t("Where did you hunt"), options: [{ value: "known", label: t("Known spot") }, { value: "new", label: t("New spot") }], value: view.where, onPick: on.where }),
      view.where === "known" ? [
        selectField({ id: "log-spot", label: t("Spot"), value: view.spotId, options: view.spots, onPick: on.spot }),
        h("span", { class: "hp-caption" }, t("Hunted a different route? Switch to New spot."))] : [
        field("log-name", t("Name"), view.name, on.name, { placeholder: t("e.g. Cobra Bastion, 2-box lure"), maxlength: 60 }),
        view.nameHint ? h("span", { class: "hp-caption", role: "alert" }, view.nameHint) : null,
        selectField({ id: "log-parent", label: t("Variation of (optional)"), value: view.parentId, options: view.parents, onPick: on.parent }),
        field("log-note", t("Route or tactic (optional)"), view.note, on.note, { placeholder: t("e.g. lure two boxes, skip the Viziers"), maxlength: 200 })],
      h("div", { class: "hp-stats" }, h("div", null, h("div", { class: "hp-stat" }, view.exp), h("div", { class: "hp-caption" }, t("exp/h"))),
        h("div", null, h("div", { class: "hp-stat" }, view.profit), h("div", { class: "hp-caption" }, t("profit/h")))),
      h("div", { class: "hp-card" }, h("b", null, t("Kills per hour")), h("ul", { class: "hp-list" }, view.kph.map((k) => h("li", null, h("span", null, k.name), h("span", null, k.perHour))))),
      view.raids ? h("div", { class: "hp-card" }, h("b", null, t("Echo Raids (advanced)")), view.raids.map((r, i) =>
        field("log-raid-" + i, t("{creature} raids", { creature: r.name }), r.value, (v) => on.raid(r.name, v), { inputmode: "numeric" }))) : null,
      h("div", { class: "hp-grid2" },
        h("button", { id: "log-skip", type: "button", class: "hp-btn", onClick: on.discard }, t("Don’t save")),
        h("button", { id: "log-save", type: "button", class: "hp-btn primary", disabled: !view.canSave, onClick: on.save }, t("Save hunt")))) : null);
}
