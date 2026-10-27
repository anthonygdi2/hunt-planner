// Characters and settings (full page): characters, where numbers come from, spots and world, advanced mode,
// appearance, backup and credits.
import { h, icon } from "../dom.js";
import { segmented, switchCtl, settingRow, field, selectField, confirmButton } from "../components.js";

// The project's repository, for the source code and issue links.
const SOURCE_URL = "https://github.com/anthonygdi2/hunt-planner";
// A link that opens in a new tab.
const ext = (href, text) => h("a", { href, target: "_blank", rel: "noopener noreferrer" }, text);

// view: app/views.js charactersPageView. ui: this page's own state {armed (delete), status (backup/restore line)}.
// on: {back(), switchCharacter(id), add(), update(patch), setSources(s), setWorld(w), setTakenMinutes(m), setAdvanced(b),
//      setTheme(t), deleteCharacter(), arm(b), download(), restore()}.
export function render(view, ui, on) {
  const ro = !view.canWrite, c = view.character, sw = view.sources.switches;
  const section = (id, title, ...body) => h("section", { class: "hp-section", "aria-labelledby": id }, h("h2", { id, class: "hp-eyebrow" }, title), ...body);
  const flip = (key) => (v) => on.setSources(Object.assign({}, sw, { [key]: v }));
  return h("div", { class: "hp-section hp-narrow" },
    h("div", null, h("a", { href: "#/plan", class: "hp-back", onClick: (e) => { e.preventDefault(); on.back(); } }, icon("back", 20), "Plan")),
    h("h1", { class: "hp-panel-title" }, "Characters and settings"),
    view.notice ? h("div", { class: "hp-notice", role: "status" }, view.notice) : null,
    section("ch-h", "Characters",
      h("div", { class: "hp-pills" },
        view.pills.map((p) => h("button", { id: "ch-pill-" + p.id, type: "button", class: "hp-pill", "aria-pressed": p.pressed ? "true" : "false", onClick: () => on.switchCharacter(p.id) }, p.label)),
        h("button", { id: "ch-add", type: "button", class: "hp-pill add", disabled: ro, onClick: on.add }, "+ Add")),
      c ? h("div", { class: "hp-card" },
        field({ id: "ch-name", label: "Name (optional)", value: c.name, placeholder: c.displayName, maxlength: 40, disabled: ro, onCommit: (v) => on.update({ name: v.trim() || null }) }),
        h("div", { class: "hp-grid2" },
          selectField({ id: "ch-voc", label: "Vocation", value: c.vocation, options: view.vocations.map((v) => ({ value: v, label: v })), disabled: ro, onPick: (v) => on.update({ vocation: v }) }),
          field({ id: "ch-level", label: "Level", value: c.level, inputmode: "numeric", disabled: ro, onCommit: (v) => { const n = parseInt(v, 10); if (n > 0 && n < 10000) on.update({ level: n }); } })),
        field({ id: "ch-bonus", label: "Talisman bestiary bonus (%)", value: c.bestiaryBonus, inputmode: "numeric", disabled: ro,
          onCommit: (v) => { const n = Number(v); if (n >= 0 && n <= 100) on.update({ bestiaryBonus: n }); } }),
        confirmButton({ id: "ch-delete", label: "Delete this character…", confirmLabel: "Tap again to delete " + c.displayName + " and everything saved for it", armed: ui.armed,
          disabled: ro, onArm: () => on.arm(true), onConfirm: on.deleteCharacter })) : null),
    c ? section("src-h", "Numbers from",
      segmented({ label: "Numbers from", options: view.sources.presets, value: view.sources.preset, disabled: ro,
        onPick: (k) => on.setSources(view.sources.presets.filter((p) => p.value === k)[0].switches) }),
      h("div", { class: "hp-card flush" },
        settingRow("Your logged hunts", "Always used first.", h("span", { class: "hp-caption" }, "Always on")),
        settingRow("Reference hunts", "Published hunts for spots you haven’t logged. Adjusted to you once you’ve logged a reference spot.",
          switchCtl({ id: "src-ref", label: "Reference hunts", on: sw.reference, disabled: ro, onToggle: flip("reference") })),
        settingRow("Other vocations’ hunts", "Only where nothing better exists. Badged “Other vocation”.",
          switchCtl({ id: "src-other", label: "Other vocations’ hunts", on: sw.otherVocation, disabled: ro, onToggle: flip("otherVocation") })),
        settingRow("Older hunts", "Recorded before the last rebalance. Badged “Older”.",
          switchCtl({ id: "src-older", label: "Older hunts", on: sw.older, disabled: ro, onToggle: flip("older") }))),
      view.sources.preset === "custom" ? h("p", { class: "hp-p hp-caption" }, "Custom: these switches don’t match a preset.") : null,
      h("p", { class: "hp-p hp-small hp-muted" }, view.sources.calibration)) : null,
    c ? section("tk-h", "Spots and world",
      h("div", { class: "hp-grid2" },
        field({ id: "set-world", label: "World (optional)", value: view.settings.world, placeholder: "e.g. Antica", maxlength: 30, disabled: ro, onCommit: on.setWorld }),
        selectField({ id: "set-taken", label: "A Taken mark clears after", value: view.settings.takenMinutes, options: view.settings.takenOptions, disabled: ro,
          onPick: (v) => on.setTakenMinutes(Number(v)) }))) : null,
    section("adv-h", "Advanced",
      h("div", { class: "hp-card flush" }, settingRow("Advanced mode", "Type your own numbers for a creature or spot, set raid counts, and see the full score breakdown in Why?",
        switchCtl({ id: "set-adv", label: "Advanced mode", on: view.advanced, onToggle: on.setAdvanced })))),
    section("ap-h", "Appearance",
      segmented({ label: "Theme", options: view.themes.map((t) => ({ value: t, label: t[0].toUpperCase() + t.slice(1) })), value: view.theme, onPick: on.setTheme })),
    section("bk-h", "Backup",
      h("p", { class: "hp-p hp-small hp-muted" }, view.backupNote),
      h("div", { class: "hp-grid2" },
        h("button", { id: "bk-download", type: "button", class: "hp-btn", onClick: on.download }, "Download backup"),
        h("button", { id: "bk-restore", type: "button", class: "hp-btn", disabled: ro, onClick: on.restore }, "Restore")),
      ui.status ? h("p", { class: "hp-p hp-caption", role: "status" }, ui.status) : null),
    h("p", { class: "hp-credits" }, "Creature data from ", ext("https://tibia.fandom.com/", "TibiaWiki"),
      " (CC BY-SA). Reference hunts read from ", ext("https://www.youtube.com/@Kusnierr/videos", "Kusnier’s hunt videos"), ", also listed on ", ext("https://tibiapal.com/", "TibiaPal"),
      ". Tibia is a trademark of CipSoft GmbH; this fan project isn’t affiliated with CipSoft."),
    h("p", { class: "hp-credits" }, ext(SOURCE_URL, "Source code"), " · ", ext(SOURCE_URL + "/issues", "Report a problem or suggest something")));
}
