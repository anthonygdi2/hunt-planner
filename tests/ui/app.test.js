// The assembled page in jsdom, end to end: first run, the header and navigation, Characters and settings, writes
// reaching the db, old-shape data read through the migrations, and no page errors. Browser-storage mode and a mock of
// the Claude artifact db.
import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM, VirtualConsole } from "jsdom";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { assemble } = require("../../tools/assemble.js");
const html = assemble();
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, what) {
  for (let i = 0; i < 200; i++) { if (fn()) return; await wait(10); }
  throw new Error("timed out waiting for " + what);
}

// A Firestore-like mock of window.claude.use("db") over a plain object of path → document.
function mockDb(store) {
  const subs = [];
  let n = 0;
  const kids = (col) => { const depth = col.split("/").length + 1; return Object.keys(store).sort().filter((p) => p.startsWith(col + "/") && p.split("/").length === depth)
    .map((p) => ({ id: p.split("/").pop(), data: () => JSON.parse(JSON.stringify(store[p])) })); };
  const notify = () => setTimeout(() => subs.forEach((s) => s.alive && s.fn({ docs: kids(s.col) })), 0);
  const doc = (p) => ({ id: p.split("/").pop(), path: p,
    set: async (d) => { store[p] = JSON.parse(JSON.stringify(d)); notify(); },
    update: async (d) => { if (!store[p]) throw { code: "not_found" }; store[p] = Object.assign({}, store[p], JSON.parse(JSON.stringify(d))); notify(); },
    delete: async () => { delete store[p]; notify(); } });
  return { doc, collection: (col) => ({ doc: (id) => doc(col + "/" + (id || "auto" + ++n)),
    limit: () => ({ get: async () => ({ docs: kids(col) }), onSnapshot: (fn) => { const s = { col, fn, alive: true }; subs.push(s); setTimeout(() => fn({ docs: kids(col) }), 0); return () => { s.alive = false; }; } }) }) };
}

function load({ store, prefs, now, browserLang } = {}) {
  const errors = [], vc = new VirtualConsole();
  // jsdom can't follow the backup's download link; anything else it reports is a page error.
  vc.on("jsdomError", (e) => { if (!/Not implemented: navigation/.test(e.message)) errors.push(e.message); });
  const dom = new JSDOM(html, { url: "https://example.org/", runScripts: "dangerously", pretendToBeVisual: true, virtualConsole: vc,
    beforeParse(w) {
      if (now) {
        // The page's clock stopped at `now`, as the golden test does.
        const RealDate = w.Date;
        w.Date = class extends RealDate { constructor(...a) { if (a.length) super(...a); else super(now); } static now() { return now; } };
      }
      Object.entries(prefs || {}).forEach(([k, v]) => w.localStorage.setItem(k, v));
      if (browserLang) Object.defineProperty(w.navigator, "language", { value: browserLang });
      if (store) w.claude = { use: (name) => Promise.resolve(name === "db" ? mockDb(store) : name === "user" ? { canEdit: () => Promise.resolve(true) } : null) };
      w.URL.createObjectURL = () => "blob:x"; w.URL.revokeObjectURL = () => {};
      w.addEventListener("error", (e) => errors.push(e.message));
    } });
  const w = dom.window, d = w.document;
  const $ = (s) => d.querySelector(s);
  const go = async (route) => { w.location.hash = "#/" + route; w.dispatchEvent(new w.HashChangeEvent("hashchange")); await wait(20); };
  const type = async (sel, value, ev) => { const el = $(sel); el.value = value; el.dispatchEvent(new w.Event(ev || "change")); await wait(20); };
  const click = async (sel) => { $(sel).click(); await wait(20); };
  return { w, d, $, go, type, click, errors, local: () => JSON.parse(w.localStorage.getItem("btl.data.v1") || "{}") };
}

