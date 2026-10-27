// Screens rendered from fixed view models in jsdom: what they show, and which action each control calls.
import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { firstRunView, charactersPageView } from "../../src/app/views.js";
import * as firstRun from "../../src/ui/screens/firstRun.js";
import * as characters from "../../src/ui/screens/characters.js";

const dom = new JSDOM("<!doctype html><body></body>");
globalThis.document = dom.window.document;
// Records calls: spy.fn("name") returns a function that logs [name, ...args].
function spy() { const calls = []; return { calls, fn: (name) => (...a) => { calls.push([name].concat(a.filter((x) => !(x instanceof dom.window.Event)))); } }; }
const mount = (el) => { document.body.replaceChildren(el); return (sel) => document.querySelector(sel); };

test("first run: vocations, level, and Show my plan only once a level is typed", () => {
  const s = spy();
  let $ = mount(firstRun.render(firstRunView({ vocation: null, level: "" }), { pickVocation: s.fn("voc"), setLevel: s.fn("level"), start: s.fn("start"), restore: s.fn("restore") }));
  assert.equal(document.querySelectorAll(".hp-choice").length, 5);
  assert.equal($("#fr-voc-0").getAttribute("aria-pressed"), "true", "Elite Knight by default");
  assert.equal($("#fr-go").disabled, true);
  assert.equal($("#fr-cancel"), null);
  $("#fr-voc-2").click();
  $("#fr-level").value = "61x5";
  $("#fr-level").dispatchEvent(new dom.window.Event("input"));
  $("#fr-restore").click();
  assert.deepEqual(s.calls, [["voc", "Elder Druid"], ["level", "61x5"], ["restore"]]);
  const v = firstRunView({ vocation: "Elder Druid", level: "61x5" });
  assert.equal(v.level, "615");
  $ = mount(firstRun.render(v, { pickVocation() {}, setLevel() {}, start: s.fn("start"), restore() {}, cancel: s.fn("cancel") }));
  assert.equal($("#fr-go").disabled, false);
  assert.match(document.body.textContent, /Elder Druid, level 615/);
  $("#fr-go").click();
  $("#fr-cancel").click();
  assert.deepEqual(s.calls.slice(-2), [["start"], ["cancel"]]);
});

const STATE = {
  status: "ready", canWrite: true, local: true, notice: "", pid: "a", order: ["a", "b"], advanced: false, theme: "system", planner: { state: {} },
  profiles: { a: { name: "Main EK", vocation: "Elite Knight", level: 615, bestiaryBonus: 0, refOtherOff: true }, b: { vocation: "Royal Paladin", level: 420 } },
};

test("characters page: what it shows", () => {
  const v = charactersPageView(STATE, null);
  const $ = mount(characters.render(v, { armed: false, status: "" }, new Proxy({}, { get: () => () => {} })));
  assert.deepEqual([...document.querySelectorAll(".hp-pill")].map((b) => [b.textContent, b.getAttribute("aria-pressed")]), [["Main EK · 615", "true"], ["RP 420", "false"], ["+ Add", null]]);
  assert.equal($("#ch-name").value, "Main EK");
  assert.equal($("#ch-voc").value, "Elite Knight");
  assert.equal($("#src-ref").getAttribute("aria-checked"), "true");
  assert.equal($("#src-other").getAttribute("aria-checked"), "false", "refOtherOff migrates to the switch");
  assert.equal($("#src-older").getAttribute("aria-checked"), "true");
  assert.equal([...document.querySelectorAll('[aria-label="Numbers from"] button')].map((b) => b.getAttribute("aria-pressed")).join(), "false,true,false", "+ Reference");
  assert.equal($("#set-taken").value, "45");
  assert.match(document.body.textContent, /TibiaWiki.*CC BY-SA.*Kusnier.*TibiaPal/);
  assert.match(document.body.textContent, /trademark of CipSoft GmbH/);
  assert.deepEqual([...document.querySelectorAll(".hp-credits a")].map((x) => x.getAttribute("href")).slice(-2),
    ["https://github.com/anthonygdi2/hunt-planner", "https://github.com/anthonygdi2/hunt-planner/issues"], "source code and issues");
  assert.match(document.body.textContent, /Not adjusted to you yet/);
});

