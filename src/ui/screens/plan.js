// Plan (home): "Plan is using" chips, each opening its inline editor below the chips (one at a time); the chain of
// steps answering "where should I hunt right now?"; Hunting now; the Taken spots. On desktop the chips and editor are
// a left column and the steps the right.
import { h } from "../dom.js";
import { segmented, stepper, selectField, badges } from "../components.js";

// A chip: set (label and value), not set (dashed "+ label"), open (aria-expanded).
export function chip({ id, label, value, set, open, onToggle }) {
  return h("button", { id, type: "button", class: "hp-chip" + (set ? "" : " unset"), "aria-expanded": open ? "true" : "false", "aria-controls": "plan-editor", onClick: onToggle },
    set ? [h("span", { class: "label" }, label), " ", h("b", null, value)] : "+ " + label);
}

// The goal mixer editor. view: app/views.js goalMixView. on: {preset(id), weight(key, n), done()}.
export function goalEditor(view, on) {
  return h("section", { id: "plan-editor", class: "hp-editor", "aria-label": "Goal mix" },
    h("div", { class: "hp-editor-head" }, h("h3", { class: "hp-panel-title" }, "Goal mix"), h("p", { class: "hp-p hp-small hp-muted" }, view.intro)),
    h("div", { class: "hp-presets", role: "group", "aria-label": "Presets" },
      view.presets.map((p) => h("button", { id: "goal-preset-" + p.id, type: "button", "aria-pressed": p.pressed ? "true" : "false", onClick: () => on.preset(p.id) }, p.label))),
    view.rows.map((r) => h("div", { class: "hp-weight", role: "group", "aria-label": r.name + " weight" },
      h("div", { class: "hp-weight-head" }, h("b", null, r.name), h("span", { class: "hp-caption" }, r.hint)),
      segmented({ label: r.name + " weight", value: r.value, options: r.options.map((o) => ({ value: o.n, label: String(o.n) })), onPick: (n) => on.weight(r.key, n) }))),
    h("div", { class: "hp-split" },
      h("span", { class: "hp-caption" }, "How the plan weighs a spot"),
      h("div", { class: "hp-splitbar", "aria-hidden": "true" }, view.split.map((p) => h("span", { class: p.key, style: "width:" + p.pct + "%" }))),
      h("b", { id: "goal-share", "aria-live": "polite" }, view.shareText)),
    h("div", { class: "hp-editor-foot" }, h("span"), h("button", { id: "goal-done", type: "button", class: "hp-btn solid", onClick: on.done }, "Done")));
}

// Enter in a field moves to the next field of the editor.
const nextOnEnter = (e) => {
  if (e.key !== "Enter") return;
  e.preventDefault();
  const fields = [...e.target.closest(".hp-editor").querySelectorAll("input")], i = fields.indexOf(e.target);
  e.target.dispatchEvent(new e.target.ownerDocument.defaultView.Event("change"));
  if (fields[i + 1]) fields[i + 1].focus();
};
const textInput = (id, label, value, onCommit, opts) => h("label", { class: "hp-field" }, label,
  h("input", Object.assign({ id, class: "hp-input", value: value == null ? "" : String(value), onChange: (e) => onCommit(e.target.value), onKeydown: nextOnEnter }, opts || {})));
const KINDS = [{ value: "normal", label: "Normal" }, { value: "silver", label: "Silver" }, { value: "gold", label: "Gold" }];