test("browser storage: first run, characters and settings, no page errors", async () => {
  const p = load();
  await until(() => p.$("#fr-go"), "first run");
  assert.equal(p.$("#fr-go").disabled, true);
  assert.equal(p.$(".hp-tabbar"), null, "no navigation before there's a character");
  await p.click("#fr-voc-1");
  await p.type("#fr-level", "420", "input");
  await p.click("#fr-go");
  await until(() => p.$("#hdr-char"), "the header's character switcher");
  assert.match(p.$("#hdr-char").textContent, /RP 420.*Royal Paladin · 420/);
  assert.equal(p.w.location.hash, "#/plan");
  assert.equal(p.d.querySelector('.hp-tabbar a[aria-current="page"]').textContent, "Plan");
  const stored = Object.entries(p.local()).filter(([k]) => /^profiles\/[^/]+$/.test(k));
  assert.equal(stored.length, 1);
  const [path, prof] = stored[0];
  assert.deepEqual([prof.vocation, prof.level, prof.name, prof.sources], ["Royal Paladin", 420, undefined, { reference: true, otherVocation: true, older: true }]);

  await p.click("#hdr-settings");
  assert.equal(p.w.location.hash, "#/characters");
  assert.equal(p.$(".hp-tabbar"), null, "Characters is a full page");
  await p.type("#ch-name", "Pally");
  await p.click("#src-older");
  await p.type("#set-taken", "60");
  await p.type("#set-world", "Antica");
  await until(() => (p.local()[path] || {}).name === "Pally", "the name saved");
  const after = p.local()[path];
  assert.deepEqual(after.sources, { reference: true, otherVocation: true, older: false });
  assert.equal(after.refOff, false, "old flags kept in step");
  assert.deepEqual(after.settings, { world: "Antica", takenMinutes: 60 });
  assert.equal(p.$('[aria-label="Numbers from"] button[aria-pressed="true"]'), null, "custom mix of switches: no preset pressed");
  // Theme is per device.
  await p.click('[aria-label="Theme"] button:nth-child(3)');
  assert.match(p.$("#app").className, /hp-light/);
  assert.equal(p.w.localStorage.getItem("btl.theme"), "light");
  // A second character, then delete it with the inline confirm.
  await p.click("#ch-add");
  assert.ok(p.$("#fr-cancel"));
  await p.type("#fr-level", "615", "input");
  await p.click("#fr-go");
  await p.go("characters");
  assert.equal(p.d.querySelectorAll(".hp-pill:not(.add)").length, 2);
  assert.equal(p.d.querySelector('.hp-pill[aria-pressed="true"]').textContent, "EK 615");
  await p.click("#ch-delete");
  assert.match(p.$("#ch-delete").textContent, /Tap again/);
  await p.click("#ch-delete");
  await until(() => Object.keys(p.local()).filter((k) => /^profiles\/[^/]+$/.test(k)).length === 1, "the delete");
  assert.equal(p.d.querySelector('.hp-pill[aria-pressed="true"]').textContent, "Pally · 420");
  // Goal mix on the Plan screen.
  await p.go("plan");
  await p.click("#chip-goal");
  await p.click("#goal-preset-balanced");
  await until(() => (p.local()[path] || {}).goal && p.local()[path].goal.profit === 3, "the goal write");
  assert.deepEqual(p.local()[path].goal, { xp: 3, profit: 3, charm: 0, bounty: 0 });
  assert.deepEqual(p.local()[path].weights, { xp: 6, profit: 6, charm: 0, bounty: 0 }, "old weights in step");
  await p.click('[aria-label="Charm points weight"] button:nth-child(2)');
  assert.equal(p.$("#chip-goal").textContent, "Goal Custom mix");
  assert.equal(p.$("#goal-share").textContent, "Exp 43% · Profit 43% · Charm points 14%");
  // The Bounty: offers, pick, kills left, finished.
  // Tokens never set: 5 assumed, said on the chip and in the editor; stepping from there makes them real.
  assert.match(p.$("#chip-bounty").textContent, /5 tokens \(assumed\)/);
  await p.click("#chip-bounty");
  assert.equal(p.$("#bounty-tokens-note").textContent, "Assumed. Set what you have in game.");
  await p.click("#bounty-tokens-inc");
  await p.type("#offer-0-name", "Frazzlemaw");
  await p.type("#offer-0-kills", "280");
  await p.click("#offer-0-pick");
  assert.match(p.$("#chip-bounty").textContent, /Frazzlemaw · 6 tokens$/);
  await p.type("#active-left", "50");
  const plState = () => Object.entries(p.local()).find(([k]) => k.endsWith("/planner/state"))[1];
  await until(() => plState().bounty && plState().bounty.active && plState().bounty.active.killsLeft === 50, "the kills left write");
  await p.click("#bounty-finished");
  await until(() => plState().bounty.mode === "offers" && plState().bounty.tokens === 7, "the finished write");
  assert.equal(p.local()[path].reroll.left, 7, "tokens in step for older builds");
  // Down to 0: the Plan asks to check, until the player says they have none (for the rest of the server day).
  assert.equal(p.$("#token-check"), null);
  for (let i = 0; i < 7; i++) await p.click("#bounty-tokens-dec");
  await until(() => plState().bounty.tokens === 0, "the 0 tokens write");
  assert.match(p.$("#chip-bounty").className, /warn/);
  assert.match(p.$("#token-check").textContent, /Out of reroll tokens\?/);
  await p.click("#token-check-none");
  await until(() => typeof plState().bounty.zeroChecked === "string", "the confirmation");
  assert.equal(p.$("#token-check"), null);
  assert.equal(plState().bounty.tokens, 0);
  await p.go("characters");
  // Backup download in the browser.
  await p.click("#bk-download");
  await until(() => /Backup saved/.test(p.d.body.textContent), "the backup message");
  assert.deepEqual(p.errors, []);
  p.w.close();
});