test("characters page: each control calls its action", () => {
  const s = spy(), on = new Proxy({}, { get: (t, k) => s.fn(k) });
  let $ = mount(characters.render(charactersPageView(STATE, null), { armed: false, status: "" }, on));
  $("#ch-pill-b").click();
  $("#ch-add").click();
  $("#src-other").click();
  [...document.querySelectorAll('[aria-label="Numbers from"] button')][0].click();
  $("#set-adv").click();
  [...document.querySelectorAll('[aria-label="Theme"] button')][2].click();
  $("#ch-name").value = "  Knighty "; $("#ch-name").dispatchEvent(new dom.window.Event("change"));
  $("#ch-level").value = "abc"; $("#ch-level").dispatchEvent(new dom.window.Event("change"));
  $("#ch-level").value = "616"; $("#ch-level").dispatchEvent(new dom.window.Event("change"));
  $("#set-taken").value = "120"; $("#set-taken").dispatchEvent(new dom.window.Event("change"));
  $("#ch-delete").click();
  $("#bk-download").click();
  assert.deepEqual(s.calls, [
    ["switchCharacter", "b"], ["add"], ["setSources", { reference: true, otherVocation: true, older: true }],
    ["setSources", { reference: false, otherVocation: false, older: false }], ["setAdvanced", true], ["setTheme", "light"],
    ["update", { name: "Knighty" }], ["update", { level: 616 }], ["setTakenMinutes", 120], ["arm", true], ["download"]]);
  // Armed: the same button deletes.
  $ = mount(characters.render(charactersPageView(STATE, null), { armed: true, status: "Backup saved." }, on));
  assert.match($("#ch-delete").textContent, /Tap again to delete Main EK/);
  $("#ch-delete").click();
  assert.deepEqual(s.calls.at(-1), ["deleteCharacter"]);
  assert.match(document.body.textContent, /Backup saved\./);
  // Read-only viewers can't change the character.
  mount(characters.render(charactersPageView(Object.assign({}, STATE, { canWrite: false }), null), { armed: false, status: "" }, on));
  assert.equal(document.querySelector("#ch-name").disabled, true);
  assert.equal(document.querySelector("#src-ref").disabled, true);
});

test("plan: the Goal chip opens the goal mixer; presets and weights call their actions", async () => {
  const { goalMixView, planView } = await import("../../src/app/views.js");
  const plan = await import("../../src/ui/screens/plan.js");
  const s = spy(), on = { toggle: s.fn("toggle"), preset: s.fn("preset"), weight: s.fn("weight") };
  const view = planView({ pid: "a", profiles: { a: { goal: { xp: 4, profit: 2, charm: 0, bounty: 0 } } } });
  let $ = mount(plan.render(view, { open: null }, on));
  assert.equal($("#chip-goal").textContent, "Goal Mostly exp, some profit");
  assert.equal($("#chip-goal").getAttribute("aria-expanded"), "false");
  assert.equal($("#plan-editor"), null);
  $("#chip-goal").click();
  $ = mount(plan.render(view, { open: "goal" }, on));
  assert.equal($("#chip-goal").getAttribute("aria-expanded"), "true");
  assert.equal($("#goal-share").textContent, "Exp 67% · Profit 33%");
  assert.equal($("#goal-preset-mostly").getAttribute("aria-pressed"), "true");
  $("#goal-preset-balanced").click();
  [...document.querySelectorAll('[aria-label="Charm points weight"] button')][2].click();
  $("#goal-done").click();
  assert.deepEqual(s.calls, [["toggle", "goal"], ["preset", "balanced"], ["weight", "charm", 2], ["toggle", null]]);
  // Custom mixes and nothing weighted.
  assert.equal(goalMixView({ xp: 3, profit: 2, charm: 0, bounty: 1 }).chip.value, "Custom mix");
  assert.equal(goalMixView({ xp: 0, profit: 0, charm: 0, bounty: 0 }).shareText, "Nothing weighted yet, so the plan uses Exp.");
  assert.equal(planView({ pid: "x", profiles: { x: { weights: { xp: 10 } } } }).goal.chip.value, "Exp", "old 0-10 weights migrate");
});

