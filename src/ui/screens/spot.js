// One spot: its score and numbers, Mark taken / Free again, Log a clean hunt, the creatures here, where the numbers
// come from, the character's variations of it, and the hunts logged here (delete with an inline confirm; Echo Raid
// counts in Advanced). Advanced mode also renames or deletes a spot the character made.
import { h, icon } from "../dom.js";
import { badges, confirmButton } from "../components.js";
import { t } from "../../app/lang.js";

// view: app/views.js spotView (null: no such spot). on: {back(), taken(), free(), log(), vary(), open(id),
// arm(id | "spot" | null), deleteSession(id), raid(sessionId, name, value), rename(name), deleteSpot()}.
export function render(view, on) {
  const back = h("div", null, h("a", { href: "#/spots", class: "hp-back", onClick: (e) => { e.preventDefault(); on.back(); } }, icon("back", 20), t("Spots")));
  if (!view) return h("div", { class: "hp-section hp-narrow" }, back, h("p", { class: "hp-p hp-muted" }, t("That spot isn’t in the list any more.")));
  const section = (id, title, ...body) => h("section", { class: "hp-section", "aria-labelledby": id }, h("h2", { id, class: "hp-eyebrow" }, title), ...body);
  const src = view.sources, ref = src.reference;
  return h("div", { class: "hp-section hp-narrow" },
    back,
    h("div", { class: "hp-spot-title" },
      h("h1", { class: "hp-panel-title big" }, view.name),
      view.sub ? h("span", { class: "hp-caption" }, view.sub) : null,
      h("span", { id: "spot-score", class: "hp-muted" }, view.scoreLine)),
    h("div", { class: "hp-stats" },
      h("div", null, h("div", { class: "hp-stat" }, view.exp), h("div", { class: "hp-caption" }, t("exp/h"))),
      h("div", null, h("div", { class: "hp-stat" }, view.profit), h("div", { class: "hp-caption" }, t("profit/h")))),
    badges(view.badges, true),
    view.taken ? h("p", { class: "hp-p hp-badges" }, h("span", { class: "hp-badge taken" }, view.taken)) : null,
    h("div", { class: "hp-grid2" },
      view.taken ? h("button", { id: "spot-free", type: "button", class: "hp-btn", onClick: on.free }, t("Free again"))
        : h("button", { id: "spot-taken", type: "button", class: "hp-btn", onClick: on.taken }, t("Mark taken")),
      h("button", { id: "spot-log", type: "button", class: "hp-btn", onClick: on.log }, t("Log a clean hunt"))),
    section("cr-h", t("Creatures here"),
      view.creatures.length ? h("div", { class: "hp-card flush" }, view.creatures.map((c) => h("div", { class: "hp-line" },
        h("span", null, h("b", null, c.name), c.tag ? [h("br"), h("span", { class: "hp-caption" + (c.gold ? " gold" : "") }, c.tag)] : null),
        h("span", { class: "hp-muted" }, c.perHour))))
        : h("p", { class: "hp-p hp-muted" }, t("No creatures known here yet."))),
    section("src-h", t("Where the numbers come from"),
      h("div", { class: "hp-card" },
        h("div", { class: "hp-stack" }, h("b", null, t("Your hunts here")), h("span", { class: "hp-small hp-muted" }, src.hunts)),
        ref ? h("div", { class: "hp-stack hp-sep" }, h("b", null, t("Reference hunt")),
          h("span", { class: "hp-small" }, ref.who, ref.url ? [" · ", h("a", { href: ref.url, target: "_blank", rel: "noopener noreferrer" }, t("Watch"))] : null),
          h("span", { class: "hp-small hp-muted" }, ref.recorded), h("span", { class: "hp-small hp-muted" }, ref.adjusted)) : null,
        src.skipped.length ? h("div", { class: "hp-stack hp-sep" }, h("b", null, t("Other sources not used here")),
          src.skipped.map((x) => h("span", { class: "hp-small hp-muted" }, x))) : null)),
    view.variations ? section("var-h", t("Your variations"),
      view.variations.map((v) => h("a", { href: "#/spot/" + encodeURIComponent(v.id), class: "hp-spot", onClick: (e) => { e.preventDefault(); on.open(v.id); } },
        h("span", { class: "hp-spot-head" }, h("b", null, v.name), v.score != null ? h("span", { class: "hp-spot-score", "aria-label": t("Score {score}", { score: v.score }) }, v.score) : null),
        h("span", { class: "hp-small" }, v.numbers), h("span", { class: "hp-caption" }, v.meta))),
      h("button", { id: "spot-vary", type: "button", class: "hp-dashed", onClick: on.vary }, t("Log a hunt as a new variation"))) : null,
    section("ses-h", t("Your sessions"),
      view.sessions.length ? view.sessions.map((x) => h("div", { class: "hp-card hp-session" },
        h("div", { class: "hp-line" },
          h("span", null, h("b", null, x.date + " · " + x.length), h("br"), h("span", { class: "hp-small hp-muted" }, x.exp + " · " + x.profit + (x.breaks ? " · " + t("with breaks") : ""))),
          x.armed ? null : h("button", { id: "ses-del-" + x.id, type: "button", class: "hp-linkbtn", "aria-label": t("Delete the hunt of {date}", { date: x.date }), onClick: () => on.arm(x.id) }, t("Delete"))),
        x.armed ? h("div", { class: "hp-pick", role: "alert" }, h("b", null, t("Delete this hunt?")),
          h("span", { class: "hp-small hp-muted" }, t("Its numbers stop counting for this spot. This can’t be undone.")),
          h("div", { class: "hp-grid2" }, h("button", { id: "ses-yes-" + x.id, type: "button", class: "hp-btn danger", onClick: () => on.deleteSession(x.id) }, t("Delete")),
            h("button", { id: "ses-no-" + x.id, type: "button", class: "hp-btn", onClick: () => on.arm(null) }, t("Keep it")))) : null,
        x.raids && x.raids.length ? h("div", { class: "hp-raids", role: "group", "aria-label": t("Echo Raids") }, x.raids.map((r, i) =>
          h("label", { class: "hp-field" }, t("{creature} raids", { creature: r.name }), h("input", { id: "ses-raid-" + x.id + "-" + i, class: "hp-input", inputmode: "numeric", value: r.value,
            onChange: (e) => on.raid(x.id, r.name, e.target.value) })))) : null))
        : h("div", { class: "hp-empty" }, view.emptySessions)),
    view.own ? section("own-h", t("Your spot (advanced)"),
      h("label", { class: "hp-field" }, t("Name"), h("input", { id: "spot-name", class: "hp-input", value: view.own.name, maxlength: 60, autocomplete: "off",
        onChange: (e) => on.rename(e.target.value), onKeydown: (e) => { if (e.key === "Enter") e.target.blur(); } })),
      h("span", { class: "hp-caption" }, view.own.deleteText),
      confirmButton({ id: "spot-delete", label: t("Delete this spot"), confirmLabel: t("Tap again to delete"), armed: view.own.armed, onArm: () => on.arm("spot"), onConfirm: on.deleteSpot })) : null);
}