test("Claude db with old-shape data: migrations read it, writes go to the shared db", async () => {
  const store = {
    "profiles/main": { name: "Main EK", vocation: "Elite Knight", level: 615, createdAt: "2026-09-26", weights: { xp: 10 }, refOtherOff: true },
    "profiles/main/planner/state": { diff: "master", world: "Secura" },
  };
  const p = load({ store, prefs: { "btl.theme": "dark" } });
  await until(() => p.$("#hdr-char"), "the header");
  assert.match(p.$("#hdr-char").textContent, /Main EK/);
  assert.match(p.$("#app").className, /hp-dark/);
  await p.go("characters");
  assert.equal(p.$("#src-other").getAttribute("aria-checked"), "false");
  assert.equal(p.d.querySelector('[aria-label="Numbers from"] button[aria-pressed="true"]').textContent, "+ Reference");
  assert.equal(p.$("#set-world").value, "Secura", "world from the planner state");
  assert.match(p.d.body.textContent, /Your data syncs across your devices/);
  await p.click('[aria-label="Numbers from"] button:nth-child(3)');
  await until(() => store["profiles/main"].sources, "the sources write");
  assert.deepEqual(store["profiles/main"].sources, { reference: true, otherVocation: true, older: true });
  assert.equal(store["profiles/main"].refOtherOff, false);
  assert.equal(store["profiles/main/planner/state"].world, "Secura", "the planner state is left as it was");
  assert.deepEqual(p.errors, []);
  p.w.close();
});