test("plan: the Bounty editor while choosing offers and once one is picked", async () => {
  const { bountyView } = await import("../../src/app/views.js");
  const { makeCatalog } = await import("../../src/core/catalog.js");
  const plan = await import("../../src/ui/screens/plan.js");
  const catalog = makeCatalog([{ n: "Cobra Assassin", c: "H", m: 12 }, { n: "Gorerilla", c: "C", m: 8 }]);
  const blank = { slug: null, kills: null, kind: "normal", exp: null };
  const choosing = { difficulty: "master", tokens: 4, mode: "offers", active: null,
    offers: [{ slug: "cobra-assassin", kills: 450, kind: "normal", exp: null }, { slug: "gorerilla", kills: 400, kind: "silver", exp: 1627800 }, blank] };
  const s = spy(), bounty = {};
  ["difficulty", "tokens", "offer", "pick", "active", "finished", "rerolled", "lists"].forEach((k) => { bounty[k] = s.fn(k); });
  const goal = { chip: { label: "Goal", value: "Exp", set: true } };
  // The Preferred / Unwanted lists: a line with Edit lists, and the offers' marks.
  let v = bountyView(choosing, catalog, { preferred: ["cobra-assassin"], unwanted: ["gorerilla", "rat"] });
  assert.equal(v.lists, "★ Preferred 1 of 5 · ⊘ Unwanted 2 of 5");
  assert.deepEqual(v.offers.map((o) => o.mark && o.mark.text), ["★ Preferred", "⊘ Unwanted", null]);
  let $ = mount(plan.render({ goal, bounty: v }, { open: "bounty" }, { toggle() {}, bounty }));
  assert.equal($("#offer-0-mark").textContent, "★ Preferred");
  assert.equal($("#offer-1-mark").textContent, "⊘ Unwanted");
  assert.equal($("#offer-2-mark"), null);
  $("#bounty-lists").click();
  assert.deepEqual(s.calls.splice(0), [["lists"]]);
  assert.equal(bountyView(choosing, catalog).lists, "Preferred and Unwanted lists: not set");
  v = bountyView(choosing, catalog);
  assert.equal(v.chip.value, "2 offers · 4 tokens");
  $ = mount(plan.render({ goal, bounty: v }, { open: "bounty" }, { toggle: s.fn("toggle"), bounty }));
  assert.equal($("#chip-bounty").getAttribute("aria-expanded"), "true");
  assert.equal($("#offer-0-name").value, "Cobra Assassin");
  assert.ok($("#offer-1-exp"), "Challenging on Master: reward exp field");
  assert.equal($("#offer-0-exp"), null);
  assert.equal($("#offer-2-pick").disabled, true, "no creature, nothing to pick");
  assert.equal($("#bounty-tokens").textContent, "4");
  $("#offer-2-name").value = "Gorerilla"; $("#offer-2-name").dispatchEvent(new dom.window.Event("change"));
  [...document.querySelectorAll('[aria-label="Offer C kind"] button')][2].click();
  $("#offer-0-pick").click();
  $("#bounty-tokens-dec").click();
  $("#bounty-rerolled").click();
  $("#bounty-diff").value = "expert"; $("#bounty-diff").dispatchEvent(new dom.window.Event("change"));
  assert.deepEqual(s.calls, [["offer", 2, { name: "Gorerilla" }], ["offer", 2, { kind: "gold" }], ["pick", 0], ["tokens", 3], ["rerolled"], ["difficulty", "expert"]]);
  // Active.
  v = bountyView({ difficulty: "master", tokens: 3, mode: "active", offers: [blank, blank, blank], active: { slug: "cobra-assassin", kills: 450, killsLeft: 420, kind: "normal", exp: null } }, catalog);
  assert.equal(v.chip.value, "Cobra Assassin · 3 tokens");
  $ = mount(plan.render({ goal, bounty: v }, { open: "bounty" }, { toggle() {}, bounty }));
  assert.equal($("#offer-0-name"), null, "no offers once a bounty is picked");
  assert.equal($("#active-left").value, "420");
  $("#active-left").value = "100"; $("#active-left").dispatchEvent(new dom.window.Event("change"));
  $("#bounty-finished").click();
  assert.deepEqual(s.calls.slice(-2), [["active", { killsLeft: "100" }], ["finished"]]);
  assert.equal(bountyView({ difficulty: "master", tokens: null, mode: "offers", offers: [blank, blank, blank], active: null }, catalog).chip.set, false, "nothing set: dashed chip");
  // Tokens never set: the model's assumed count, said as such.
  v = bountyView({ difficulty: "master", tokens: 5, assumed: true, mode: "offers", offers: [blank, blank, blank], active: null }, catalog);
  assert.deepEqual([v.chip.value, v.chip.warn, v.tokensNote], ["No offers · 5 tokens (assumed)", false, "Assumed. Set what you have in game."]);
  $ = mount(plan.render({ goal, bounty: v }, { open: "bounty" }, { toggle() {}, bounty }));
  assert.equal($("#bounty-tokens-note").textContent, "Assumed. Set what you have in game.");
  // None left: the chip warns.
  v = bountyView({ difficulty: "master", tokens: 0, assumed: false, mode: "offers", offers: [blank, blank, blank], active: null }, catalog);
  assert.deepEqual([v.chip.value, v.chip.warn], ["No offers · 0 tokens", true]);
  $ = mount(plan.render({ goal, bounty: v }, { open: null }, { toggle() {}, bounty }));
  assert.match($("#chip-bounty").className, /\bwarn\b/);
});

test("plan: the bounty difficulties compared in the Bounty editor", async () => {
  const { bountyView, difficultyAdvice } = await import("../../src/app/views.js");
  const { makeCatalog } = await import("../../src/core/catalog.js");
  const plan = await import("../../src/ui/screens/plan.js");
  const catalog = makeCatalog([{ n: "Cobra Assassin", c: "H", m: 12 }]);
  const row = (diff, rate, extra) => Object.assign({ diff, size: 300, known: 150, coverage: 0.5, enough: rate != null, cost: 0, needsToken: false, rate, gain: null }, extra);
  const cmp = { current: "master", free: true, best: "expert", rows: [row("beginner", null, { known: 20, size: 153 }), row("adept", 0.3, { gain: -0.4 }), row("expert", 0.6, { gain: 0.2 }), row("master", 0.5, { gain: 0 })] };
  const a = difficultyAdvice(cmp);
  assert.equal(a.line, "Expert looks about 20% better for your goal. Switch in game now: it’s free while your bounty is active, and your next board uses it.");
  assert.deepEqual(a.rows.map((r) => [r.name, r.value, r.coverage]), [["Master", "Current", "150 of 300"], ["Expert", "+20%", "150 of 300"], ["Adept", "−40%", "150 of 300"], ["Beginner", "Too few numbers", "20 of 153"]]);
  assert.match(difficultyAdvice(Object.assign({}, cmp, { free: false })).line, /counts the reroll token/);
  assert.equal(difficultyAdvice(Object.assign({}, cmp, { best: null, rows: cmp.rows.map((r) => (r.diff === "expert" ? row("expert", 0.52) : r)) })).line, "Master is close to the best for your goal.");
  assert.equal(difficultyAdvice({ current: "master", free: true, best: null, rows: cmp.rows.map((r) => row(r.diff, null)) }).line, "Not enough numbers yet to compare difficulties.");
  assert.equal(difficultyAdvice(null), null);
  const blank = { slug: null, kills: null, kind: "normal", exp: null };
  const v = bountyView({ difficulty: "master", tokens: 3, mode: "offers", offers: [blank, blank, blank], active: null }, catalog, null, cmp);
  const goal = { chip: { label: "Goal", value: "Exp", set: true } };
  const $ = (sel) => document.querySelector(sel);
  document.body.replaceChildren(plan.render({ goal, bounty: v }, { open: "bounty" }, { toggle() {}, bounty: {} }));
  assert.match($("#bounty-advice").className, /suggest/);
  assert.match($("#bounty-advice").textContent, /Expert looks about 20% better/);
  assert.equal($("#advice-expert").textContent, "★ Expert+20%150 of 300");
  assert.equal(bountyView({ difficulty: "master", tokens: 3, mode: "offers", offers: [blank, blank, blank], active: null }, catalog).advice, null, "not asked for: none");
});

