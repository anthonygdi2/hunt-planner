// First run: two answers (vocation, level) and the plan starts; everything else is optional. The language can be
// changed here first.
import { h, withNodes } from "../dom.js";
import { selectField } from "../components.js";
import { t } from "../../app/lang.js";

// view: app/views.js firstRunView. on: {pickVocation(name), setLevel(text), start(), restore(), setLang(l), cancel() or
// null (adding another character)}.
export function render(view, on) {
  return h("div", { class: "hp-section hp-narrow" },
    on.cancel ? h("div", null, h("button", { id: "fr-cancel", type: "button", class: "hp-linkbtn", onClick: on.cancel }, t("Back to Characters"))) : null,
    view.langs ? selectField({ id: "fr-lang", label: t("Language"), value: view.lang, options: view.langs, onPick: on.setLang }) : null,
    h("div", { class: "hp-section" },
      h("h1", { class: "hp-display" }, t("Where should you hunt?")),
      h("p", { class: "hp-p hp-muted" }, t("Two answers and you get a plan."))),
    h("fieldset", { class: "hp-section", style: "margin:0;padding:0;border:0" },
      h("legend", { style: "padding:0;margin-bottom:8px;font-weight:700" }, t("1. Vocation")),
      h("div", { class: "hp-grid2" }, view.vocations.map((v, i) =>
        h("button", { id: "fr-voc-" + i, type: "button", class: "hp-choice", "aria-pressed": v.pressed ? "true" : "false", onClick: () => on.pickVocation(v.name) }, v.name)))),
    h("label", { class: "hp-field strong" }, t("2. Level"),
      h("input", { id: "fr-level", class: "hp-input big", inputmode: "numeric", placeholder: t("e.g. 615"), value: view.level,
        onInput: (e) => on.setLevel(e.target.value), onKeydown: (e) => { if (e.key === "Enter" && view.ready) on.start(); } })),
    h("button", { id: "fr-go", type: "button", class: "hp-btn primary", disabled: !view.ready, onClick: on.start }, t("Show my plan")),
    h("p", { class: "hp-p hp-caption", "aria-live": "polite" }, view.note),
    h("p", { class: "hp-p hp-caption" }, withNodes(t("Have a backup from another device? {restore}."), {
      restore: h("button", { id: "fr-restore", type: "button", class: "hp-linkbtn", onClick: on.restore }, t("Restore it")) })));
}
