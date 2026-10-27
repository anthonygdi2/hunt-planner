// Plan (home): "Plan is using" chips, each opening its inline editor below the chips (one at a time); the chain of
// steps answering "where should I hunt right now?"; Hunting now; the Taken spots. On desktop the chips and editor are
// a left column and the steps the right.
import { h } from "../dom.js";
import { segmented, stepper, selectField, badges } from "../components.js";
import { t } from "../../app/lang.js";

// A chip: set (label and value), not set (dashed "+ label"), open (aria-expanded).
export function chip({ id, label, value, set, warn, open, onToggle }) {
  return h("button", { id, type: "button", class: "hp-chip" + (set ? "" : " unset") + (warn ? " warn" : ""), "aria-expanded": open ? "true" : "false", "aria-controls": "plan-editor", onClick: onToggle },
    set ? [h("span", { class: "label" }, label), " ", h("b", null, value)] : "+ " + label);
}

// The goal mixer editor. view: app/views.js goalMixView. on: {preset(id), weight(key, n), done()}.
export function goalEditor(view, on) {
  return h("section", { id: "plan-editor", class: "hp-editor", "aria-label": t("Goal mix") },
    h("div", { class: "hp-editor-head" }, h("h3", { class: "hp-panel-title" }, t("Goal mix"))),
    h("div", { class: "hp-presets", role: "group", "aria-label": t("Presets") },
      view.presets.map((p) => h("button", { id: "goal-preset-" + p.id, type: "button", "aria-pressed": p.pressed ? "true" : "false", onClick: () => on.preset(p.id) }, p.label))),
    view.rows.map((r) => h("div", { class: "hp-weight", role: "group", "aria-label": t("{goal} weight", { goal: r.name }) },
      h("div", { class: "hp-weight-head" }, h("b", null, r.name)),
      segmented({ label: t("{goal} weight", { goal: r.name }), value: r.value, options: r.options.map((o) => ({ value: o.n, label: String(o.n) })), onPick: (n) => on.weight(r.key, n) }))),
    h("div", { class: "hp-split" },
      h("span", { class: "hp-caption" }, t("How the plan weighs a spot")),
      h("div", { class: "hp-splitbar", "aria-hidden": "true" }, view.split.map((p) => h("span", { class: p.key, style: "width:" + p.pct + "%" }))),
      h("b", { id: "goal-share", "aria-live": "polite" }, view.shareText)),
    h("div", { class: "hp-editor-foot" }, h("span"), h("button", { id: "goal-done", type: "button", class: "hp-btn solid", onClick: on.done }, t("Done"))));
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
// Silver and Gold are the game's names for the board's bonus offers.
const kinds = () => [{ value: "normal", label: t("Normal") }, { value: "silver", label: "Silver" }, { value: "gold", label: "Gold" }];

// The Bounty editor: difficulty and tokens, then the three offers while choosing, or the active bounty.
// view: app/views.js bountyView. on: {difficulty(d), tokens(n), offer(i, patch), pick(i), active(patch), finished(), rerolled(), lists(),
// done()}.
export function bountyEditor(view, on) {
  const KINDS = kinds();
  const offerCard = (o) => h("div", { class: "hp-offer", role: "group", "aria-label": t("Offer {letter}", { letter: o.letter }) },
    h("div", { class: "hp-offer-top" }, h("span", { class: "hp-letter", "aria-hidden": "true" }, o.letter),
      textInput("offer-" + o.i + "-name", t("Offer {letter}: creature", { letter: o.letter }), o.name, (v) => on.offer(o.i, { name: v }), { list: "bounty-names", autocomplete: "off" })),
    o.mark ? h("span", { id: "offer-" + o.i + "-mark", class: "hp-caption hp-mark " + o.mark.kind }, o.mark.text) : null,
    h("div", { class: "hp-offer-row" },
      textInput("offer-" + o.i + "-kills", t("Kills needed"), o.kills, (v) => on.offer(o.i, { kills: v }), { inputmode: "numeric" }),
      segmented({ label: t("Offer {letter} kind", { letter: o.letter }), options: KINDS, value: o.kind, onPick: (k) => on.offer(o.i, { kind: k }) })),
    o.showExp ? textInput("offer-" + o.i + "-exp", t("Reward exp (Challenging creatures differ)"), o.exp, (v) => on.offer(o.i, { exp: v }), { inputmode: "numeric" }) : null,
    h("button", { id: "offer-" + o.i + "-pick", type: "button", class: "hp-btn", disabled: !o.canPick, onClick: () => on.pick(o.i) }, t("Picked {letter}", { letter: o.letter })));
  const a = view.active;
  const activeCard = a && h("div", { class: "hp-offer active", role: "group", "aria-label": t("Active bounty") },
    h("b", null, t("Active bounty")),
    textInput("active-name", t("Creature"), a.name, (v) => on.active({ name: v }), { list: "bounty-names", autocomplete: "off" }),
    h("div", { class: "hp-grid2" },
      textInput("active-kills", t("Kills needed"), a.kills, (v) => on.active({ kills: v }), { inputmode: "numeric" }),
      textInput("active-left", t("Kills left"), a.killsLeft, (v) => on.active({ killsLeft: v }), { inputmode: "numeric" })),
    segmented({ label: t("Active bounty kind"), options: KINDS, value: a.kind, onPick: (k) => on.active({ kind: k }) }),
    a.showExp ? textInput("active-exp", t("Reward exp (Challenging creatures differ)"), a.exp, (v) => on.active({ exp: v }), { inputmode: "numeric" }) : null,
    h("div", { class: "hp-grid2" },
      h("button", { id: "bounty-finished", type: "button", class: "hp-btn", onClick: on.finished }, t("Finished it (+1)")),
      h("button", { id: "bounty-rerolled", type: "button", class: "hp-btn", onClick: on.rerolled }, t("Rerolled (−1)"))));
  return h("section", { id: "plan-editor", class: "hp-editor", "aria-label": t("Bounty") },
    h("div", { class: "hp-editor-head" }, h("h3", { class: "hp-panel-title" }, t("Bounty")), h("p", { class: "hp-p hp-small hp-muted" }, view.intro)),
    h("div", { class: "hp-inline" },
      h("label", { class: "hp-field" }, t("Difficulty"), h("select", { id: "bounty-diff", class: "hp-select", onChange: (e) => on.difficulty(e.target.value) },
        view.difficulties.map((d) => h("option", { value: d.value, selected: d.value === view.difficulty }, d.label)))),
      h("div", { class: "hp-field" }, t("Reroll tokens"), stepper({ id: "bounty-tokens", label: t("Reroll tokens"), value: view.tokens, min: 0, max: 10, onSet: on.tokens }),
        view.tokensNote ? h("span", { id: "bounty-tokens-note", class: "hp-caption warn" }, view.tokensNote) : null)),
    h("div", { class: "hp-lists-line" }, h("span", { class: "hp-small" }, view.lists),
      h("button", { id: "bounty-lists", type: "button", class: "hp-linkbtn", onClick: on.lists }, t("Edit lists"))),
    h("datalist", { id: "bounty-names" }, view.suggestions.map((n) => h("option", { value: n }))),
    view.mode === "active" ? activeCard : [view.offers.map(offerCard),
      h("button", { id: "bounty-rerolled", type: "button", class: "hp-btn dashed", onClick: on.rerolled }, t("Rerolled (−1, clears the offers)"))],
    h("div", { class: "hp-editor-foot" }, h("span", { class: "hp-caption" }, view.mode === "active" ? "" : view.note),
      h("button", { id: "bounty-done", type: "button", class: "hp-btn solid", onClick: on.done }, t("Done"))));
}

const editorFrame = (id, title, intro, planLine, body, done) => h("section", { id: "plan-editor", class: "hp-editor", "aria-label": title },
  h("div", { class: "hp-editor-head" }, h("h3", { class: "hp-panel-title" }, title), intro ? h("p", { class: "hp-p hp-small hp-muted" }, intro) : null),
  body,
  h("div", { class: "hp-editor-foot" }, h("span", { "aria-live": "polite" }, h("span", { class: "hp-muted" }, t("Plan:") + " "), h("b", null, planLine)),
    h("button", { id: id + "-done", type: "button", class: "hp-btn solid", onClick: done }, t("Done"))));

function weeklyEditor(v, planLine, on) {
  const item = (id, name, left, done, toggle) => h("li", null, h("span", null, h("b", null, name), " ",
    h("span", { class: "hp-muted" }, left == null ? "" : t("{n} left", { n: left }))),
    h("button", { id: "wkchip-" + id + "-done", type: "button", class: "hp-btn hp-done", "aria-pressed": done ? "true" : "false", "aria-label": t("{creature} done", { creature: name }),
      onClick: toggle }, done ? "✓ " + t("Done") : t("Done")));
  const items = (v.any ? [item("any", "Any Creature", v.any.left, v.any.done, () => on.weeklyAnyDone(!v.any.done))] : [])
    .concat(v.rows.map((r) => item(r.i, r.name, r.left, r.done, () => on.weeklyDone(r.i, !r.done))));
  return editorFrame("weekly", t("Weekly"), null, planLine, [
    items.length ? h("ul", { class: "hp-list" }, items) :
      h("p", { class: "hp-p hp-muted" }, t("No open weekly tasks.")),
    h("a", { href: "#/weekly", id: "weekly-open" }, t("Edit them on the Weekly tab"))], on.done);
}
function todayEditor(v, planLine, on) {
  return editorFrame("today", t("Today’s boosts"), t("Clears at server save."), planLine, [
    h("datalist", { id: "today-names" }, v.names.map((n) => h("option", { value: n }))),
    textInput("today-boosted", t("Boosted creature"), v.boosted, on.boosted, { list: "today-names", autocomplete: "off" }),
    v.prey.map((q) => h("div", { class: "hp-offer", role: "group", "aria-label": t("Prey {n}", { n: q.i + 1 }) },
      textInput("prey-" + q.i + "-name", t("Prey {n}", { n: q.i + 1 }), q.name, (x) => on.prey(q.i, { name: x }), { list: "today-names", autocomplete: "off" }),
      h("div", { class: "hp-grid2" },
        selectField({ id: "prey-" + q.i + "-kind", label: t("Bonus"), value: q.kind, options: q.kinds, onPick: (k) => on.prey(q.i, { kind: k }) }),
        selectField({ id: "prey-" + q.i + "-pct", label: t("Size"), value: q.pct, options: q.sizes, onPick: (x) => on.prey(q.i, { pct: Number(x) }) })),
      h("button", { id: "prey-" + q.i + "-remove", type: "button", class: "hp-linkbtn", onClick: () => on.removePrey(q.i) }, t("Remove")))),
    v.canAddPrey ? h("button", { id: "prey-add", type: "button", class: "hp-btn dashed", onClick: on.addPrey }, t("+ Add a prey")) : null,
    selectField({ id: "today-event", label: t("Exp event"), value: v.event, options: v.events, onPick: (x) => on.event(Number(x)) })], on.done);
}
function timeEditor(v, planLine, on) {
  return editorFrame("time", t("Time"), null, planLine,
    h("div", { class: "hp-presets", role: "group", "aria-label": t("Session length") }, v.options.map((o, i) =>
      h("button", { id: "time-" + i, type: "button", "aria-pressed": o.value === v.value ? "true" : "false", onClick: () => on.hours(o.value) }, o.label))), on.done);
}
function dataEditor(v, planLine, on) {
  return editorFrame("data", t("Data"), t("Your own hunts always come first."), planLine, [
    segmented({ label: t("Numbers from"), options: v.presets, value: v.preset, onPick: (k) => on.sources(v.presets.filter((x) => x.value === k)[0].switches) }),
    h("a", { href: "#/characters", id: "data-more" }, t("Detailed switches in Characters"))], on.done);
}

const whyToggle = (id, text, open, onWhy) => [
  h("button", { id: "why-" + id, type: "button", class: "hp-linkbtn hp-why", "aria-expanded": open ? "true" : "false", onClick: onWhy }, open ? t("Hide why") : t("Why?")),
  open ? h("p", { class: "hp-p hp-small hp-muted" }, text) : null];

function steps(v, ui, on) {
  const st = v.steps, f = st.first, kids = [], takenLead = () => h("span", { class: "hp-muted" }, t("Taken? →") + " ");
  if (st.tokenCheck) kids.push(h("article", { id: "token-check", class: "hp-step note", role: "status", "aria-labelledby": "token-check-title" },
    h("h3", { id: "token-check-title", class: "hp-step-title" }, st.tokenCheck.title),
    h("p", { class: "hp-p hp-small" }, st.tokenCheck.text),
    h("div", { class: "hp-grid2" },
      h("button", { id: "token-check-set", type: "button", class: "hp-btn solid", onClick: on.setTokens }, t("Set tokens")),
      h("button", { id: "token-check-none", type: "button", class: "hp-btn", onClick: on.confirmNoTokens }, t("I have none")))));
  st.notices.forEach((n, i) => kids.push(h("article", { class: "hp-step note" }, h("b", null, n.text), whyToggle("n" + i, n.why, ui.why["n" + i], () => on.why("n" + i)))));
  if (v.hunting) {
    const hu = v.hunting;
    kids.push(h("article", { class: "hp-step hunting", "aria-label": t("Hunting now") },
      h("span", { class: "hp-eyebrow" }, t("Hunting now")), h("h3", { class: "hp-step-title" }, hu.name),
      hu.pick ? h("div", { class: "hp-pick" }, h("span", null, h("b", null, t("The spot is yours: pick offer {letter} now.", { letter: hu.pick.letter })), h("br"),
        h("span", { class: "hp-small" }, t("{creature} on the Task Board. The other two offers will disappear.", { creature: hu.pick.name }))),
        h("button", { id: "hunt-picked", type: "button", class: "hp-btn primary", onClick: () => on.pick(hu.pick.i) }, t("Picked {letter}", { letter: hu.pick.letter }))) : null,
      h("p", { class: "hp-p hp-small hp-muted" }, t("Log it if it was a focused hunt with no breaks.")),
      h("div", { class: "hp-grid2" }, h("button", { id: "hunt-log", type: "button", class: "hp-btn", onClick: () => on.logHunt(hu.spotId) }, t("Log a clean hunt")),
        h("button", { id: "hunt-back", type: "button", class: "hp-btn solid", onClick: on.stopHunting }, t("Back to plan")))));
  } else if (f) {
    kids.push(h("article", { class: "hp-step first", "aria-labelledby": "step1-title" },
      h("span", { class: "hp-eyebrow" }, t("Step 1")), h("h3", { id: "step1-title", class: "hp-step-title" }, f.title),
      f.bounty ? h("span", { class: "hp-bountyline" }, f.bounty) : null,
      h("div", { class: "hp-stats" }, h("div", null, h("div", { class: "hp-stat" }, f.exp), h("div", { class: "hp-caption" }, t("exp/h"))),
        h("div", null, h("div", { class: "hp-stat" }, f.profit), h("div", { class: "hp-caption" }, t("profit/h")))),
      badges(f.badges, true),
      st.refNote ? h("p", { class: "hp-p hp-caption" }, st.refNote) : null,
      h("div", { class: "hp-grid2" },
        h("button", { id: "step1-free", type: "button", class: "hp-btn primary", onClick: () => on.free(f.id) }, t("Free")),
        h("button", { id: "step1-taken", type: "button", class: "hp-btn", onClick: () => on.taken(f.id) }, t("Taken"))),
      whyToggle("first", f.why, ui.why.first, () => on.why("first"))));
  } else kids.push(h("article", { class: "hp-step first" }, h("span", { class: "hp-eyebrow" }, t("Step 1")),
    h("h3", { class: "hp-step-title" }, v.taken.length ? t("Every planned spot is taken") : t("No spot to suggest yet")),
    h("p", { class: "hp-p hp-muted" }, v.taken.length ? t("See Spots for more, or free a spot below if it opened up.") : st.end.why || t("See Spots for every spot with numbers."))));
  if (!v.hunting) st.fallbacks.forEach((r) => kids.push(h("article", { class: "hp-step" },
    h("div", { class: "hp-step-row" }, h("div", null, takenLead(), h("b", null, r.name), h("br"),
      h("span", { class: "hp-small hp-muted" }, t("{exp} exp/h · {profit} profit/h", { exp: r.exp, profit: r.profit })), badges(r.badges.filter((b) => b.kind !== "yours"))),
      h("button", { id: "taken-" + r.id, type: "button", class: "hp-btn", onClick: () => on.taken(r.id) }, t("Taken"))),
    whyToggle(r.id, r.why, ui.why[r.id], () => on.why(r.id)))));
  if (!v.hunting) kids.push(h("button", { id: "step-end", type: "button", class: "hp-step end", onClick: st.end.kind === "reroll" ? on.reroll : on.spots },
    takenLead(), h("b", null, st.end.title), h("br"), h("span", { class: "hp-small hp-muted" }, st.end.line)));
  return h("section", { class: "hp-section", "aria-labelledby": "next-h" }, h("h2", { id: "next-h", class: "hp-eyebrow" }, t("Where to hunt now")), kids);
}

// view: app/views.js planScreenView; ui: {open: editor id or null, why: {id: true}}. on: {toggle(id), why(id), preset(id),
// weight(key, n), bounty: {...}, today: {...}, hours(h), sources(s), free(id), taken(id), freeAgain(id), pick(i),
// stopHunting(), reroll(), spots(), setTokens(), confirmNoTokens()}.
export function render(view, ui, on) {
  const planLine = view.steps ? (view.hunting ? t("Hunting at {spot}", { spot: view.hunting.name }) : view.steps.first ? view.steps.first.title : view.steps.end.title) : "";
  const close = () => on.toggle(null);
  const editors = {
    goal: () => goalEditor(view.goal, { preset: on.preset, weight: on.weight, done: close }),
    bounty: () => bountyEditor(view.bounty, Object.assign({}, on.bounty, { done: close })),
    weekly: () => weeklyEditor(view.weekly, planLine, { weeklyDone: on.weeklyDone, weeklyAnyDone: on.weeklyAnyDone, done: close }),
    today: () => todayEditor(view.today, planLine, Object.assign({}, on.today, { done: close })),
    time: () => timeEditor(view.time, planLine, { hours: on.hours, done: close }),
    data: () => dataEditor(view.data, planLine, { sources: on.sources, done: close }),
  };
  const toggle = (id) => () => on.toggle(ui.open === id ? null : id);
  const chips = [["goal", t("Goal"), view.goal.chip], ["bounty", t("Bounty"), view.bounty && view.bounty.chip], ["weekly", t("Weekly"), view.weekly && view.weekly.chip],
    ["today", t("Today’s boosts"), view.today && view.today.chip], ["time", t("Time"), view.time && view.time.chip], ["data", t("Data"), view.data && view.data.chip]].filter((c) => c[2]);
  const inputs = h("div", { class: "hp-section hp-plan-inputs" },
    h("section", { class: "hp-section", "aria-labelledby": "using-h" },
      h("h2", { id: "using-h", class: "hp-eyebrow" }, t("Plan is using")),
      h("div", { class: "hp-chips" }, chips.map(([id, label, c]) => chip({ id: "chip-" + id, label, value: c.value, set: c.set, warn: c.warn, open: ui.open === id, onToggle: toggle(id) })))),
    ui.open && editors[ui.open] ? editors[ui.open]() : null);
  if (!view.steps) return inputs;
  return h("div", { class: "hp-plan" }, inputs,
    h("div", { class: "hp-section" }, steps(view, ui, on),
      view.taken.length ? h("section", { class: "hp-section", "aria-labelledby": "taken-h" }, h("h2", { id: "taken-h", class: "hp-eyebrow" }, t("Taken spots ({n})", { n: view.taken.length })),
        view.taken.map((x) => h("div", { class: "hp-card hp-step-row" }, h("div", null, h("b", null, x.name), h("br"), h("span", { class: "hp-small hp-muted" }, x.meta)),
          h("button", { id: "free-" + x.id, type: "button", class: "hp-btn", onClick: () => on.freeAgain(x.id) }, t("Free again"))))) : null));
}