test("plan: steps, Hunting now and Taken spots call their actions", async () => {
  const plan = await import("../../src/ui/screens/plan.js");
  const goal = { chip: { label: "Goal", value: "Exp", set: true } };
  const badge = [{ kind: "refAdj", text: "Reference, adjusted to you" }];
  const view = { goal, bounty: null, weekly: { chip: { set: false }, rows: [] }, today: null, time: { chip: { set: false }, value: null, options: [{ value: null, label: "No limit" }, { value: 2, label: "2 h" }] },
    data: { chip: { set: true, value: "Everything" }, preset: "everything", presets: [] }, taken: [{ id: "lair", name: "Lair", meta: "Marked 5 min ago · clears in 40 min" }], hunting: null,
    steps: { notices: [], refNote: null, notes: [],
      first: { id: "bastion", title: "Go to Cobra Bastion", name: "Cobra Bastion", bounty: "For offer B: Cobra Assassin. Pick it once the spot is free.", exp: "7.8kk", profit: "300k", badges: badge, why: "Because." },
      fallbacks: [{ id: "nuur", title: "Taken? → Ruins of Nuur", name: "Ruins of Nuur", exp: "6.9kk", profit: "450k", badges: [{ kind: "yours", text: "Yours · 9 hunts" }], why: "Also good." }],
      end: { kind: "reroll", title: "Reroll and re-plan", line: "4 tokens left. Or see Spots for more.", why: "" } } };
  const s = spy(), on = {};
  ["toggle", "why", "free", "taken", "freeAgain", "pick", "stopHunting", "reroll", "spots", "hours", "setTokens", "confirmNoTokens", "weeklyDone", "weeklyAnyDone"].forEach((k) => { on[k] = s.fn(k); });
  let $ = mount(plan.render(view, { open: null, why: {} }, on));
  assert.equal($("#step1-title").textContent, "Go to Cobra Bastion");
  assert.equal($("#token-check"), null);
  assert.match(document.body.textContent, /For offer B: Cobra Assassin/);
  assert.match(document.body.textContent, /Reference, adjusted to you/);
  assert.match(document.body.textContent, /Taken spots \(1\)/);
  $("#step1-free").click(); $("#step1-taken").click(); $("#taken-nuur").click(); $("#why-first").click(); $("#step-end").click(); $("#free-lair").click(); $("#chip-time").click();
  assert.deepEqual(s.calls, [["free", "bastion"], ["taken", "bastion"], ["taken", "nuur"], ["why", "first"], ["reroll"], ["freeAgain", "lair"], ["toggle", "time"]]);
  $ = mount(plan.render(view, { open: "time", why: { first: true } }, on));
  assert.equal($("#why-first").getAttribute("aria-expanded"), "true");
  assert.match(document.body.textContent, /Because\./);
  $("#time-1").click();
  assert.deepEqual(s.calls.at(-1), ["hours", 2]);
  // Out of tokens: the check, with Set tokens and I have none.
  $ = mount(plan.render(Object.assign({}, view, { steps: Object.assign({}, view.steps, { tokenCheck: { title: "Out of reroll tokens?", text: "Check." } }) }), { open: null, why: {} }, on));
  assert.equal($("#token-check-title").textContent, "Out of reroll tokens?");
  $("#token-check-set").click(); $("#token-check-none").click();
  assert.deepEqual(s.calls.slice(-2), [["setTokens"], ["confirmNoTokens"]]);
  // The Weekly editor: the Any Creature task first.
  $ = mount(plan.render(Object.assign({}, view, { weekly: { chip: { set: true, value: "0 of 6 done" }, rows: [{ i: 0, name: "Silencer", left: 300, done: false }], any: { left: 2000, done: false } } }), { open: "weekly", why: {} }, on));
  assert.match($("#plan-editor").textContent, /Any Creature 2000 left/);
  $("#wkchip-any-done").click(); $("#wkchip-0-done").click();
  assert.deepEqual(s.calls.slice(-2), [["weeklyAnyDone", true], ["weeklyDone", 0, true]]);
  // Hunting now, with the offer to pick.
  $ = mount(plan.render(Object.assign({}, view, { hunting: { spotId: "bastion", name: "Cobra Bastion", pick: { i: 1, letter: "B", name: "Cobra Assassin" } } }), { open: null, why: {} }, on));
  assert.equal($("#step1-free"), null);
  assert.match(document.body.textContent, /pick offer B now/);
  $("#hunt-picked").click(); $("#hunt-back").click();
  assert.deepEqual(s.calls.slice(-2), [["pick", 1], ["stopHunting"]]);
});