// The Bounty editor: difficulty and tokens, then the three offers while choosing, or the active bounty.
// view: app/views.js bountyView. on: {difficulty(d), tokens(n), offer(i, patch), pick(i), active(patch), finished(), rerolled(), done()}.
export function bountyEditor(view, on) {
  const offerCard = (o) => h("div", { class: "hp-offer", role: "group", "aria-label": "Offer " + o.letter },
    h("div", { class: "hp-offer-top" }, h("span", { class: "hp-letter", "aria-hidden": "true" }, o.letter),
      textInput("offer-" + o.i + "-name", "Offer " + o.letter + ": creature", o.name, (v) => on.offer(o.i, { name: v }), { list: "bounty-names", autocomplete: "off" })),
    h("div", { class: "hp-offer-row" },
      textInput("offer-" + o.i + "-kills", "Kills needed", o.kills, (v) => on.offer(o.i, { kills: v }), { inputmode: "numeric" }),
      segmented({ label: "Offer " + o.letter + " kind", options: KINDS, value: o.kind, onPick: (k) => on.offer(o.i, { kind: k }) })),
    o.showExp ? textInput("offer-" + o.i + "-exp", "Reward exp (Challenging creatures differ)", o.exp, (v) => on.offer(o.i, { exp: v }), { inputmode: "numeric" }) : null,
    h("button", { id: "offer-" + o.i + "-pick", type: "button", class: "hp-btn", disabled: !o.canPick, onClick: () => on.pick(o.i) }, "Picked " + o.letter));
  const a = view.active;
  const activeCard = a && h("div", { class: "hp-offer active", role: "group", "aria-label": "Active bounty" },
    h("b", null, "Active bounty"),
    textInput("active-name", "Creature", a.name, (v) => on.active({ name: v }), { list: "bounty-names", autocomplete: "off" }),
    h("div", { class: "hp-grid2" },
      textInput("active-kills", "Kills needed", a.kills, (v) => on.active({ kills: v }), { inputmode: "numeric" }),
      textInput("active-left", "Kills left", a.killsLeft, (v) => on.active({ killsLeft: v }), { inputmode: "numeric" })),
    segmented({ label: "Active bounty kind", options: KINDS, value: a.kind, onPick: (k) => on.active({ kind: k }) }),
    a.showExp ? textInput("active-exp", "Reward exp (Challenging creatures differ)", a.exp, (v) => on.active({ exp: v }), { inputmode: "numeric" }) : null,
    h("div", { class: "hp-grid2" },
      h("button", { id: "bounty-finished", type: "button", class: "hp-btn", onClick: on.finished }, "Finished it (+1)"),
      h("button", { id: "bounty-rerolled", type: "button", class: "hp-btn", onClick: on.rerolled }, "Rerolled (−1)")));
  return h("section", { id: "plan-editor", class: "hp-editor", "aria-label": "Bounty" },
    h("div", { class: "hp-editor-head" }, h("h3", { class: "hp-panel-title" }, "Bounty"), h("p", { class: "hp-p hp-small hp-muted" }, view.intro)),
    h("div", { class: "hp-inline" },
      h("label", { class: "hp-field" }, "Difficulty", h("select", { id: "bounty-diff", class: "hp-select", onChange: (e) => on.difficulty(e.target.value) },
        view.difficulties.map((d) => h("option", { value: d.value, selected: d.value === view.difficulty }, d.label)))),
      h("div", { class: "hp-field" }, "Reroll tokens", stepper({ id: "bounty-tokens", label: "Reroll tokens", value: view.tokens, min: 0, max: 10, onSet: on.tokens }))),
    h("datalist", { id: "bounty-names" }, view.suggestions.map((n) => h("option", { value: n }))),
    view.mode === "active" ? activeCard : [view.offers.map(offerCard),
      h("button", { id: "bounty-rerolled", type: "button", class: "hp-btn dashed", onClick: on.rerolled }, "Rerolled (−1, clears the offers)")],
    h("div", { class: "hp-editor-foot" }, h("span", { class: "hp-caption" }, view.mode === "active" ? "" : view.note),
      h("button", { id: "bounty-done", type: "button", class: "hp-btn solid", onClick: on.done }, "Done")));
}

