# Architecture

Status: target design, agreed October 26, 2026. `docs/RESTRUCTURE_PLAN.md` says how we get here from the current code; `docs/design/` is the UI spec. When this file and the code disagree after the restructure is done, fix one of them in the same commit.

## Why it's shaped like this

The app grew as one 14,000-line HTML file where every function could read and write every variable. That made it fast to build and hard to change: a fix in one place could quietly move numbers somewhere else. The structure below splits it into primitives, each with one job, a small explicit interface, and no hidden inputs, arranged in layers that only depend downward. The aim is that a person can understand, test and change one piece without holding the whole app in their head.

## Layers

```
src/
  data/     facts: creatures.json, reference.json, creature-exp.json, rules.js, index.js
  core/     pure logic: numbers in, numbers out
  store/    saving and loading: db adapters, document shapes, migrations, backups
  app/      one state object, the compute pipeline, actions, view models
  ui/       tokens.css, components, screens
  main.js   boot: picks a db adapter, starts the app, mounts the UI
  index.html  shell: markup root, fonts, the bundled script
tools/      build, assemble, reference data pipeline
tests/      unit (core, store, app), golden, ui
```

**The dependency rule.** Imports only point down this list: `ui → app → core → data`, and `app → store`. In particular:

- `core` imports only `core` and `data`. It never touches `document`, `window`, `localStorage`, timers, the db, or the current date. "Now" is a parameter.
- `store` imports only `store` and `data`. It knows document shapes, not game math.
- `app` is the only layer that knows both `store` and `core`.
- `ui` never imports `store` or `core` directly: it reads view models and calls actions from `app`. Small pure formatting helpers (`core/text.js`) are the one exception.

A test (`tests/layers.test.js`) checks imports and forbidden globals per folder, so the rule can't erode.

**What "pure" means here.** Same inputs, same outputs, nothing else changed. A core function takes everything it needs as arguments (character, sessions, reference hunts, settings, now) and returns a new value. It doesn't read module-level state that changes at runtime and doesn't mutate its inputs. Constants from `data/` are fine.

## Data flow

```
 db (Claude artifact db or localStorage)
   │  store: read + normalize + migrate
   ▼
 app/state ──► app/compute (core pipeline) ──► derived ──► app/views ──► ui renders
   ▲                                                                          │
   └──────────── app/actions (validate, write through store) ◄──────── user ──┘
```

1. `store` subscribes to documents and hands `app/state` normalized, migrated values.
2. Any state change marks `derived` stale. `app/compute` runs the core pipeline once and caches the result.
3. `app/views` turns `state + derived` into one plain object per screen (a view model).
4. `ui` renders a view model and wires user input to actions. It holds no game state of its own, only UI state (which editor is open, scroll, focus).
5. An action validates its input, writes through `store`, and updates `state` optimistically.

## Data (`src/data/`)

| File | What | Source, license | Written by |
|---|---|---|---|
| `creatures.json` | 730 creatures: name, bestiary class, task-pool bitmask, wiki title, rare flag | TibiaWiki, CC BY-SA | by hand, rarely |
| `reference.json` | reference hunts per spot and vocation | Kusnier's videos via TibiaPal (permission pending) | `tools/reference/generate.js` |
| `creature-exp.json` | base exp per creature | TibiaWiki, CC BY-SA | `generate.js --exp` |
| `rules.js` | game facts: pools, task sizes, bounty points, reward per kill, Silver/Gold multipliers, bestiary thresholds and charm points, Echo Warden points and raid rates, weekly exp formula and caps, token cap, Prey and event bonuses | each value commented with its source | by hand |
| `index.js` | `DATA`, `REFERENCE`, `PL_EXP` for the bundle: each is a `__BTL_DATA__("<file>")` call that `tools/assemble.js` replaces with the file's contents (or a test's fixture). Only works in the bundle; Node code and tests read the JSON or take data as parameters | | |

