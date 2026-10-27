// Weekly: the week's kill tasks, typed by the player: creature, kills left, Done. Nothing counts kills from hunts.
import { h } from "../dom.js";
import { selectField, confirmButton } from "../components.js";

// view: app/views.js weeklyView; ui: {armed}. on: {difficulty(d), slots(n), task(i, patch), done(i, on), newWeek(), arm(b)}.
export function render(view, ui, on) {
  const row = (r) => h("div", { class: "hp-wk-row", role: "group", "aria-label": "Task " + (r.i + 1) },
    h("input", { id: "wk-" + r.i + "-name", class: "hp-input", "aria-label": "Task " + (r.i + 1) + " creature", value: r.name, list: "wk-names", autocomplete: "off",
      onChange: (e) => on.task(r.i, { name: e.target.value }) }),
    h("input", { id: "wk-" + r.i + "-left", class: "hp-input", "aria-label": "Task " + (r.i + 1) + " kills left", value: String(r.killsLeft), inputmode: "numeric",
      onChange: (e) => on.task(r.i, { killsLeft: e.target.value }) }),
    h("button", { id: "wk-" + r.i + "-done", type: "button", class: "hp-btn hp-done", "aria-pressed": r.done ? "true" : "false", "aria-label": "Task " + (r.i + 1) + " done",
      onClick: () => on.done(r.i, !r.done) }, r.done ? "✓ Done" : "Done"));
  return h("div", { class: "hp-section hp-narrow" },
    h("h1", { class: "hp-title" }, "Weekly"),
    h("p", { class: "hp-p hp-small hp-muted" }, view.intro),
    view.stale ? h("div", { class: "hp-pick", role: "status" }, h("b", null, view.staleText),
      h("button", { id: "wk-new-now", type: "button", class: "hp-btn primary", onClick: on.newWeek }, "Start a new week")) : null,
    h("div", { class: "hp-grid2" },
      selectField({ id: "wk-diff", label: "Difficulty", value: view.difficulty, options: view.difficulties, onPick: on.difficulty }),
      selectField({ id: "wk-slots", label: "Kill tasks per week", value: view.slots, options: view.slotOptions, onPick: (x) => on.slots(Number(x)) })),
    h("p", { class: "hp-p hp-caption" }, view.doneCount + " of " + view.slots + " done · " + view.reward),
    h("datalist", { id: "wk-names" }, view.names.map((n) => h("option", { value: n }))),
    h("div", { class: "hp-wk-head", "aria-hidden": "true" }, h("span", null, "Creature"), h("span", null, "Kills left"), h("span")),
    h("div", { class: "hp-wk-rows" }, view.rows.map(row)),
    h("div", { class: "hp-hint" }, h("b", null, "How the plan uses these"), h("span", { class: "hp-small hp-muted" }, view.how)),
    view.stale ? null : confirmButton({ id: "wk-new", label: "Start a new week", confirmLabel: "Tap again to clear this week’s tasks", armed: ui.armed,
      onArm: () => on.arm(true), onConfirm: on.newWeek }));
}