const editorFrame = (id, title, intro, planLine, body, done) => h("section", { id: "plan-editor", class: "hp-editor", "aria-label": title },
  h("div", { class: "hp-editor-head" }, h("h3", { class: "hp-panel-title" }, title), h("p", { class: "hp-p hp-small hp-muted" }, intro)),
  body,
  h("div", { class: "hp-editor-foot" }, h("span", { "aria-live": "polite" }, h("span", { class: "hp-muted" }, "Plan: "), h("b", null, planLine)),
    h("button", { id: id + "-done", type: "button", class: "hp-btn solid", onClick: done }, "Done")));

function weeklyEditor(v, planLine, on) {
  return editorFrame("weekly", "Weekly", "Your open weekly kill tasks and their kills left. The plan counts each kill a spot gives toward them.", planLine, [
    v.rows.length ? h("ul", { class: "hp-list" }, v.rows.map((r) => h("li", null, h("span", null, h("b", null, r.name), " ", h("span", { class: "hp-muted" }, r.left == null ? "" : r.left + " left")),
      h("button", { id: "wkchip-" + r.i + "-done", type: "button", class: "hp-btn hp-done", "aria-pressed": r.done ? "true" : "false", "aria-label": r.name + " done",
        onClick: () => on.weeklyDone(r.i, !r.done) }, r.done ? "✓ Done" : "Done")))) :
      h("p", { class: "hp-p hp-muted" }, "No open weekly tasks."),
    h("a", { href: "#/weekly", id: "weekly-open" }, "Edit them on the Weekly tab")], on.done);
}
function todayEditor(v, planLine, on) {
  return editorFrame("today", "Today’s boosts", "Counts the boosted creature’s double exp, prey bonus exp and exp events. Clears at server save.", planLine, [
    h("datalist", { id: "today-names" }, v.names.map((n) => h("option", { value: n }))),
    textInput("today-boosted", "Boosted creature", v.boosted, on.boosted, { list: "today-names", autocomplete: "off" }),
    v.prey.map((q) => h("div", { class: "hp-offer", role: "group", "aria-label": "Prey " + (q.i + 1) },
      textInput("prey-" + q.i + "-name", "Prey " + (q.i + 1), q.name, (x) => on.prey(q.i, { name: x }), { list: "today-names", autocomplete: "off" }),
      h("div", { class: "hp-grid2" },
        selectField({ id: "prey-" + q.i + "-kind", label: "Bonus", value: q.kind, options: q.kinds, onPick: (k) => on.prey(q.i, { kind: k }) }),
        selectField({ id: "prey-" + q.i + "-pct", label: "Size", value: q.pct, options: q.sizes, onPick: (x) => on.prey(q.i, { pct: Number(x) }) })),
      h("button", { id: "prey-" + q.i + "-remove", type: "button", class: "hp-linkbtn", onClick: () => on.removePrey(q.i) }, "Remove"))),
    v.canAddPrey ? h("button", { id: "prey-add", type: "button", class: "hp-btn dashed", onClick: on.addPrey }, "+ Add a prey") : null,
    selectField({ id: "today-event", label: "Exp event", value: v.event, options: v.events, onPick: (x) => on.event(Number(x)) })], on.done);
}
function timeEditor(v, planLine, on) {
  return editorFrame("time", "Time", "How long you’ll hunt. With a limit, travel time counts and only kills you can finish do.", planLine,
    h("div", { class: "hp-presets", role: "group", "aria-label": "Session length" }, v.options.map((o, i) =>
      h("button", { id: "time-" + i, type: "button", "aria-pressed": o.value === v.value ? "true" : "false", onClick: () => on.hours(o.value) }, o.label))), on.done);
}
function dataEditor(v, planLine, on) {
  return editorFrame("data", "Data", "Where the plan’s numbers come from: your logged hunts always come first.", planLine, [
    segmented({ label: "Numbers from", options: v.presets, value: v.preset, onPick: (k) => on.sources(v.presets.filter((x) => x.value === k)[0].switches) }),
    h("a", { href: "#/characters", id: "data-more" }, "Detailed switches in Characters")], on.done);
}