`rules.js` is the only place a game number lives, frozen, with names in the vocabulary of this document (`TASK[d].minKills`, `BESTIARY[c].charmPoints`, `RAID.wardenShare`, `weeklyExpFormula(level)`, ...). UI constants (tier colors, labels) and the app's own model parameters (calibration clamps, the reroll discount rate, default session lengths) do not belong here.

## Core primitives (`src/core/`)

Each module lists its job, its main functions, and what it replaces in the old code. Signatures are the contract; internal helpers are free to change.

| Module | Job | Main functions (inputs → output) | Old code |
|---|---|---|---|
| `text.js` | names, slugs, number parsing and formatting | `norm`, `slugify`, `parseNum`, `toInt`, `fmtBig`, `fmtSmall`, `fmtField`, `fmtHours`, `pct`, `joinAnd`, `plural` | helpers |
| `catalog.js` | creature lookup and pools | `makeCatalog(creatures) → {list, bySlug, byName, inPool(slug, diff), poolOf(diff), killKey(kill), nameKey(name)}`; `poolBits(diff)`, `creatureInPool(c, diff)`, `poolsOf(c)`, `topPool(c)` | `itemBySlug`, `itemByKey`, `poolList`, `diffButtons[].classes` |
| `session.js` | read Hunt Analyser text | `parseSession(text, catalog) → Session` (never throws); `sessionProblems(session) → string` ("" when it can be saved) | hunt sessions section |
| `rates.js` | per creature and spot rates from sessions | `deriveRates(sessions, {catalog, xpMode}) → {slug: spot numbers[]}` (choosing among them is `numbers.js`); `spotRates(sessions, catalog, keyOf, mode) → {spot: {kph, xph, pph, hours, kills}}`; `raidRate(sessions, catalog) → {p, info}`; `sessHours`, `sessionSpot`, `xpField` | `derive`, `spotRates`, `buildSpotRates`, `computeRaidRate` |
| `reference.js` | choosing and scaling reference hunts | `pickReference(reference, {vocation, level, enabled, older, team}) → {by, list, other}` (solo entries only unless team is "any"); `calibrate(sessions, picks, catalog) → {calib, calibOther, xpBoost}`; `refNums(entry, calib, other, {xpMode, xpBoost, catalog})`; `referenceSpots({picks, calib, calibOther, sessions, loggedSpots, vocation, otherOn, ...}) → [{e, n, tier, active}]`; `referenceUse(refSpots, own, entries) → {use, shadow}` | `pickRefHunts`, `refRank`, `calibrate`, `addRefSpots`, `mergeRefHunts`, `refNums` |
| `numbers.js` | one creature's working numbers and their source | `pickSpot(spots, pin, {metricFor, weights}) → {spots, best, pinned}`; `effective(entry, pick) → Numbers` with `src` own / refAdj / ref / otherAdj / other; `manualNums(entry)` | `eff`, `pickSpot`, `manualNums` |
| `rewards.js` | bounty task reward and points | `rewardPerKill(diff, creature, chalRates)`, `learnChallenging(...)`, `taskReward({diff, creature, kills, kind, exp})` | `rewardPerKill`, `chalRate`, `basePerKill`, `heldTask` (reward part) |
| `weekly.js` | weekly kill tasks | `weekStart(now)`, `weekKey(now)`, `weeklyReward(level, diff)`, `readWeekly(stored, level, now)`, `weeklyRows(weekly, sessions, catalog, now)`, `openWeeklies(weekly, rows) → [{key, rem, exp}]`, `weeklyBonus(open, spotKph, hours, selfSlug, selfKills) → exp/h` | weekly section, `weeklyFormula`, `computeWeekly`, `weeklyBonus` |
| `metrics.js` | per creature metrics for a goal | `metrics(creature, numbers, ctx) → {xp, profit, charm, bounty, taskHours, ...}` | `metrics`, `bestiaryOf` |
| `score.js` | goal-weighted score and tiers | `scoreList(list, metricFor, weights) → {scores, tiers}`; `presetOf(weights) → name \| "custom"`; `shares(weights)` | `scoreList`, `recompute` (tiering) |
| `reroll.js` | token model and reroll advice | `readReroll(stored)`, `poolModel(diff, {weights, pool, preferred, unwanted, metricsFor, unknown, rewardObs})`, `solvePlan(model, hpd)`, `taskShape`, `rateThreshold`, `beatChance` (the plan chain's reroll cutoff is `rateThreshold`; the old board's `rerollAdvice` was removed in F9) | reroll advice section |
| `slots.js` | Preferred / Unwanted odds | `slotOdds(pool, slots, isGood) → {N, W, pAny, pEach, pBase, pGood, ...}`; `slotSuggestions(which, pool, taken, info, n)` | slots section (pure parts) |
| `spots.js` | the list of spots | `spotIndex({reference, sessions, catalog, spotMeta, userSpots}) → {spots, list, idOf}`; `spotNumbers(spot, ctx)`; `lensCheck(spot, lens, {level, vocation, otherOn})` | `spotIndex`, `spotNums`, `lensCheck` |
| `plan.js` | where to hunt | `todayFactor`, `heldTask`, `spotValue(spot, numbers, opts, ctx)`, `scaleSpots`, `planOffers`, `planOptions({index, offers, hours, team, inLens, valueAt, scale})`, `planChain(options, ctx) → {steps, ...}` | `spotValue`, `spotScores`, `planOffers`, `planOptions`, `planChain` |
| `occupancy.js` | Taken marks and learned odds | `markAge`, `markActive(mark, now, takenMinutes)`, `occOdds(counts, spotId, world, now)`, `orderValue`, `orderByOdds` | `markAge`, `occKey`, `occOdds`, `orderByOdds` |
| `explain.js` | the "Why?" text | `holdWhy`, `goWhy`, `partsWhy`, `rerollWhy`, `srcWhy`, `noNumsWhy`, `oddsText`, `offerLabel`, `aVoc` (F3 rewrites them for the pick mechanic) | `holdWhy`, `goWhy`, `partsWhy`, `rerollWhy`, `srcWhy` |