test("weekly: rows, Done, slots and a new week call their actions", async () => {
  const { weeklyView } = await import("../../src/app/views.js");
  const { makeCatalog } = await import("../../src/core/catalog.js");
  const weekly = await import("../../src/ui/screens/weekly.js");
  const catalog = makeCatalog([{ n: "Silencer", c: "H", m: 12 }]);
  const NOW = Date.parse("2026-10-21T18:00:00Z");
  const w = { weekStart: "2026-10-19", difficulty: "master", slots: 6, exp: 1226315, override: null, formula: 1226315, current: true, tasks: [], any: { killsLeft: 2500, done: false } };
  const v = weeklyView(w, [{ i: 0, name: "Silencer", killsLeft: 390, done: false }, { i: 1, name: "Choking Fear", killsLeft: 0, done: true }], catalog, NOW, 615);
  assert.equal(v.diffHint.summary, "Best for exp at level 615: Expert");
  assert.deepEqual(v.diffHint.rows.map((r) => [r.name, r.exp, r.points, r.best, r.current]),
    [["Beginner", "200k (capped)", "25", false, false], ["Adept", "800k (capped)", "50", false, false], ["Expert", "1.23kk", "100", true, false], ["Master", "1.23kk", "110", false, true]]);
  assert.equal(weeklyView(w, [], catalog, NOW, 300).diffHint.rows[3].exp, "Level 400+");
  assert.equal(weeklyView(w, [], catalog, NOW).diffHint, null, "no level: no table");
  assert.match(v.intro, /^Week of Oct 19 · new tasks Oct 26$/);
  assert.equal(v.rows.length, 6);
  assert.equal(v.doneCount, 1);
  const s = spy(), on = {};
  ["difficulty", "slots", "task", "done", "any", "newWeek", "arm"].forEach((k) => { on[k] = s.fn(k); });
  let $ = mount(weekly.render(v, { armed: false }, on));
  assert.equal($("#wk-any-left").value, "2500");
  assert.equal($("#wk-diff-hint summary").textContent, "Best for exp at level 615: Expert");
  assert.equal($("#wk-hint-master th").textContent, "Master (current)");
  assert.equal($("#wk-hint-expert th").textContent, "★ Expert");
  $("#wk-any-left").value = "2400"; $("#wk-any-left").dispatchEvent(new dom.window.Event("change"));
  $("#wk-any-done").click();
  assert.deepEqual(s.calls.splice(0), [["any", { killsLeft: "2400" }], ["any", { done: true }]]);
  assert.equal($("#wk-0-name").value, "Silencer");
  assert.equal($("#wk-1-done").getAttribute("aria-pressed"), "true");
  assert.equal($("#wk-new-now"), null, "this week: no prompt");
  $("#wk-0-left").value = "380"; $("#wk-0-left").dispatchEvent(new dom.window.Event("change"));
  $("#wk-0-done").click();
  $("#wk-slots").value = "9"; $("#wk-slots").dispatchEvent(new dom.window.Event("change"));
  $("#wk-new").click();
  assert.deepEqual(s.calls, [["task", 0, { killsLeft: "380" }], ["done", 0, true], ["slots", 9], ["arm", true]]);
  // Last week: the new-week prompt.
  $ = mount(weekly.render(weeklyView(Object.assign({}, w, { current: false, weekStart: "2026-10-12" }), [], catalog, NOW), { armed: false }, on));
  $("#wk-new-now").click();
  assert.deepEqual(s.calls.at(-1), ["newWeek"]);
});

