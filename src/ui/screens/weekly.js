// Weekly: the week's kill tasks, typed by the player: creature, kills left, Done. Nothing counts kills from hunts.
import { h } from "../dom.js";
import { selectField, confirmButton } from "../components.js";
import { t } from "../../app/lang.js";

// view: app/views.js weeklyView; ui: {armed}. on: {difficulty(d), slots(n), task(i, patch), done(i, on), newWeek(), arm(b)}.
export function render(view, ui, on) {
  const row = (r) => h("div", { class: "hp-wk-row", role: "group", "aria-label": t("Task {n}", { n: r.i + 1 }) },
    h("input", { id: "wk-" + r.i + "-name", class: "hp-input", "aria-label": t("Task {n} creature", { n: r.i + 1 }), value: r.name, list: "wk-names", autocomplete: "off",
      onChange: (e) => on.task(r.i, { name: e.target.value }) }),
    h("input", { id: "wk-" + r.i + "-left", class: "hp-input", "aria-label": t("Task {n} kills left", { n: r.i + 1 }), value: String(r.killsLeft), inputmode: "numeric",
      onChange: (e) => on.task(r.i, { killsLeft: e.target.value }) }),
    h("button", { id: "wk-" + r.i + "-done", type: "button", class: "hp-btn hp-done", "aria-pressed": r.done ? "true" : "false", "aria-label": t("Task {n} done", { n: r.i + 1 }),
      onClick: () => on.done(r.i, !r.done) }, r.done ? "✓ " + t("Done") : t("Done")));
  return h("div", { class: "hp-section hp-narrow" },
    h("h1", { class: "hp-title" }, t("Weekly")),
    h("p", { class: "hp-p hp-small hp-muted" }, view.intro),
    view.stale ? h("div", { class: "hp-pick", role: "status" }, h("b", null, view.staleText),
      h("button", { id: "wk-new-now", type: "button", class: "hp-btn primary", onClick: on.newWeek }, t("Start a new week"))) : null,
    h("div", { class: "hp-grid2" },
      selectField({ id: "wk-diff", label: t("Difficulty"), value: view.difficulty, options: view.difficulties, onPick: on.difficulty }),
      selectField({ id: "wk-slots", label: t("Kill tasks per week"), value: view.slots, options: view.slotOptions, onPick: (x) => on.slots(Number(x)) })),
    h("p", { class: "hp-p hp-caption" }, t("{done} of {slots} done", { done: view.doneCount, slots: view.slots }) + " · " + view.reward),
    h("datalist", { id: "wk-names" }, view.names.map((n) => h("option", { value: n }))),
    h("div", { class: "hp-wk-head", "aria-hidden": "true" }, h("span", null, t("Creature")), h("span", null, t("Kills left")), h("span")),
    h("div", { class: "hp-wk-rows" }, view.rows.map(row)),
    view.stale ? null : confirmButton({ id: "wk-new", label: t("Start a new week"), confirmLabel: t("Tap again to clear this week’s tasks"), armed: ui.armed,
      onArm: () => on.arm(true), onConfirm: on.newWeek }));
}