const whyToggle = (id, text, open, onWhy) => [
  h("button", { id: "why-" + id, type: "button", class: "hp-linkbtn hp-why", "aria-expanded": open ? "true" : "false", onClick: onWhy }, open ? "Hide why" : "Why?"),
  open ? h("p", { class: "hp-p hp-small hp-muted" }, text) : null];

function steps(v, ui, on) {
  const st = v.steps, f = st.first, kids = [];
  st.notices.forEach((n, i) => kids.push(h("article", { class: "hp-step note" }, h("b", null, n.text), whyToggle("n" + i, n.why, ui.why["n" + i], () => on.why("n" + i)))));
  if (v.hunting) {
    const hu = v.hunting;
    kids.push(h("article", { class: "hp-step hunting", "aria-label": "Hunting now" },
      h("span", { class: "hp-eyebrow" }, "Hunting now"), h("h3", { class: "hp-step-title" }, hu.name),
      hu.pick ? h("div", { class: "hp-pick" }, h("span", null, h("b", null, "The spot is yours: pick offer " + hu.pick.letter + " now."), h("br"),
        h("span", { class: "hp-small" }, hu.pick.name + " on the Task Board. The other two offers will disappear.")),
        h("button", { id: "hunt-picked", type: "button", class: "hp-btn primary", onClick: () => on.pick(hu.pick.i) }, "Picked " + hu.pick.letter)) : null,
      h("p", { class: "hp-p hp-small hp-muted" }, "No timer, nothing to track. If this turns into a focused, break-free hunt, you can log it any time."),
      h("div", { class: "hp-grid2" }, h("button", { id: "hunt-log", type: "button", class: "hp-btn", onClick: () => on.logHunt(hu.spotId) }, "Log a clean hunt"),
        h("button", { id: "hunt-back", type: "button", class: "hp-btn solid", onClick: on.stopHunting }, "Back to plan"))));
  } else if (f) {
    kids.push(h("article", { class: "hp-step first", "aria-labelledby": "step1-title" },
      h("span", { class: "hp-eyebrow" }, "Step 1"), h("h3", { id: "step1-title", class: "hp-step-title" }, f.title),
      f.bounty ? h("span", { class: "hp-bountyline" }, f.bounty) : null,
      h("div", { class: "hp-stats" }, h("div", null, h("div", { class: "hp-stat" }, f.exp), h("div", { class: "hp-caption" }, "exp/h")),
        h("div", null, h("div", { class: "hp-stat" }, f.profit), h("div", { class: "hp-caption" }, "profit/h"))),
      badges(f.badges, true),
      st.refNote ? h("p", { class: "hp-p hp-caption" }, st.refNote) : null,
      h("div", { class: "hp-grid2" },
        h("button", { id: "step1-free", type: "button", class: "hp-btn primary", onClick: () => on.free(f.id) }, "Free"),
        h("button", { id: "step1-taken", type: "button", class: "hp-btn", onClick: () => on.taken(f.id) }, "Taken")),
      whyToggle("first", f.why, ui.why.first, () => on.why("first"))));
  } else kids.push(h("article", { class: "hp-step first" }, h("span", { class: "hp-eyebrow" }, "Step 1"),
    h("h3", { class: "hp-step-title" }, v.taken.length ? "Every planned spot is taken" : "No spot to suggest yet"),
    h("p", { class: "hp-p hp-muted" }, v.taken.length ? "See Spots for more, or free a spot below if it opened up." : st.end.why || "See Spots for every spot with numbers.")));
  if (!v.hunting) st.fallbacks.forEach((r) => kids.push(h("article", { class: "hp-step" },
    h("div", { class: "hp-step-row" }, h("div", null, h("span", { class: "hp-muted" }, "Taken? → "), h("b", null, r.name), h("br"),
      h("span", { class: "hp-small hp-muted" }, r.exp + " exp/h · " + r.profit + " profit/h"), badges(r.badges.filter((b) => b.kind !== "yours"))),
      h("button", { id: "taken-" + r.id, type: "button", class: "hp-btn", onClick: () => on.taken(r.id) }, "Taken")),
    whyToggle(r.id, r.why, ui.why[r.id], () => on.why(r.id)))));
  if (!v.hunting) kids.push(h("button", { id: "step-end", type: "button", class: "hp-step end", onClick: st.end.kind === "reroll" ? on.reroll : on.spots },
    h("span", { class: "hp-muted" }, "Taken? → "), h("b", null, st.end.title), h("br"), h("span", { class: "hp-small hp-muted" }, st.end.line)));
  return h("section", { class: "hp-section", "aria-labelledby": "next-h" }, h("h2", { id: "next-h", class: "hp-eyebrow" }, "Where to hunt now"), kids);
}