// The golden fixture's documents as a db: profiles, entries, sessions, the character's own spots, planner state.
function fixtureStore() {
  const fs = require("fs"), path = require("path");
  const bk = JSON.parse(fs.readFileSync(path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..", "golden", "fixture.json"), "utf8"));
  const store = {};
  Object.keys(bk.characters).forEach((id) => {
    const c = bk.characters[id];
    store["profiles/" + id] = c.profile;
    ["entries", "sessions", "spots"].forEach((col) => { Object.keys(c[col] || {}).forEach((x) => { store["profiles/" + id + "/" + col + "/" + x] = c[col][x]; }); });
    const pl = c.planner || {};
    if (pl.state) store["profiles/" + id + "/planner/state"] = pl.state;
  });
  return store;
}

test("the golden fixture's documents (old shapes): the Plan screen, Free, Taken and today's boosts", async () => {
  const store = fixtureStore();
  const p = load({ store, prefs: { "btl.profile": "ek" }, now: Date.parse("2026-10-21T18:00:00Z") });
  await until(() => p.$("#step1-title"), "the first step");
  // The planner state arrives in its own snapshot, after the profile.
  await until(() => /Cobra Assassin · 4 tokens/.test(p.$("#chip-bounty").textContent), "the held offer as the active bounty, tokens from reroll.left");
  assert.match(p.$("#chip-goal").textContent, /Exp/, "weights 10/0/0/0 migrate to the Exp preset");
  assert.match(p.$("#chip-data").textContent, /Everything/);
  const first = p.$("#step1-title").textContent;
  await p.click("#step1-taken");
  await until(() => store["profiles/ek/marks/" + first.replace(/^Go to /, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")], "the Taken mark");
  assert.notEqual(p.$("#step1-title").textContent, first, "the next step moves up");
  assert.match(p.d.body.textContent, /Taken spots \(1\)/);
  await p.click("#step1-free");
  await until(() => (store["profiles/ek/planner/state"] || {}).hunting, "Hunting now saved");
  assert.ok(p.d.querySelector('[aria-label="Hunting now"]'));
  // Log a clean hunt from Hunting now, as a new variation of the spot.
  await p.click("#hunt-log");
  assert.equal(p.w.location.hash, "#/log");
  await p.type("#log-text", ["Session data: From 2026-10-21, 16:00:00 to 2026-10-21, 17:00:00", "Session: 01:00h", "Raw XP Gain: 3,000,000",
    "Balance: 100,000", "Killed Monsters:", "  450x cobra assassin"].join("\n"), "input");
  assert.match(p.d.body.textContent, /Read it: 1 h, 1 creature type\./);
  await p.click('[aria-label="Where did you hunt"] button:nth-child(2)');
  await p.type("#log-name", "Bastion two-box");
  const at = store["profiles/ek/planner/state"].hunting.spotId;
  await p.type("#log-parent", at);
  await p.click("#log-save");
  await until(() => store["profiles/ek/spots/my-bastion-two-box"], "the new spot");
  assert.equal(store["profiles/ek/spots/my-bastion-two-box"].parentId, at);
  const logged = Object.keys(store).filter((k) => k.startsWith("profiles/ek/sessions/") && store[k].spotId === "my-bastion-two-box");
  assert.equal(logged.length, 1);
  assert.equal(store[logged[0]].task, "cobra-assassin", "the active bounty's creature was killed: the session's task");
  assert.equal(p.w.location.hash, "#/plan");
  await until(() => store["profiles/ek/planner/state"].hunting === null, "Hunting now cleared by the log");
  // The Bounty editor compares the four difficulties on the real data.
  await p.click("#chip-bounty");
  assert.ok(p.$("#bounty-advice"), "the difficulty comparison");
  assert.deepEqual([...p.d.querySelectorAll("#bounty-advice tbody th")].map((x) => x.textContent.replace("★ ", "")), ["Master", "Expert", "Adept", "Beginner"]);
  await p.click("#chip-today");
  await p.type("#today-boosted", "Silencer");
  await until(() => (store["profiles/ek/planner/state"].today || {}).boosted === "silencer", "the boosted creature");
  assert.match(p.$("#chip-today").textContent, /Silencer boosted/);
  assert.equal(store["profiles/ek/planner/state"].held.slug, "cobra-assassin", "the old held field is left in place");
  // Weekly: the old list read with the old rule; Done writes the new field and leaves the old one.
  await p.go("weekly");
  assert.equal(p.$("#wk-diff-hint summary").textContent, "Best for exp at level 615: Expert");
  assert.deepEqual([...p.d.querySelectorAll(".hp-wk-row:not(.any)")].slice(0, 4).map((r) => [r.querySelector("input").value, r.querySelectorAll("input")[1].value, r.querySelector("button").getAttribute("aria-pressed")]),
    [["Silencer", "10", "false"], ["Choking Fear", "180", "false"], ["Retching Horror", "0", "true"], ["Dragon Lord", "200", "false"]]);
  await p.click("#wk-3-done");
  await until(() => store["profiles/ek"].weeklyTasks, "the weekly write");
  assert.deepEqual(store["profiles/ek"].weeklyTasks.tasks[3], { slug: "dragon-lord", name: null, killsLeft: 200, done: true });
  assert.equal(store["profiles/ek"].weekly.tasks[0].kills, 600, "the old weekly is left in place");
  // The Any Creature task: kills left typed, then Done.
  await p.type("#wk-any-left", "3000");
  await until(() => (store["profiles/ek"].weeklyTasks.any || {}).killsLeft === 3000, "the Any Creature write");
  await p.click("#wk-any-done");
  await until(() => store["profiles/ek"].weeklyTasks.any.done === true, "Any Creature done");
  assert.deepEqual(store["profiles/ek"].weeklyTasks.tasks[3], { slug: "dragon-lord", name: null, killsLeft: 200, done: true }, "the other tasks stay");
  assert.deepEqual(p.errors, []);
  p.w.close();
});

test("Spots and a spot page over the golden fixture: search, a variation, Taken, raids, delete a hunt, rename and delete a spot", async () => {
  const store = fixtureStore();
  const p = load({ store, prefs: { "btl.profile": "ek", "btl.adv": "1" }, now: Date.parse("2026-10-24T18:00:00Z") });
  await until(() => p.$("#step1-title"), "the plan");
  await p.go("spots");
  assert.match(p.$("#spots-count").textContent, /^\d+ spots?$/);
  assert.equal(p.$('.hp-tabbar a[aria-current="page"]').textContent, "Spots");
  await p.type("#spots-q", "lure", "input");
  const rows = [...p.d.querySelectorAll(".hp-spot")].map((a) => a.textContent);
  assert.equal(rows.length, 1);
  assert.match(rows[0], /Bastion lureYour variation of Cobra Bastion -1\d+.*exp\/h.*Yours · 1 hunt/);
  await p.type("#spots-q", "silencer", "input");
  assert.ok([...p.d.querySelectorAll(".hp-spot b")].some((b) => b.textContent === "Knight Den"), "a creature finds the spots it lives in");
  // The parent spot lists its variation.
  await p.go("spot/cobra-bastion-1");
  assert.match(p.d.body.textContent, /Your variations.*Bastion lure\d*.*Lure two boxes · Yours · 1 hunt · low sample/);
  p.d.querySelector('a[href="#/spot/my-bastion-lure"]').click();
  await wait(20);
  assert.equal(p.w.location.hash, "#/spot/my-bastion-lure");
  assert.match(p.d.body.textContent, /Your variation of Cobra Bastion -1/);
  assert.match(p.d.body.textContent, /Your hunts here1 hunt, 1 h\./);
  await p.click("#spot-taken");
  await until(() => (store["profiles/ek/marks/my-bastion-lure"] || {}).state === "taken", "the Taken mark");
  assert.ok(p.$("#spot-free"));
  await p.type("#ses-raid-e7-0", "2");
  await until(() => (store["profiles/ek/sessions/e7"].raidsBy || {})["Cobra Assassin"] === 2, "the raid count");
  await p.click("#ses-del-e7");
  assert.match(p.d.body.textContent, /Delete this hunt\?/);
  await p.click("#ses-yes-e7");
  await until(() => !store["profiles/ek/sessions/e7"], "the hunt deleted");
  assert.match(p.d.body.textContent, /No hunts logged here/);
  await p.type("#spot-name", "Bastion two-box lure");
  await until(() => store["profiles/ek/spots/my-bastion-lure"].name === "Bastion two-box lure", "the rename");
  await p.click("#spot-delete");
  assert.match(p.$("#spot-delete").textContent, /Tap again/);
  await p.click("#spot-delete");
  await until(() => !store["profiles/ek/spots/my-bastion-lure"], "the spot deleted");
  assert.equal(p.w.location.hash, "#/spots");
  assert.equal(store["profiles/ek/spots/my-knight-den"].name, "Knight Den", "other spots stay");
  assert.deepEqual(p.errors, []);
  p.w.close();
});

test("Creatures over the golden fixture: tiers, a creature page's writes, and the Preferred / Unwanted lists", async () => {
  const store = fixtureStore();
  const p = load({ store, prefs: { "btl.profile": "ek", "btl.adv": "1" }, now: Date.parse("2026-10-24T18:00:00Z") });
  await until(() => p.$("#step1-title"), "the plan");
  await p.go("creatures");
  assert.match(p.d.body.textContent, /Master bounties · Test Knight/);
  assert.ok(p.d.querySelectorAll(".hp-tier-row .hp-cchip").length > 0, "some creatures are tiered");
  assert.equal(p.$('.hp-tabbar a[aria-current="page"]').textContent, "Creatures");
  await p.type("#cr-q", "cobra a", "input");
  const chips = [...p.d.querySelectorAll(".hp-cchip")];
  assert.deepEqual(chips.map((c) => c.getAttribute("aria-label")), ["Cobra Assassin, your bounty, Preferred"], "the fixture has it in Preferred");
  chips[0].click();
  await wait(20);
  assert.equal(p.w.location.hash, "#/creature/cobra-assassin");
  assert.match(p.$("#cr-score").textContent, /^Tier [SABCD] · score \d+ on Master tasks$/);
  assert.equal(p.$("#cr-pref").getAttribute("aria-pressed"), "true");
  await p.click("#cr-unw");
  await until(() => store["profiles/ek"].slots.unwanted.indexOf("cobra-assassin") !== -1 && store["profiles/ek"].slots.preferred.indexOf("cobra-assassin") === -1, "Unwanted, off Preferred");
  await p.click("#cr-pref");
  await until(() => store["profiles/ek"].slots.preferred.indexOf("cobra-assassin") !== -1 && store["profiles/ek"].slots.unwanted.indexOf("cobra-assassin") === -1, "Preferred again, off Unwanted");
  await p.click("#cr-avoid");
  await until(() => (store["profiles/ek/entries/cobra-assassin"] || {}).rating === "X", "Avoid");
  await p.click("#cr-bestiary");
  await until(() => store["profiles/ek/entries/cobra-assassin"].bestiaryDone === true, "bestiary done");
  await p.type("#cr-notes", "Lure two boxes");
  await until(() => store["profiles/ek/entries/cobra-assassin"].notes === "Lure two boxes", "notes");
  await p.type("#cr-num-kph", "1.2k");
  await until(() => store["profiles/ek/entries/cobra-assassin"].kph === 1200, "typed kills/h");
  assert.equal(typeof store["profiles/ek/entries/cobra-assassin"].numsAt, "string");
  assert.equal(store["profiles/ek/entries/cobra-assassin"].name, "Cobra Assassin");
  await p.type("#cr-num-xph", "lots");
  assert.match(p.d.body.textContent, /That isn’t a number/);
  await p.type("#cr-minlevel", "700");
  await until(() => ((store["creatures/cobra-assassin"] || {}).minLevel || {})["Elite Knight"] === 700, "usable from level");
  assert.match(p.d.body.textContent, /Needs level 700 for Elite Knights/);
  await p.click("#cr-avoid");
  await until(() => !("rating" in store["profiles/ek/entries/cobra-assassin"]), "Avoid off");
  // The lists from the Plan's Bounty editor: the line, the offers' marks, and Edit lists opens them on Creatures.
  await p.go("plan");
  await p.click("#chip-bounty");
  assert.match(p.$("#plan-editor").textContent, /★ Preferred 2 of 5 · ⊘ Unwanted 1 of 5/);
  await p.click("#bounty-lists");
  assert.equal(p.w.location.hash, "#/creatures");
  assert.equal(p.$("#cr-lists").getAttribute("aria-expanded"), "true");
  // The lists editor: a suggestion goes into Preferred.
  await p.type("#cr-q", "", "input");
  const sug = p.d.querySelector('[id^="list-preferred-sug-"]');
  const slug = sug.id.replace("list-preferred-sug-", "");
  sug.click();
  await until(() => store["profiles/ek"].slots.preferred.indexOf(slug) !== -1, "a suggested Preferred creature");
  assert.match(p.d.body.textContent, /A Preferred creature on [\d.]+% of boards/);
  assert.deepEqual(p.errors, []);
  p.w.close();
});

test("languages: the browser's language at first, the saved choice after, and the plan's Why? text in it", async () => {
  const first = load({ browserLang: "pt-BR" });
  await until(() => first.$("#fr-go"), "first run");
  assert.match(first.d.body.textContent, /Onde você deve caçar\?/);
  assert.equal(first.d.documentElement.lang, "pt");
  assert.equal(first.$("#fr-lang").value, "pt");
  first.w.close();

  const store = fixtureStore();
  const p = load({ store, prefs: { "btl.profile": "ek", "btl.lang": "pl" }, browserLang: "es-ES", now: Date.parse("2026-10-24T18:00:00Z") });
  await until(() => p.$("#step1-title"), "the plan");
  assert.match(p.d.body.textContent, /Gdzie polować teraz/);
  assert.match(p.$("#step1-title").textContent, /^Idź na /);
  await p.click("#why-first");
  assert.match(p.d.body.textContent, /Wynik \d+: /, "the Why? text comes from core in Polish");
  assert.equal(p.$('.hp-tabbar a[aria-current="page"]').textContent, "Plan");
  await p.go("characters");
  await p.type("#set-lang", "es");
  assert.equal(p.w.localStorage.getItem("btl.lang"), "es");
  assert.equal(p.d.documentElement.lang, "es");
  assert.match(p.d.body.textContent, /Personajes y ajustes/);
  assert.match(p.d.body.textContent, /Las traducciones son nuevas/);
  await p.go("spots");
  assert.match(p.$("#spots-count").textContent, /^\d+ spots?$/);
  await p.type("#spots-q", "zzzz", "input");
  assert.match(p.d.body.textContent, /Ningún spot ni criatura coincide con «zzzz»/);
  assert.deepEqual(p.errors, []);
  p.w.close();
});
