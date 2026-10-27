// Shared controls: segmented, switch, field, select, inline confirm. Each returns an element; state lives in the
// view model and the caller's actions.
import { h } from "./dom.js";

// Segmented control: options [{value, label}], the pressed one, onPick(value). Arrow keys move between options.
export function segmented({ label, options, value, onPick, disabled }) {
  const box = h("div", { class: "hp-seg", role: "group", "aria-label": label });
  options.forEach((o, i) => {
    box.appendChild(h("button", { type: "button", "aria-pressed": o.value === value ? "true" : "false", disabled, onClick: () => onPick(o.value),
      onKeydown: (e) => {
        if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
        const next = options[(i + (e.key === "ArrowRight" ? 1 : options.length - 1)) % options.length];
        e.preventDefault();
        onPick(next.value);
      } }, o.label));
  });
  return box;
}

// On/off switch (role=switch).
export function switchCtl({ id, label, on, onToggle, disabled }) {
  return h("button", { id, type: "button", class: "hp-switch", role: "switch", "aria-checked": on ? "true" : "false", "aria-label": label, disabled, onClick: () => onToggle(!on) });
}

// A row with a title, a hint and a control on the right.
export function settingRow(title, hint, control) {
  return h("div", { class: "hp-row" }, h("span", null, h("b", null, title), hint ? h("br") : null, hint ? h("span", { class: "hp-caption" }, hint) : null), control);
}

// A labelled input. onCommit(value) runs on change (blur or Enter), not on every keystroke.
export function field({ id, label, value, onCommit, inputmode, placeholder, disabled, maxlength }) {
  return h("label", { class: "hp-field" }, label, h("input", { id, class: "hp-input", value: value == null ? "" : String(value), inputmode, placeholder, disabled, maxlength,
    onChange: (e) => onCommit(e.target.value), onKeydown: (e) => { if (e.key === "Enter") e.target.blur(); } }));
}

// A labelled select: options [{value, label}].
export function selectField({ id, label, options, value, onPick, disabled }) {
  const sel = h("select", { id, class: "hp-select", disabled, onChange: (e) => onPick(e.target.value) },
    options.map((o) => h("option", { value: String(o.value), selected: String(o.value) === String(value) }, o.label)));
  return h("label", { class: "hp-field" }, label, sel);
}

// A destructive button that asks again in its own place: the first tap arms it ("Tap again to …"), the second runs it.
export function confirmButton({ id, label, confirmLabel, armed, onArm, onConfirm, disabled }) {
  return h("button", { id, type: "button", class: "hp-btn danger", disabled, onClick: () => (armed ? onConfirm() : onArm()) }, armed ? confirmLabel : label);
}

// A number stepper (− value +) for small ranges, its value announced politely. value null shows "–".
export function stepper({ id, label, value, min, max, onSet, disabled }) {
  const v = value == null ? null : value;
  return h("div", { class: "hp-stepper", role: "group", "aria-label": label },
    h("button", { id: id + "-dec", type: "button", class: "hp-btn", "aria-label": "One fewer", disabled: disabled || (v != null && v <= min), onClick: () => onSet(v == null ? min : v - 1) }, "−"),
    h("output", { id, "aria-live": "polite" }, v == null ? "–" : String(v)),
    h("button", { id: id + "-inc", type: "button", class: "hp-btn", "aria-label": "One more", disabled: disabled || (v != null && v >= max), onClick: () => onSet(v == null ? Math.min(max, 1) : v + 1) }, "+"));
}

// Source badges: [{kind, text}] (app/views.js sourceBadges); big on a step or spot page. Nothing for an empty list.
export function badges(list, big) {
  return list.length ? h("div", { class: "hp-badges" + (big ? " big" : "") }, list.map((b) => h("span", { class: "hp-badge " + b.kind }, b.text))) : null;
}