**Key types** (JSDoc typedefs in `core/types.js`):

- `Session` {id, spot, spotId?, start, end, hours, rawXp, xp, loot, supplies, balance, kills [{slug, count}], breaks, raidsBy, level}
- `Numbers` {kph, xph, pph, cph, spot, spotId, src, samples, lowSample}
- `Spot` {id, name, parentId?, userMade, creatures [slug], entries (reference), sessions, meta {travelMin, access, team, notes}}
- `Step` {kind: "go" | "reroll" | "seeSpots", spotId, offer?, value, numbers, badges, why}
- `Weights` {xp, profit, charm, bounty}, integers 0–5

## The compute pipeline (`app/compute.js`)

Replaces `computeDerived()`, which ran steps that each wrote globals. Each stage is a core call whose output is the next stage's input:

```
catalog      = makeCatalog(DATA)                         (once)
raid         = raidRate(sessions)
picks        = pickReference(REFERENCE, character)
calibration  = calibrate(sessions, picks, catalog)
spotRates    = spotRates(sessions, catalog)
refSpots     = referenceSpots(picks, calibration)
rates        = deriveRates(sessions, {catalog, xpMode})
weekly       = weeklyShare(state.weekly, level)
numbers      = effective(slug, ...) for each creature
metrics      = metrics(creature, numbers, ...) for the chosen difficulty
scores/tiers = scoreList(pool, metrics, weights)
spots        = spotIndex(...) with spotNumbers
plan         = planChain({spots, bounty, weekly, today, time, marks, occupancy, tokens, now})
```

