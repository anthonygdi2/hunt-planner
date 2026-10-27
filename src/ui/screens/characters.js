// Characters and settings (full page): characters, where numbers come from, spots and world, advanced mode,
// appearance and language, backup and credits.
import { h, icon, withNodes } from "../dom.js";
import { segmented, switchCtl, settingRow, field, selectField, confirmButton } from "../components.js";
import { t, _ } from "../../app/lang.js";

// The project's repository, for the source code and issue links.
const SOURCE_URL = "https://github.com/anthonygdi2/hunt-planner";
// A link that opens in a new tab.
const ext = (href, text) => h("a", { href, target: "_blank", rel: "noopener noreferrer" }, text);
const THEME_LABELS = { system: _("System"), dark: _("Dark"), light: _("Light") };

// view: app/views.js charactersPageView. ui: this page's own state {armed (delete), status (backup/restore line)}.
// on: {back(), switchCharacter(id), add(), update(patch), setSources(s), setWorld(w), setTakenMinutes(m), setAdvanced(b),
//      setTheme(t), setLang(l), deleteCharacter(), arm(b), download(), restore()}.
export function render(view, ui, on) {
  const ro = !view.canWrite, c = view.character, sw = view.sources.switches;
  const section = (id, title, ...body) => h("section", { class: "hp-section", "aria-labelledby": id }, h("h2", { id, class: "hp-eyebrow" }, title), ...body);
  const flip = (key) => (v) => on.setSources(Object.assign({}, sw, { [key]: v }));
  return h("div", { class: "hp-section hp-narrow" },
    h("div", null, h("a", { href: "#/plan", class: "hp-back", onClick: (e) => { e.preventDefault(); on.back(); } }, icon("back", 20), t("Plan"))),
    h("h1", { class: "hp-panel-title" }, t("Characters and settings")),
    view.notice ? h("div", { class: "hp-notice", role: "status" }, view.notice) : null,
    section("ch-h", t("Characters"),
      h("div", { class: "hp-pills" },
        view.pills.map((p) => h("button", { id: "ch-pill-" + p.id, type: "button", class: "hp-pill", "aria-pressed": p.pressed ? "true" : "false", onClick: () => on.switchCharacter(p.id) }, p.label)),
        h("button", { id: "ch-add", type: "button", class: "hp-pill add", disabled: ro, onClick: on.add }, t("+ Add"))),
      c ? h("div", { class: "hp-card" },
        field({ id: "ch-name", label: t("Name (optional)"), value: c.name, placeholder: c.displayName, maxlength: 40, disabled: ro, onCommit: (v) => on.update({ name: v.trim() || null }) }),
        h("div", { class: "hp-grid2" },
          selectField({ id: "ch-voc", label: t("Vocation"), value: c.vocation, options: view.vocations.map((v) => ({ value: v, label: v })), disabled: ro, onPick: (v) => on.update({ vocation: v }) }),
          field({ id: "ch-level", label: t("Level"), value: c.level, inputmode: "numeric", disabled: ro, onCommit: (v) => { const n = parseInt(v, 10); if (n > 0 && n < 10000) on.update({ level: n }); } })),
        field({ id: "ch-bonus", label: t("Talisman bestiary bonus (%)"), value: c.bestiaryBonus, inputmode: "numeric", disabled: ro,
          onCommit: (v) => { const n = Number(v); if (n >= 0 && n <= 100) on.update({ bestiaryBonus: n }); } }),
        confirmButton({ id: "ch-delete", label: t("Delete this character…"), confirmLabel: t("Tap again to delete {name} and everything saved for it", { name: c.displayName }), armed: ui.armed,
          disabled: ro, onArm: () => on.arm(true), onConfirm: on.deleteCharacter })) : null),
    c ? section("src-h", t("Numbers from"),
      segmented({ label: t("Numbers from"), options: view.sources.presets, value: view.sources.preset, disabled: ro,
        onPick: (k) => on.setSources(view.sources.presets.filter((p) => p.value === k)[0].switches) }),
      h("div", { class: "hp-card flush" },
        settingRow(t("Your logged hunts"), t("Always used first."), h("span", { class: "hp-caption" }, t("Always on"))),
        settingRow(t("Reference hunts"), t("For spots you haven’t logged."),
          switchCtl({ id: "src-ref", label: t("Reference hunts"), on: sw.reference, disabled: ro, onToggle: flip("reference") })),
        settingRow(t("Other vocations’ hunts"), t("Only where nothing better exists."),
          switchCtl({ id: "src-other", label: t("Other vocations’ hunts"), on: sw.otherVocation, disabled: ro, onToggle: flip("otherVocation") })),
        settingRow(t("Older hunts"), t("From before the last rebalance."),
          switchCtl({ id: "src-older", label: t("Older hunts"), on: sw.older, disabled: ro, onToggle: flip("older") }))),
      view.sources.preset === "custom" ? h("p", { class: "hp-p hp-caption" }, t("Custom: these switches don’t match a preset.")) : null,
      h("p", { class: "hp-p hp-small hp-muted" }, view.sources.calibration)) : null,
    c ? section("tk-h", t("Spots and world"),
      h("div", { class: "hp-grid2" },
        field({ id: "set-world", label: t("World (optional)"), value: view.settings.world, placeholder: t("e.g. Antica"), maxlength: 30, disabled: ro, onCommit: on.setWorld }),
        selectField({ id: "set-taken", label: t("A Taken mark clears after"), value: view.settings.takenMinutes, options: view.settings.takenOptions, disabled: ro,
          onPick: (v) => on.setTakenMinutes(Number(v)) }))) : null,
    section("adv-h", t("Advanced"),
      h("div", { class: "hp-card flush" }, settingRow(t("Advanced mode"), t("Typed creature numbers, raid counts and more detail."),
        switchCtl({ id: "set-adv", label: t("Advanced mode"), on: view.advanced, onToggle: on.setAdvanced })))),
    section("ap-h", t("Appearance"),
      selectField({ id: "set-lang", label: t("Language"), value: view.lang, options: view.langs, onPick: on.setLang }),
      view.langNote ? h("p", { class: "hp-p hp-caption" }, view.langNote) : null,
      segmented({ label: t("Theme"), options: view.themes.map((x) => ({ value: x, label: t(THEME_LABELS[x]) })), value: view.theme, onPick: on.setTheme })),
    section("bk-h", t("Backup"),
      h("p", { class: "hp-p hp-small hp-muted" }, view.backupNote),
      h("div", { class: "hp-grid2" },
        h("button", { id: "bk-download", type: "button", class: "hp-btn", onClick: on.download }, t("Download backup")),
        h("button", { id: "bk-restore", type: "button", class: "hp-btn", disabled: ro, onClick: on.restore }, t("Restore"))),
      ui.status ? h("p", { class: "hp-p hp-caption", role: "status" }, ui.status) : null),
    h("p", { class: "hp-credits" }, withNodes(t("Creature data from {wiki} (CC BY-SA). Reference hunts read from {videos}, also listed on {pal}."), {
      wiki: ext("https://tibia.fandom.com/", "TibiaWiki"), videos: ext("https://www.youtube.com/@Kusnierr/videos", t("Kusnier’s hunt videos")), pal: ext("https://tibiapal.com/", "TibiaPal") }),
      " ", t("Tibia is a trademark of CipSoft GmbH; this fan project isn’t affiliated with CipSoft.")),
    h("p", { class: "hp-credits" }, ext(SOURCE_URL, t("Source code")), " · ", ext(SOURCE_URL + "/issues", t("Report a problem or suggest something"))));
}
