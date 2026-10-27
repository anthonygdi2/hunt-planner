// The shell: header (app name, character switcher, settings), the current screen, and navigation (tab bar on phone,
// header links on desktop). Routes are URL hashes: #/plan, #/spots, #/spot/<id>, #/creatures, #/creature/<slug>, #/weekly,
// #/characters, #/log. With no
// character yet, First run replaces everything. The whole screen re-renders on every state change, keeping focus.
import { h, rerender, icon } from "./dom.js";
import { headerView, firstRunView, charactersPageView, planScreenView, weeklyView, logView, spotsView, spotView, creaturesView, creatureView } from "../app/views.js";
import * as firstRun from "./screens/firstRun.js";
import { t, _ } from "../app/lang.js";
import * as characters from "./screens/characters.js";
import * as plan from "./screens/plan.js";
import * as weeklyScreen from "./screens/weekly.js";
import * as logScreen from "./screens/log.js";
import * as spotsScreen from "./screens/spots.js";
import * as spotScreen from "./screens/spot.js";
import * as creaturesScreen from "./screens/creatures.js";
import * as creatureScreen from "./screens/creature.js";

export const TABS = [["plan", _("Plan")], ["spots", _("Spots")], ["creatures", _("Creatures")], ["weekly", _("Weekly")]];
const ROUTES = TABS.map((t) => t[0]).concat(["characters", "log", "spot", "creature"]);
// Full pages without the tab bar.
const PAGES = ["characters", "log"];