`compute(state, now) → derived` is a pure function of the state, so it's golden-tested as a whole (`tests/golden/expected/compute.json`, the `compute` run of the golden test) and each stage is unit-tested alone. As built (Phase E) its state is `{catalog, reference, profile, sessions, entries, advanced, difficulty}`, and it returns the globals `computeDerived` used to set plus `metrics`, `scores` and `tiers` for the difficulty's pool and `ctx(diff)`, the metrics context, for callers that need more metrics on the same state. `app/state.js` has `makeWatchers(repo)` (one normalized subscription per document type) and `mergeProfiles` (stored profiles plus this device's unsaved changes).

## Store (`src/store/`)

| Module | Job |
|---|---|
| `db.js` | the db interface (`doc`, `collection`, `limit`, `onSnapshot`, `get`, `set`, `update`, `delete`) and two adapters: `claudeDb(host)` over `host.use("db")`, `localDb(storage)` over key `btl.data.v1`. `main.js` passes `window.claude` and `window.localStorage`; tests pass fakes |
| `schema.js` | document paths, and one reader per document type (`readRecord(s)`, `readSession(s)`, `readCreatureDoc(s)`, `readPlState(v, known)`, `readMark(s)`, `readOcc(s)`): takes whatever is stored, returns a valid current-shape object with defaults. Never throws on bad data |
| `migrate.js` | old shape → new shape, per document type (see State model). Pure, unit-tested on fixtures of every old shape |
| `repo.js` | `makeRepo(db, {onDenied})`: `write(path, op, onFail)` (one queue per path, one retry when unavailable), `set`, `update`, `remove`, `newId`, `watch(col, limit, fn)`, `get`, `setDirect` (restore) |
| `backup.js` | `buildBackup`, `backupWrites` (checks, throws "bad" / "empty"), `restoreWrites`, the planner parts. Writes `version: 2` (with the character's own spots) and restores 1 and 2 |
| `prefs.js` | per-device preferences (`btl.*` in the storage `main.js` passes, localStorage in the page): active character, advanced mode, theme |

**Compatibility rule.** Readers accept every shape ever saved. Writers write the current shape and leave old fields they don't own in place (never delete a field on the way through), so a rollback to an older build still finds its data. Old fields are cleaned up only in a later, separate release, if ever.

## State model

Per character (stored under `profiles/{pid}`; locations stay where they are today unless noted):

| Area | Shape | Notes and migration from the current data |
|---|---|---|
| Character | {name?, vocation, level, bestiaryBonus} | unchanged; name optional (shown as "EK 615" until named) |
| Goal | weights {xp, profit, charm, bounty}, integers 0–5 | old 0–10 weights: `w > 0 ? max(1, round(w / 2)) : 0`. The preset name is derived, never stored |
| Sources | {reference, otherVocation, older}, booleans, stored as `sources` in `profiles/{pid}` with `refOff` / `refOtherOff` kept in step | from `refOff` / `refOtherOff`: reference = !refOff, otherVocation = !refOtherOff, older = true. Presets: Mine only (all off), + Reference (reference and older on), Everything (all on). New characters: Everything |
| Bounty | {difficulty, tokens, mode: "offers" \| "active", offers [3] {slug, kills, kind, exp?}, active {slug, kills, killsLeft, kind, exp?, since} \| null} | stored in `profiles/{pid}/planner/state` as `bounty`. From old data: tokens = `reroll.left`; offers from `board.offers` (name → slug); difficulty from planner `diff`; active from planner `held` with killsLeft = kills − done; mode = active if held, else offers |
| Weekly | {weekStart, difficulty, slots: 6 \| 9, exp?, tasks [{slug or name, killsLeft, done}]} | from `weekly`: killsLeft = kills − kills counted from sessions since reset − `extra`, computed once with the old rule at migration; slots = 9 if more than 6 tasks, else 6 |
| Today | {boosted, prey [{slug, kind, pct}], event, day} | unchanged; resets at server save |
| Time | fixedHours or null | unchanged |
| Hunting now | {spotId, at} or null | replaces the planner's `active` session (timer). An old active session migrates to Hunting now at its spot |
| Marks | `profiles/{pid}/marks/{spotId}` {state, at, world} | unchanged; expiry uses the Taken length setting |
| Occupancy | unchanged | unchanged |
| User spots | `profiles/{pid}/spots/{id}` {name, parentId?, note?, createdAt} | new. Sessions gain an optional `spotId`; sessions without one match spots by name and alias as today |
| Settings | {world, takenMinutes (30, 45, 60, 120; default 45)} | stored as `settings` in `profiles/{pid}`; world is read from the planner state until the profile has one (the planner state keeps its copy) |
| Advanced | xpMode, reroll {hpd, unknown}, rewardObs, chalRates, slots {preferred, unwanted}, ref (compare-against) | unchanged |
| Entries | `profiles/{pid}/entries/{slug}` as today | unchanged |
| Sessions | `profiles/{pid}/sessions/{id}` as today, plus optional `spotId` | logging new breaks-allowed sessions is no longer offered, but existing sessions with breaks still count as they do now |

Shared: `creatures/{slug}` {minLevel {vocation: level}}, unchanged.

Per device (localStorage): `btl.profile`, `btl.adv`, `btl.theme` ("system" default). `btl.ui` is retired.

## Actions (`app/actions.js`)

Everything the UI can change, one function each. Each validates input, writes through `store`, and returns nothing the UI must interpret. As built, `app/app.js` holds these (they update the state at once and write in the background, with a notice on failure) and `app/actions.js` holds the write paths they use.

- Character: `addCharacter({vocation, level, name?})`, `switchCharacter(id)`, `updateCharacter(patch)`, `deleteCharacter(id)`
- Goal: `setWeights(weights)`, `applyPreset(name)`
- Bounty: `setDifficulty(d)`, `setTokens(n)`, `setOffer(i, {slug, kills, kind, exp?})`, `pickOffer(i)` (offer i becomes active, killsLeft = kills, the other offers are cleared), `setActive(patch)` (including killsLeft), `finishedBounty()` (tokens +1 up to 10, clear active, mode offers), `rerolled()` (tokens −1, clear offers and active, mode offers)
- Today and time: `setBoosted(slug)`, `setPrey(i, prey)`, `addPrey()`, `removePrey(i)`, `setEvent(pct)`, `setFixedHours(h)`
- Sources: `setSources(presetOrSwitches)`
- Plan: `markTaken(spotId)`, `markFree(spotId)`, `startHunting(spotId)`, `stopHunting()`
- Logging: `readHunt(text) → preview` (pure, no write), `saveHunt({preview, spot: {id} | {name, parentId?, note?}})`, `deleteSession(id)`, `setSessionRaids(id, raidsBy)`
- Spots: `renameSpot(id, name)`, `deleteSpot(id)` (user spots only)
- Creatures: `setAvoid(slug, on)`, `setPreferred(slug, on)`, `setUnwanted(slug, on)`, `setBestiaryDone(slug, on)`, `setWardenDone(slug, on)`, `setNotes(slug, text)`, `setCreatureNumbers(slug, nums)`, `pinSpot(slug, spotId)`, `setMinLevel(slug, level)`
- Weekly: `setWeeklyDifficulty(d)`, `setWeeklySlots(6 | 9)`, `setWeeklyTask(i, {slug, killsLeft})`, `setWeeklyDone(i, on)`, `startNewWeek()`
- Settings: `setWorld(name)`, `setTakenMinutes(m)`, `setTheme(t)`, `setAdvanced(on)`, `setXpMode(m)`, `setHoursPerDay(h)`, `logBoard()` (Silver/Gold observation)
- Backup: `exportBackup() → json`, `restoreBackup(json)`

## View models (`app/views.js`)

One function per screen, as built: `headerView`, `firstRunView`, `charactersPageView`, `planScreenView` (with `goalMixView` and `bountyView` for its editors), `spotsView(state, model, catalog, ui, now)`, `spotView(state, model, catalog, id, ui, now, advanced)`, `creaturesView(state, model, catalog, ui)` (with `slotsView` for the Preferred / Unwanted lists), `creatureView(state, model, catalog, slug, diff, ui, advanced)`, `weeklyView`, `logView(draft, model, catalog, advanced)`. `ui` is the screen's own state (search, sort, toggles, drafts). Each returns plain data shaped like the screen inventory in `docs/design/INVENTORY.md` (labels, numbers already formatted, badges, flags), so the UI makes no decisions about game logic. The numbers behind them are golden-tested through `app/model.js`; the screens are tested from fixed view models (`tests/ui/screens.test.js`).

## UI (`src/ui/`)

- `tokens.css` from `docs/design/TOKENS.md`; `base.css` for elements and layout.
- `components.js`: segmented, switch, setting row, field, select, inline confirm, stepper, source badges. `dom.js`: the element builder, a re-render that keeps focus, icons. `shell.js`: header, tab bar and desktop links, hash routes (`#/spot/<id>`, `#/creature/<slug>` for the two detail pages), theme, and each screen's own UI state.
- `screens/`: plan, spots, spot, creatures, creature, weekly, log, characters, firstRun. Each exports `render(view, ui, on)` returning its element; the shell re-renders the whole screen on every state change.
- Rules from the design: no modal pop-ups; one gold primary action per screen; 44px tap targets; 16px inputs; never color alone; `aria-*` as listed in the components spec; typographic quotes and apostrophes in visible text.

## Decisions

Dated so later sessions know what's settled.

- **2026-10-26 Pick mechanic.** Picking an offer in game removes the other two (maintainer). So the plan never says "hold": while choosing, it names the offer to pick once the spot is free; once picked, only the active bounty counts, and rerolling drops it. This supersedes "holding an offer costs nothing" in `PLANNER_PLAN.md`.
- **2026-10-26 Kills left.** The active bounty and weekly tasks have a "kills left" field the player can type over; it defaults to all kills left. The reward uses the total kills on the offer; each remaining kill is worth reward ÷ kills left. The app doesn't count kills from logged hunts.
- **2026-10-26 Variations** (user spots with a parent) compete in the plan as their own spots.
- **2026-10-26 Goal shares.** Scoring is a weighted average of normalized factors, so the goal mixer's percentage split is accurate. Weights are integers 0–5.
- **2026-10-26 Solo by default everywhere.** Duo and team reference hunts are used only when the lens asks for them. The classic tier list used them for solo characters; that was a bug.
- **2026-10-26 Features the design didn't place** keep working: the Challenging reward field (shown for Challenging creatures on Master), bestiary and Warden done, notes, and Avoid in the creature panel; Raw/boosted exp, hours per day, board logging for Silver/Gold odds, own numbers, pinned spots, "usable from level" and raid counts in Advanced mode. Compare-against-another-character is kept in Advanced for now; candidate for removal.
- **2026-10-26 Code style.** ES modules in `src/`, modern JavaScript allowed (`const`, `let`, arrow functions), bundled by esbuild (pinned dev dependency) into one inline script targeting ES2017. Still no runtime dependencies and one self-contained built file.
- **2026-10-26 Legacy is one module** (Phase C). The Phase B script sections share top-level variables, which separate ES modules can't, so they were joined back into `src/legacy/app.js`; its section comments mark the old files. Phases D and E empty it module by module. The legacy CSS sits in `src/legacy/css/`, included by `src/index.html` until the new `ui/` CSS replaces it in F1. As a module the legacy code runs in strict mode; a parse of it found no sloppy-only constructs.
- **2026-10-26 Data in the bundle** (Phase C). `src/data/index.js` exports `__BTL_DATA__("<file>")` calls that the assembler replaces after bundling, instead of JSON imports, so `assemble()` stays synchronous (esbuild's `buildSync` takes no plugins), tests can still swap in fixtures, and `reference.json` stays one record per line in the page.
- **2026-10-26 Host objects are parameters** (Phase C). `store/` may not touch `window` or `localStorage` (layer test), so its adapters take them as arguments from `main.js`. `core/` additionally may not use timers, `fetch` or `Math.random`.
- **2026-10-26 Actions are thin until Phase F** (Phase E). `app/actions.js` holds every current write path, but the legacy screens still keep their own optimistic copies and failure messages; the actions in this document (validation, optimistic state) arrive with the new screens. Restoring a backup writes outside the queue (`repo.setDirect`) so a failure stops it, as before.
- **2026-10-26 The golden test computes, it doesn't scrape** (F1). With the old UI gone, the fixture and real runs record the same numbers through `app/model.js` (`tests/golden/capture.mjs`); before the switch it matched every number the page capture had recorded. The UI-text sections of the expected files were dropped; Why? text from `core/explain.js` stays.
- **2026-10-26 Settings live in the profile** (F1). The old rule "never add planner fields to the profile" protected planner data from classic code that replaced whole profiles; the app now updates profiles field by field, so `settings` sits there as this document's State model says.
- **2026-10-26 Shell details** (F1). The character switcher in the header opens Characters and settings (no pop-up list); "+ Add" there shows First run with a way back. The page title is "Hunt planner"; the installed app's manifest name was "Bounty Task tier list" until the rename to Hunt Planner (see Name, below). Tabs whose slice hasn't landed show a "being rebuilt" note on the `redesign` branch.
- **2026-10-26 Bounty migration details** (F3). Kills left starts from the kills typed as done only; kills counted from logged hunts are not carried over (the app no longer counts them). Reroll tokens are kept in step in the profile's `reroll.left`; the old board and held offer are left as they were, not mirrored. Step kinds are go, reroll and seeSpots, plus finish (no kills left) and claim (no tokens) before them.
- **2026-10-26 Text on green** (F9). The pressed Done button and a switch's knob use `--bg` on `--yours`, not `--on-gold` as `TOKENS.md` says: `--on-gold` on the light theme's green is 2.7:1; `--bg` is 8.5:1 dark and about 6:1 light.
- **2026-10-26 No typed numbers for a spot** (maintainer, after F10). A spot's own numbers come only from the character's logged hunts ("Yours"); there's no field to type them, so `setSpotNumbers` isn't built. Logged hunts stay in the character's own storage and aren't shared with other players.
- **2026-10-26 Name.** The app is Hunt Planner (maintainer). The repository, the backup's `app` id (`bounty-task-tier-list`) and the GitHub Pages address keep the old name, so existing backups and links still work.
- **2026-10-26 One font.** Atkinson Hyperlegible for titles and numbers as well as text; Pixelify Sans is gone (hard to read, and it looked gimmicky). `--font-title` stays as a token so headings can change in one place.
- **2026-10-26 Languages.** English, Spanish, Brazilian Portuguese and Polish. English text is the key (gettext style): `t("…")`, `t.n(n, one, other)` with Intl plural rules, `_()` for tables; catalogs in `src/data/i18n/`. The UI and view models read the current language from `app/lang.js`; core functions that write text take a translator (`ctx.t`, English by default), so core stays pure and the golden test (English) is unchanged. Creature, spot and in-game feature names stay English, as the client shows them. `tests/unit/i18n.test.js` fails on a missing translation, a placeholder mismatch or a missing plural form. Dates use the language's locale; numbers keep Tibia's kk shorthand.
- **2026-10-26 Module type.** `src/package.json` and `tests/unit/package.json` set `"type": "module"`; the repo root stays CommonJS for the tools and the jsdom tests.

## Conventions

- Tests: core and store modules get unit tests with `node:test` (no jsdom); the golden test guards whole-pipeline outputs; UI tests run screens in jsdom against fixed view models. `npm test` runs all of them.
- Game numbers live in `data/rules.js` with a source comment; change them only with evidence.
- A new feature starts with its contract: the core function signature, the state it reads, the action that changes it, and the view-model fields it adds. Write those down here before coding.
- Keep `CLAUDE.md` short and pointing here.
