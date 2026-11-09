// Log a clean hunt (full page): paste the Hunting Session Analyser text, say where (a known spot, or a new spot or
// variation), check the preview, save or don't. Leaving after a paste asks inline whether to discard it. A hunt saved
// before asks inline too (Save anyway / Open the existing one). Below, the saved hunts every character shares, with
// vocation and level filters and an inline editor for a hunt's vocation, level and spot.
import { h, icon } from "../dom.js";
import { segmented, selectField, confirmButton } from "../components.js";
import { t } from "../../app/lang.js";

// The saved hunts (view.saved: logView's), each with its editor when open.
function savedHunts(s, on) {
  const field = (id, label, value, onCommit, opts) => h("label", { class: "hp-field" }, label,
    h("input", Object.assign({ id, class: "hp-input", value, autocomplete: "off", onChange: (e) => onCommit(e.target.value) }, opts || {})));
  return h("section", { class: "hp-section", "aria-labelledby": "saved-h" },
    h("h2", { id: "saved-h", class: "hp-eyebrow" }, t("Saved hunts")),
    h("p", { class: "hp-p hp-small hp-muted" }, t("Shared by all your characters: each hunt counts for those of its vocation near its level.")),
    h("div", { class: "hp-grid2" },
      selectField({ id: "saved-f-voc", label: t("Vocation"), value: s.filters.vocation, options: s.filters.vocations, onPick: on.filterVoc }),
      selectField({ id: "saved-f-level", label: t("Level"), value: s.filters.level, options: s.filters.levels, onPick: on.filterLevel })),
    s.count ? h("p", { id: "saved-count", class: "hp-p hp-caption", role: "status" }, s.count) : null,
    s.empty ? h("p", { class: "hp-p hp-small hp-muted" }, s.empty) : null,
    s.rows.map((r) => h("div", { id: "saved-" + r.id, class: "hp-card hp-session" },
      h("div", { class: "hp-line" },
        h("span", null, h("b", null, r.title), h("br"), h("span", { class: "hp-small hp-muted" }, r.sub))),
      h("div", { class: "hp-session-actions" },
        h("button", { id: "saved-" + r.id + "-edit", type: "button", class: "hp-linkbtn hp-tap", "aria-expanded": r.open ? "true" : "false", "aria-label": r.label,
          onClick: () => on.edit(r.id) }, r.open ? t("Close") : t("Edit"))),
      r.editor ? h("div", { class: "hp-stack" },
        h("div", { class: "hp-grid2" },
          selectField({ id: "saved-" + r.id + "-voc", label: t("Vocation"), value: r.editor.vocation, options: r.editor.vocations, onPick: (x) => on.editField("vocation", x) }),
          field("saved-" + r.id + "-level", t("Level"), r.editor.level, (x) => on.editField("level", x.trim()), { inputmode: "numeric", maxlength: 4,
            "aria-invalid": r.editor.levelOk ? null : "true" })),
        r.editor.levelOk ? null : h("span", { class: "hp-caption", role: "alert" }, t("Type a level, or leave it empty.")),
        selectField({ id: "saved-" + r.id + "-spot", label: t("Spot"), value: r.editor.spotId, options: r.editor.spots, onPick: (x) => on.editField("spotId", x) }),
        h("div", { class: "hp-grid2" },
          h("button", { id: "saved-" + r.id + "-cancel", type: "button", class: "hp-btn", onClick: on.editCancel }, t("Cancel")),
          h("button", { id: "saved-" + r.id + "-save", type: "button", class: "hp-btn solid", disabled: !r.editor.canSave, onClick: () => on.editSave(r) }, t("Save changes"))),
        confirmButton({ id: "saved-" + r.id + "-delete", label: t("Delete this hunt"), confirmLabel: t("Tap again to delete this hunt for every character"), armed: r.editor.armed,
          onArm: () => on.arm(r.id), onConfirm: () => on.deleteHunt(r.id) })) : null)),
    s.more ? h("button", { id: "saved-more", type: "button", class: "hp-btn", onClick: on.more }, t("Show {n} more", { n: s.more })) : null);
}

// view: app/views.js logView; ui: {leaving}. on: {text(t), where(w), spot(id), name(n), parent(id), note(n), raid(name, n),
// save(), saveAnyway(), openExisting(), discard(), back(), keep(), filterVoc(v), filterLevel(v), more(), edit(id),
// editField(key, value), editSave(row), editCancel(), arm(id), deleteHunt(id)}.
export function render(view, ui, on) {
  const field = (id, label, value, onCommit, opts) => h("label", { class: "hp-field" }, label,
    h("input", Object.assign({ id, class: "hp-input", value, autocomplete: "off", onChange: (e) => onCommit(e.target.value) }, opts || {})));
  const dup = view.duplicate;
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
      dup && dup.asked ? h("div", { id: "log-dupe", class: "hp-pick", role: "alert" }, h("b", null, dup.text),
        h("div", { class: "hp-grid2" }, h("button", { id: "log-save-anyway", type: "button", class: "hp-btn", disabled: !view.canSave, onClick: on.saveAnyway }, t("Save anyway")),
          h("button", { id: "log-open-existing", type: "button", class: "hp-btn", onClick: on.openExisting }, t("Open the existing one")))) : null,
      h("div", { class: "hp-grid2" },
        h("button", { id: "log-skip", type: "button", class: "hp-btn", onClick: on.discard }, t("Don’t save")),
        h("button", { id: "log-save", type: "button", class: "hp-btn primary", disabled: !view.canSave || !!(dup && dup.asked), onClick: on.save }, t("Save hunt")))) : null,
    savedHunts(view.saved, on));
}