// view: app/views.js planScreenView; ui: {open: editor id or null, why: {id: true}}. on: {toggle(id), why(id), preset(id),
// weight(key, n), bounty: {...}, today: {...}, hours(h), sources(s), free(id), taken(id), freeAgain(id), pick(i),
// stopHunting(), reroll(), spots()}.
export function render(view, ui, on) {
  const planLine = view.steps ? (view.hunting ? "Hunting at " + view.hunting.name : view.steps.first ? view.steps.first.title : view.steps.end.title) : "";
  const close = () => on.toggle(null);
  const editors = {
    goal: () => goalEditor(view.goal, { preset: on.preset, weight: on.weight, done: close }),
    bounty: () => bountyEditor(view.bounty, Object.assign({}, on.bounty, { done: close })),
    weekly: () => weeklyEditor(view.weekly, planLine, { weeklyDone: on.weeklyDone, done: close }),
    today: () => todayEditor(view.today, planLine, Object.assign({}, on.today, { done: close })),
    time: () => timeEditor(view.time, planLine, { hours: on.hours, done: close }),
    data: () => dataEditor(view.data, planLine, { sources: on.sources, done: close }),
  };
  const toggle = (id) => () => on.toggle(ui.open === id ? null : id);
  const chips = [["goal", "Goal", view.goal.chip], ["bounty", "Bounty", view.bounty && view.bounty.chip], ["weekly", "Weekly", view.weekly && view.weekly.chip],
    ["today", "Today’s boosts", view.today && view.today.chip], ["time", "Time", view.time && view.time.chip], ["data", "Data", view.data && view.data.chip]].filter((c) => c[2]);
  const inputs = h("div", { class: "hp-section hp-plan-inputs" },
    h("section", { class: "hp-section", "aria-labelledby": "using-h" },
      h("h2", { id: "using-h", class: "hp-eyebrow" }, "Plan is using"),
      h("div", { class: "hp-chips" }, chips.map(([id, label, c]) => chip({ id: "chip-" + id, label, value: c.value, set: c.set, open: ui.open === id, onToggle: toggle(id) })))),
    ui.open && editors[ui.open] ? editors[ui.open]() : null);
  if (!view.steps) return inputs;
  return h("div", { class: "hp-plan" }, inputs,
    h("div", { class: "hp-section" }, steps(view, ui, on),
      view.taken.length ? h("section", { class: "hp-section", "aria-labelledby": "taken-h" }, h("h2", { id: "taken-h", class: "hp-eyebrow" }, "Taken spots (" + view.taken.length + ")"),
        view.taken.map((t) => h("div", { class: "hp-card hp-step-row" }, h("div", null, h("b", null, t.name), h("br"), h("span", { class: "hp-small hp-muted" }, t.meta)),
          h("button", { id: "free-" + t.id, type: "button", class: "hp-btn", onClick: () => on.freeAgain(t.id) }, "Free again")))) : null));
}