// app: app/app.js createApp(). host: {hash(), go(route), onHashChange(fn), download(name, text) → Promise<message>,
// pickFile() → Promise<text>}.
export function mount(root, app, host) {
  const ui = { adding: false, firstRun: { vocation: null, level: "" }, characters: { armed: false, status: "" }, plan: { open: null, why: {} }, weekly: { armed: false }, spots: { query: "", sort: "score", allVocations: false, anyLevel: false, hideTaken: false, limit: 0 }, spot: { armed: null }, creatures: { difficulty: null, mode: "tiers", query: "", lists: false, add: {} }, creature: { notes: null }, log: { text: "", where: "known", spotId: null, name: "", parentId: "", note: "", raids: {}, leaving: false, back: "plan" } };
  // The route's name ("spot/<id>" is "spot") and its argument (the spot id).
  const path = () => String(host.hash() || "").replace(/^#\/?/, "");
  const route = () => { const r = path().split("/")[0]; return ROUTES.indexOf(r) !== -1 ? r : "plan"; };
  const routeArg = () => { const r = path(), i = r.indexOf("/"); try { return i < 0 ? "" : decodeURIComponent(r.slice(i + 1)); } catch (e) { return ""; } };
  const go = (r) => { ui.characters.armed = false; host.go(r); };

  // A spot's page belongs to the Spots tab, a creature's to Creatures.
  const current = (r, id) => (r === id || (r === "spot" && id === "spots") || (r === "creature" && id === "creatures") ? "page" : null);

  function header(r, inApp) {
    const v = headerView({ profile: inApp ? app.profile() : null });
    return h("header", { class: "hp-header" },
      h("span", { class: "hp-appname" }, v.appName),
      v.character ? h("nav", { class: "hp-nav-desktop", "aria-label": t("Main") }, TABS.map(([id, label]) =>
        h("a", { href: "#/" + id, "aria-current": current(r, id) }, t(label)))) : null,
      v.character ? h("div", { class: "hp-header-end" },
        h("button", { id: "hdr-char", type: "button", class: "hp-switcher", "aria-label": v.character.label, onClick: () => go("characters") },
          h("span", { class: "name" }, v.character.name + " ▾"), h("span", { class: "sub" }, v.character.sub)),
        h("button", { id: "hdr-settings", type: "button", class: "hp-iconbtn", "aria-label": t("Characters and settings"), onClick: () => go("characters") }, icon("settings"))) : null);
  }
  function tabbar(r) {
    return h("nav", { class: "hp-tabbar", "aria-label": t("Main") }, TABS.map(([id, label]) =>
      h("a", { href: "#/" + id, "aria-current": current(r, id) }, icon(id), t(label))));
  }

  function restore(done) {
    host.pickFile().then((text) => {
      if (text == null) return;
      ui.characters.status = t("Restoring…"); draw();
      return app.actions.restoreBackup(text).then((n) => { ui.characters.status = t.n(n, "Restored {n} character from the backup.", "Restored {n} characters from the backup."); if (done) done(); },
        (e) => { ui.characters.status = e && e.message === "bad" ? t("That file isn’t a backup from this tool.") : e && e.message === "empty" ? t("That backup has no characters in it.") : t("Couldn’t restore everything. Try again."); });
    }).then(draw);
  }

  function screen(r) {
    const s = app.state;
    if (s.status === "loading") return h("p", { class: "hp-p hp-muted", role: "status" }, t("Loading…"));
    if (!app.profile() || ui.adding) {
      const f = ui.firstRun, view = firstRunView(Object.assign({ lang: s.lang }, f));
      return firstRun.render(view, {
        cancel: ui.adding && app.profile() ? () => { ui.adding = false; draw(); } : null,
        pickVocation: (v) => { f.vocation = v; draw(); },
        setLevel: (x) => { f.level = x; draw(); },
        start: () => { if (!view.ready) return; ui.adding = false; app.actions.addCharacter({ vocation: view.vocations.filter((v) => v.pressed)[0].name, level: Number(view.level) }); f.level = ""; go("plan"); },
        restore: () => restore(() => go("plan")), setLang: app.actions.setLang,
      });
    }
    if (r === "characters") {
      const a = app.actions, c = ui.characters;
      return characters.render(charactersPageView(s, app.model()), c, {
        back: () => go("plan"), switchCharacter: (id) => { c.armed = false; a.switchCharacter(id); }, add: () => { c.armed = false; ui.firstRun = { vocation: null, level: "" }; ui.adding = true; draw(); },
        update: a.updateCharacter, setSources: a.setSources, setWorld: a.setWorld, setTakenMinutes: a.setTakenMinutes, setAdvanced: a.setAdvanced, setTheme: a.setTheme, setLang: a.setLang,
        arm: (b) => { c.armed = b; draw(); }, deleteCharacter: () => { c.armed = false; a.deleteCharacter(); },
        download: () => a.exportBackup().then((bk) => host.download("hunt-planner-backup-" + bk.exportedAt.slice(0, 10) + ".json", JSON.stringify(bk, null, 2)))
          .then((msg) => { c.status = msg || t("Backup saved."); draw(); }, () => { c.status = t("Couldn’t create the backup. Try again in a moment."); draw(); }),
        restore: () => restore(),
      });
    }
    if (r === "plan") {
      const v = planScreenView(s, app.model(), app.catalog, Date.now()), a = app.actions, P = ui.plan;
      return plan.render(v, P, {
        toggle: (id) => { P.open = id; draw(); },
        why: (id) => { P.why[id] = !P.why[id]; draw(); },
        today: { boosted: a.setBoosted, prey: a.setPrey, addPrey: a.addPrey, removePrey: a.removePrey, event: a.setEvent },
        hours: a.setFixedHours, sources: a.setSources,
        free: (id) => { P.why = {}; a.startHunting(id); }, taken: (id) => { P.why = {}; a.markTaken(id); }, freeAgain: a.markFree,
        pick: a.pickOffer, stopHunting: a.stopHunting, weeklyDone: a.setWeeklyDone, weeklyAnyDone: (on) => a.setWeeklyAny({ done: on }), logHunt: (spotId) => openLog({ spotId, where: "known" }, "plan"),
        reroll: () => { P.open = "bounty"; draw(); }, spots: () => go("spots"), openSpot,
        setTokens: () => { P.open = "bounty"; draw(); }, confirmNoTokens: a.confirmNoTokens,
        preset: a.applyPreset,
        weight: (key, n) => { const w = {}; v.goal.rows.forEach((row) => { w[row.key] = row.value; }); w[key] = n; a.setWeights(w); },
        bounty: { difficulty: a.setDifficulty, tokens: a.setTokens, offer: a.setOffer, pick: a.pickOffer, active: a.setActive, finished: a.finishedBounty, rerolled: a.rerolled },
      });
    }
    if (r === "log") {
      const L = ui.log, M = app.model(), v = logView(L, M, app.catalog, s.advanced), a = app.actions;
      const leave = () => { ui.log = blankLog(); go(L.back || "plan"); };
      return logScreen.render(v, L, {
        text: (t) => { L.text = t; draw(); }, where: (w) => { L.where = w; draw(); }, spot: (id) => { L.spotId = id; draw(); }, name: (n) => { L.name = n; draw(); },
        parent: (id) => { L.parentId = id; draw(); }, note: (n) => { L.note = n; draw(); }, raid: (k, n) => { L.raids[k] = n; draw(); },
        save: () => { if (!v.canSave) return; a.saveHunt({ preview: v.preview, spot: v.where === "known" ? { id: v.spotId } : { name: L.name, parentId: L.parentId || null, note: L.note }, raidsBy: L.raids }); leave(); },
        discard: leave, back: () => { if (L.text.trim()) { L.leaving = true; draw(); } else leave(); }, keep: () => { L.leaving = false; draw(); },
      });
    }
    if (r === "spots") {
      const S = ui.spots;
      return spotsScreen.render(spotsView(s, app.model(), app.catalog, S, Date.now()), {
        query: (q) => { S.query = q; S.limit = 0; draw(); }, sort: (k) => { S.sort = k; draw(); }, toggle: (k, on) => { S[k] = on; S.limit = 0; draw(); },
        open: openSpot, logNew: () => openLog({ where: "new" }, "spots"), more: () => { S.limit = (S.limit || 50) + 50; draw(); },
      });
    }
    if (r === "spot") {
      const id = routeArg(), a = app.actions, U = ui.spot, here = "spot/" + encodeURIComponent(id);
      const v = spotView(s, app.model(), app.catalog, id, { lens: { allVocations: ui.spots.allVocations, anyLevel: ui.spots.anyLevel }, armed: U.armed }, Date.now(), s.advanced);
      return spotScreen.render(v, {
        back: () => go("spots"), taken: () => a.markTaken(id), free: () => a.markFree(id),
        log: () => openLog({ spotId: id, where: "known" }, here), vary: () => openLog({ where: "new", parentId: id }, here), open: openSpot,
        arm: (x) => { U.armed = x; draw(); }, deleteSession: (x) => { U.armed = null; a.deleteSession(x); },
        raid: (x, name, n) => { const ses = v.sessions.filter((y) => y.id === x)[0]; if (ses) a.setSessionRaids(x, Object.assign({}, ses.raidsBy, { [name]: n })); },
        rename: (n) => a.renameSpot(id, n), deleteSpot: () => { U.armed = null; a.deleteSpot(id); go("spots"); },
      });
    }
    if (r === "creatures" || r === "creature") {
      const C = ui.creatures, a = app.actions, diff = C.difficulty || app.model().bounty().difficulty, M = app.modelFor(diff);
      if (r === "creatures") {
        return creaturesScreen.render(creaturesView(s, M, app.catalog, Object.assign({}, C, { difficulty: diff })), {
          difficulty: (d) => { C.difficulty = d; draw(); }, mode: (m) => { C.mode = m; draw(); }, query: (q) => { C.query = q; draw(); }, open: openCreature,
          lists: (open) => { C.lists = open; draw(); }, type: (which, t) => { C.add[which] = t; draw(); },
          slot: (which, slug, on) => { if (on) C.add[which] = ""; (which === "preferred" ? a.setPreferred : a.setUnwanted)(slug, on); },
        });
      }
      const slug = routeArg(), U = ui.creature;
      return creatureScreen.render(creatureView(s, M, app.catalog, slug, diff, U, s.advanced), {
        back: () => go("creatures"), spot: openSpot,
        preferred: (on) => a.setPreferred(slug, on), unwanted: (on) => a.setUnwanted(slug, on), avoid: (on) => a.setAvoid(slug, on),
        bestiary: (on) => a.setBestiaryDone(slug, on), warden: (on) => a.setWardenDone(slug, on),
        notesDraft: (t) => { U.notes = t; }, notes: (t) => { U.notes = null; a.setNotes(slug, t); },
        nums: (k, x) => { if (!a.setCreatureNumbers(slug, { [k]: x })) { s.notice = t("That isn’t a number. Type it like 450, 3.2kk or 800k."); draw(); } },
        pin: (spot) => a.pinSpot(slug, spot), minLevel: (t) => a.setMinLevel(slug, t),
      });
    }
    if (r === "weekly") {
      const M = app.model(), a = app.actions, W = ui.weekly;
      return weeklyScreen.render(weeklyView(M.weekly(), M.weeklyRows(), app.catalog, Date.now()), W, {
        difficulty: a.setWeeklyDifficulty, slots: a.setWeeklySlots, task: a.setWeeklyTask, done: a.setWeeklyDone, any: a.setWeeklyAny,
        newWeek: () => { W.armed = false; a.startNewWeek(); }, arm: (b) => { W.armed = b; draw(); },
      });
    }
    return null;
  }

  // A creature's page.
  function openCreature(slug) { ui.creature = { notes: null }; go("creature/" + slug); }
  // A spot's page.
  function openSpot(id) { ui.spot = { armed: null }; go("spot/" + encodeURIComponent(id)); }
  const blankLog = () => ({ text: "", where: "known", spotId: null, name: "", parentId: "", note: "", raids: {}, leaving: false, back: "plan" });
  // Opens Log a clean hunt with some fields preset, returning to `back` afterwards.
  function openLog(preset, back) { ui.log = Object.assign(blankLog(), preset, { back: back || "plan" }); go("log"); }

  function draw() {
    const r = route(), s = app.state, inApp = s.status === "ready" && !!app.profile() && !ui.adding;
    root.className = "app hp-" + s.theme;
    // The page behind the app takes the theme too.
    root.ownerDocument.documentElement.className = "hp-" + s.theme;
    root.ownerDocument.documentElement.lang = s.lang;
    rerender(root, () => {
      const frag = root.ownerDocument.createDocumentFragment();
      frag.appendChild(header(r, inApp));
      if (s.notice && r !== "characters") frag.appendChild(h("div", { class: "hp-notice", role: "status", style: "margin:12px 16px 0" }, s.notice,
        h("button", { type: "button", class: "hp-linkbtn", onClick: app.actions.clearNotice }, t("Dismiss"))));
      frag.appendChild(h("main", { class: "hp-main", id: "main" }, screen(r)));
      if (inApp && PAGES.indexOf(r) === -1) frag.appendChild(tabbar(r));
      return frag;
    });
  }
  app.subscribe(draw);
  host.onHashChange(draw);
  draw();
  return { draw };
}