test("log: paste, where, and save call their actions", async () => {
  const log = await import("../../src/ui/screens/log.js");
  const view = { text: "x", problem: "", read: "Read it: 1 h 2 min, 2 creature types.", preview: { hours: 1 }, where: "new", spotId: "a",
    spots: [{ value: "a", label: "A" }], parents: [{ value: "", label: "None, it’s a new spot" }, { value: "a", label: "A" }], name: "", parentId: "", note: "",
    nameHint: "", creaturesLine: "Creatures come from your paste: Rat.", exp: "5kk", profit: "300k", kph: [{ name: "Rat", perHour: "400/h" }],
    saveText: "Adds the spot.", raids: [{ name: "Rat", value: "" }], canSave: false };
  const s = spy(), on = {};
  ["text", "where", "spot", "name", "parent", "note", "raid", "save", "discard", "back", "keep"].forEach((k) => { on[k] = s.fn(k); });
  let $ = mount(log.render(view, { leaving: false }, on));
  assert.equal($("#log-save").disabled, true, "a new spot needs a name");
  $("#log-name").value = "Rat Cave"; $("#log-name").dispatchEvent(new dom.window.Event("change"));
  $("#log-parent").value = "a"; $("#log-parent").dispatchEvent(new dom.window.Event("change"));
  $("#log-raid-0").value = "2"; $("#log-raid-0").dispatchEvent(new dom.window.Event("change"));
  $("#log-text").value = "y"; $("#log-text").dispatchEvent(new dom.window.Event("input"));
  [...document.querySelectorAll('[aria-label="Where did you hunt"] button')][0].click();
  $("#log-skip").click();
  document.querySelector(".hp-back").click();
  assert.deepEqual(s.calls, [["name", "Rat Cave"], ["parent", "a"], ["raid", "Rat", "2"], ["text", "y"], ["where", "known"], ["discard"], ["back"]]);
  $ = mount(log.render(Object.assign({}, view, { where: "known", canSave: true, raids: null }), { leaving: true }, on));
  assert.match(document.body.textContent, /Discard this hunt\?/);
  $("#log-save").click(); $("#log-keep").click();
  assert.deepEqual(s.calls.slice(-2), [["save"], ["keep"]]);
});

test("spots: search, sort, toggles, rows, more, and the badges legend", async () => {
  const spots = await import("../../src/ui/screens/spots.js");
  const { badgeLegend } = await import("../../src/app/views.js"); const BADGE_LEGEND = badgeLegend();
  const view = { query: "co", sort: "score", sorts: [{ value: "score", label: "Score" }, { value: "exp", label: "Exp/h" }, { value: "profit", label: "Profit/h" }],
    toggles: [{ key: "allVocations", label: "All vocations", on: false }, { key: "anyLevel", label: "Any level", on: true }, { key: "hideTaken", label: "Hide taken", on: false }],
    count: "2 spots", more: 3, empty: "", legend: BADGE_LEGEND,
    rows: [{ id: "cobra-bastion", name: "Cobra Bastion", sub: null, score: "96", numbers: "7.8kk exp/h · 300k profit/h", none: null, creatures: "Cobra Assassin (your bounty)", badges: [{ kind: "refAdj", text: "Reference, adjusted to you" }], taken: "Taken · clears in 25 min" },
      { id: "my-lure", name: "Lure", sub: "Your variation of Cobra Bastion", score: null, numbers: null, none: "Not enough data for your vocation", creatures: "", badges: [], taken: null }] };
  const s = spy(), on = {};
  ["query", "sort", "toggle", "open", "logNew", "more"].forEach((k) => { on[k] = s.fn(k); });
  const $ = mount(spots.render(view, on));
  assert.equal(document.querySelectorAll(".hp-spot").length, 2);
  assert.match(document.querySelector(".hp-spot.taken").textContent, /Cobra Bastion96.*Taken · clears in 25 min/);
  assert.match(document.body.textContent, /Your variation of Cobra BastionNo score/);
  assert.equal($("#spots-anyLevel").getAttribute("aria-pressed"), "true");
  assert.equal(document.querySelectorAll(".hp-legend li").length, 6);
  $("#spots-q").value = "cob"; $("#spots-q").dispatchEvent(new dom.window.Event("input"));
  [...document.querySelectorAll('[aria-label="Sort by"] button')][2].click();
  $("#spots-hideTaken").click();
  $("#spots-log").click();
  document.querySelectorAll(".hp-spot")[1].click();
  $("#spots-more").click();
  assert.deepEqual(s.calls, [["query", "cob"], ["sort", "profit"], ["toggle", "hideTaken", true], ["logNew"], ["open", "my-lure"], ["more"]]);
});

test("spot page: sections, Mark taken, logs, variations, delete a hunt inline, advanced controls", async () => {
  const spot = await import("../../src/ui/screens/spot.js");
  const view = { id: "cobra-bastion", name: "Cobra Bastion", sub: null, parentId: null, scoreLine: "Score 96 for Main EK · Mostly exp, some profit", exp: "7.8kk", profit: "300k",
    badges: [{ kind: "refAdj", text: "Reference, adjusted to you" }], taken: null,
    creatures: [{ slug: "cobra-assassin", name: "Cobra Assassin", perHour: "≈ 400/h", tag: "Your bounty", gold: true }, { slug: "cobra-scout", name: "Cobra Scout", perHour: "≈ 90/h", tag: "Weekly task", gold: false }],
    sources: { hunts: "None yet.", reference: { who: "Elite Knight, level 500+, from Kusnier’s video (Sep 2026)", url: "https://example.org/v", recorded: "As recorded: 9.1kk", adjusted: "Adjusted to you: 7.8kk" },
      skipped: ["Royal Paladin reference, level 300+ (skipped: an Elite Knight hunt exists)"] },
    variations: [{ id: "my-lure", name: "2-box lure", score: "93", numbers: "8.1kk exp/h · 240k profit/h", meta: "Lure two boxes · Yours · 1 hunt · low sample" }], canVary: true,
    sessions: [{ id: "s1", date: "Oct 21", length: "1 h", exp: "4.3kk exp/h", profit: "850k profit/h", breaks: false, armed: false, raidsBy: {}, raids: [{ name: "Cobra Assassin", value: "1" }] }],
    emptySessions: "No sessions.", own: { name: "Cobra Bastion", armed: false, deleteText: "Deletes this spot." } };
  const s = spy(), on = {};
  ["back", "taken", "free", "log", "vary", "open", "arm", "deleteSession", "raid", "rename", "deleteSpot"].forEach((k) => { on[k] = s.fn(k); });
  let $ = mount(spot.render(view, on));
  assert.match(document.body.textContent, /Creatures here.*Cobra AssassinYour bounty≈ 400\/h/);
  assert.match(document.body.textContent, /Other sources not used here.*skipped: an Elite Knight hunt exists/);
  assert.equal(document.querySelector('a[target="_blank"]').getAttribute("rel"), "noopener noreferrer");
  $("#spot-taken").click(); $("#spot-log").click(); $("#spot-vary").click(); document.querySelector('a[href="#/spot/my-lure"]').click();
  $("#ses-del-s1").click();
  $("#ses-raid-s1-0").value = "3"; $("#ses-raid-s1-0").dispatchEvent(new dom.window.Event("change"));
  $("#spot-name").value = "Bastion"; $("#spot-name").dispatchEvent(new dom.window.Event("change"));
  $("#spot-delete").click();
  document.querySelector(".hp-back").click();
  assert.deepEqual(s.calls, [["taken"], ["log"], ["vary"], ["open", "my-lure"], ["arm", "s1"], ["raid", "s1", "Cobra Assassin", "3"], ["rename", "Bastion"], ["arm", "spot"], ["back"]]);
  $ = mount(spot.render(Object.assign({}, view, { taken: "Taken · clears in 5 min", sessions: [Object.assign({}, view.sessions[0], { armed: true })], own: Object.assign({}, view.own, { armed: true }) }), on));
  assert.match(document.body.textContent, /Delete this hunt\?/);
  $("#spot-free").click(); $("#ses-yes-s1").click(); $("#spot-delete").click();
  assert.deepEqual(s.calls.slice(-3), [["free"], ["deleteSession", "s1"], ["deleteSpot"]]);
  mount(spot.render(null, on));
  assert.match(document.body.textContent, /isn’t in the list any more/);
});

test("creatures: difficulty, tiers and table, search, chips, and the lists editor", async () => {
  const creatures = await import("../../src/ui/screens/creatures.js");
  const c = (slug, name, extra) => Object.assign({ slug, name, tier: "S", score: "100", avoid: false, preferred: false, unwanted: false, bounty: null, locked: null, marks: [], label: name,
    spot: "Cobra Bastion", exp: "7kk", profit: "300k", badge: { kind: "yours", text: "Yours" }, rel: 1 }, extra);
  const view = { sub: "Master bounties · Main EK", intro: "How good …", difficulty: "master",
    difficulties: ["master", "expert", "adept", "beginner", "all"].map((value) => ({ value, label: value })), mode: "tiers", query: "",
    tiers: [{ id: "S", label: "Tier S", items: [c("cobra-assassin", "Cobra Assassin", { bounty: "bounty", preferred: true, label: "Cobra Assassin, your bounty, Preferred" })] },
      { id: "A", label: "Tier A", items: [] }, { id: "X", label: "Avoid", items: [c("rat", "Rat", { avoid: true, tier: null, locked: 700 })] }],
    unscored: [c("bat", "Bat", { tier: null, score: null })], unscoredText: "1 creature without numbers yet", table: [c("cobra-assassin", "Cobra Assassin")], empty: "",
    lists: { intro: "Mirror …", odds: ["Main EK on Master tasks: 280 creatures in the pool."], note: "Odds follow …",
      preferred: { which: "preferred", title: "Preferred", rows: [{ slug: "cobra-assassin", name: "Cobra Assassin", why: "Score S", warn: false }], empty: 4, full: false,
        suggestions: [{ slug: "dragolisk", name: "Dragolisk", why: "Score S" }], none: "", typed: "war", matches: [{ slug: "wardragon", name: "Wardragon" }] },
      unwanted: { which: "unwanted", title: "Unwanted", rows: [], empty: 5, full: false, suggestions: [], none: "Mark creatures Avoid …", typed: "", matches: [] } } };
  const s = spy(), on = {};
  ["difficulty", "mode", "query", "open", "lists", "slot", "type"].forEach((k) => { on[k] = s.fn(k); });
  let $ = mount(creatures.render(view, on));
  assert.deepEqual([...document.querySelectorAll(".hp-tier-row")].map((r) => r.getAttribute("aria-label")), ["Tier S", "Tier A", "Avoid"]);
  assert.equal(document.querySelector(".hp-cchip").getAttribute("aria-label"), "Cobra Assassin, your bounty, Preferred");
  assert.match(document.querySelector(".hp-cchip").textContent, /★Cobra Assassin · bounty/);
  assert.match(document.body.textContent, /Rat · 700\+/);
  assert.equal(document.querySelectorAll(".hp-slot-empty").length, 9);
  assert.equal($("#cr-lists").getAttribute("aria-expanded"), "true");
  assert.ok($("#cr-lists").compareDocumentPosition($(".hp-tiers")) & 4, "the lists come before the tiers");
  [...document.querySelectorAll('[aria-label="Task difficulty"] button')][4].click();
  [...document.querySelectorAll('[aria-label="View"] button')][1].click();
  $("#cr-q").value = "cob"; $("#cr-q").dispatchEvent(new dom.window.Event("input"));
  document.querySelector(".hp-cchip").click();
  $("#list-preferred-rm-cobra-assassin").click();
  $("#list-preferred-sug-dragolisk").click();
  [...document.querySelectorAll('[aria-label="Matching creatures"] button')][0].click();
  $("#list-unwanted-add").value = "ra"; $("#list-unwanted-add").dispatchEvent(new dom.window.Event("input"));
  $("#cr-lists").click();
  assert.deepEqual(s.calls, [["difficulty", "all"], ["mode", "table"], ["query", "cob"], ["open", "cobra-assassin"], ["slot", "preferred", "cobra-assassin", false],
    ["slot", "preferred", "dragolisk", true], ["slot", "preferred", "wardragon", true], ["type", "unwanted", "ra"], ["lists", false]]);
  $ = mount(creatures.render(Object.assign({}, view, { mode: "table", lists: null }), on));
  assert.deepEqual([...document.querySelectorAll(".hp-table thead th")].map((x) => x.textContent), ["Creature", "Tier", "Best spot", "Exp/h", "Profit/h", "Source"]);
  assert.match(document.querySelector(".hp-table tbody tr").textContent, /Cobra AssassinS 100Cobra Bastion7kk300kYours/);
  assert.equal($("#lists-editor"), null);
});

test("creature page: numbers and sources, lists and Avoid, bestiary, notes, advanced fields", async () => {
  const creature = await import("../../src/ui/screens/creature.js");
  const view = { slug: "cobra-assassin", name: "Cobra Assassin", classLine: "Hard bestiary · Expert and Master tasks", wiki: "https://tibia.fandom.com/wiki/Cobra_Assassin",
    scoreLine: "Tier S · score 100 on Master tasks", marks: ["Your bounty"], stats: [{ label: "Exp/h", value: "7kk" }], badge: { kind: "yours", text: "Yours" },
    source: "From your hunts at Cobra Bastion.", weekly: "", spots: [{ name: "Cobra Bastion", id: "cobra-bastion", kph: "400/h", exp: "7kk exp/h", profit: "300k profit/h", used: true,
      badge: { kind: "yours", text: "Yours" }, note: "Used." }], noSpots: "", preferred: false, unwanted: true, avoid: false, listsNote: "…",
    bestiary: "2,500 kills for 50 charm points.", bestiaryDone: false, wardenDone: true, rare: false, notes: "lure",
    advanced: { nums: [{ key: "kph", label: "Kills/h", value: "" }, { key: "xph", label: "Exp/h", value: "" }, { key: "pph", label: "Profit/h", value: "" }],
      pin: { value: "", options: [{ value: "", label: "Best for my goal (Cobra Bastion)" }, { value: "Cobra Bastion", label: "Cobra Bastion" }] }, minLevel: "", minLevelLabel: "Usable from level (Elite Knights)" },
    updated: "Last edited Oct 21" };
  const s = spy(), on = {};
  ["back", "spot", "preferred", "unwanted", "avoid", "bestiary", "warden", "notesDraft", "notes", "nums", "pin", "minLevel"].forEach((k) => { on[k] = s.fn(k); });
  let $ = mount(creature.render(view, on));
  assert.equal($("#cr-unw").getAttribute("aria-pressed"), "true");
  assert.equal($("#cr-warden").getAttribute("aria-checked"), "true");
  assert.equal($("#cr-notes").value, "lure");
  $("#cr-pref").click(); $("#cr-unw").click(); $("#cr-avoid").click(); $("#cr-bestiary").click(); $("#cr-warden").click();
  $("#cr-notes").value = "lure two"; $("#cr-notes").dispatchEvent(new dom.window.Event("input")); $("#cr-notes").dispatchEvent(new dom.window.Event("change"));
  $("#cr-num-kph").value = "450"; $("#cr-num-kph").dispatchEvent(new dom.window.Event("change"));
  $("#cr-pin").value = "Cobra Bastion"; $("#cr-pin").dispatchEvent(new dom.window.Event("change"));
  $("#cr-minlevel").value = "700"; $("#cr-minlevel").dispatchEvent(new dom.window.Event("change"));
  document.querySelector('a[href="#/spot/cobra-bastion"]').click();
  document.querySelector(".hp-back").click();
  assert.deepEqual(s.calls, [["preferred", true], ["unwanted", false], ["avoid", true], ["bestiary", true], ["warden", false], ["notesDraft", "lure two"], ["notes", "lure two"],
    ["nums", "kph", "450"], ["pin", "Cobra Bastion"], ["minLevel", "700"], ["spot", "cobra-bastion"], ["back"]]);
  mount(creature.render(Object.assign({}, view, { advanced: null, rare: true }), on));
  assert.equal(document.querySelector("#cr-warden"), null, "rare creatures have no Echo Warden");
  assert.equal(document.querySelector("#cr-num-kph"), null);
  mount(creature.render(null, on));
  assert.match(document.body.textContent, /no creature by that name/);
});
