# Hunt Planner: project context

Last updated October 26, 2026 (the redesign, `docs/RESTRUCTURE_PLAN.md` Phase F, on the `redesign` branch). Read this first in any new session.

## What it is

Hunt Planner (called the Bounty Task tier list until October 2026; the repository and backups keep that name) is a web tool for Tibia players that answers “where should I hunt right now?” around the Bounty Task board. The **Plan** screen gives a short chain of steps (go to this spot, for this offer or your active bounty; taken? try that one; else reroll, or see Spots), weighing the bounty, weekly kill tasks, today’s bonuses and the player’s goal mix per spot. **Spots** lists every spot that fits the character with its score and numbers; **Creatures** ranks every bounty creature S to D for the goal (the old Classic tier list); **Weekly** holds the week’s kill tasks. Hunts are logged by pasting Tibia’s Hunting Session Analyser text (**Log a clean hunt**); without logs, published reference hunts fill in, adjusted to the player once a few are logged.

Maintained by the repository owner. Players use the public build on GitHub Pages.

## Where things live

| What | Where |
|---|---|
| Maintainer's development copy | A Claude artifact with the maintainer's own data, published from the assembled page (its link isn't kept in the repo) |
| Public offline build | GitHub Pages: https://anthonygdi2.github.io/hunt-planner/ |
| Repository | https://github.com/anthonygdi2/hunt-planner (Pages serves `main` root; `.nojekyll` present) |
| History before the public release | The earlier repository, `anthonygdi2/bounty-tier-list`, kept private as an archive (the public repository starts from one commit) |
| Development source | `src/index.html` (the page shell), `src/main.js` and the ES modules under `src/` in the layers of `ARCHITECTURE.md` (`data/`, `core/`, `store/`, `app/`, `ui/`), and `src/data/` (the data, with sources and licenses in its README), assembled by `tools/assemble.js` into `dist/index.html` (gitignored; identical to the artifact's HTML) |
| Design | `docs/design/` (`INVENTORY.md` lists every screen, `TOKENS.md` the colors and type, `source/` the Claude Design files) |
| Build script | `tools/build.py` (from `dist/index.html`; `npm run build` assembles first) |
| Hunt planner plan (value model, chain, lens, open questions) | `docs/PLANNER_PLAN.md` |
| Tests | `tests/layers.test.js` (the layer rule), `tests/unit/` (core, store and app modules), `tests/ui/` (screens from fixed view models, and the assembled page end to end), `tests/data.test.js` (embedded data and reference tools), `tests/golden.test.js` (golden output, with `tests/golden/`), all run by `npm test` |
| Reference video queue (which Kusnier videos to read, which are done) | `docs/REFERENCE_VIDEOS.md` |
| Reference readings and tools (source of `src/data/reference.json`, the page's `REFERENCE`) | `tools/reference/` (`readings.json`, `generate.js`, `refresh-videos.js`, `batch.js`, `browser-helpers.js`, `wiki-exp.json`) |
| Reading the next 10 videos | `/reference-batch` in Claude Code (`.claude/skills/reference-batch/SKILL.md`) |

Only a claude.ai chat can republish the Claude artifact (it uses the Artifact tool). Claude Code can edit, test, build and push the repo, which updates GitHub Pages.

## Architecture

- One self-contained HTML page, assembled: `src/index.html` holds the shell (fonts, the UI stylesheets `src/ui/tokens.css` and `base.css`, the `#app` root); `tools/assemble.js` bundles `src/main.js` with esbuild (a pinned dev dependency; IIFE targeting ES2017) into the page and replaces each `__BTL_DATA__("<file>")` from `src/data/index.js` with that data file, writing `dist/index.html` (about 750 KB, of which about 400 KB is `REFERENCE`). `src/index.html` doesn't run on its own. No framework; assembling is the only step during development.
- Layers (`ARCHITECTURE.md`, enforced by `tests/layers.test.js`): `data/` (game rules with sources, the embedded data), `core/` (pure functions: catalog, session parsing, rewards, metrics, score, weekly, rates, reference, numbers, reroll, slots, spots, occupancy, plan, explain), `store/` (the db, preferences, document readers and migrations, backup), `app/` (the compute pipeline, the character model, actions, the running app and view models), `ui/` (components, the shell with hash routes, one module per screen).
- Creature data is `src/data/creatures.json` (730 creatures): `n` name, `c` bestiary class (`E` Easy, `M` Medium, `H` Hard, `C` Challenging), `m` task-pool bitmask (Beginner 1, Adept 2, Expert 4, Master 8), `w` TibiaWiki title when it differs from the name, `r` 1 for rare creatures.
- Reference hunts are `src/data/reference.json` (shape and rules in `REFERENCE_DB_PLAN.md`), one entry per line, generated from `tools/reference/readings.json` by `tools/reference/generate.js`; edit the readings, not the file. Tests swap in a fixture with `assemble({ reference })`.
- All storage goes through one API. Inside Claude, `window.claude.use("db")` returns a Firestore-like store (`doc`, `collection`, `limit`, `onSnapshot`, `get`, `set`, `update`, `delete`). Outside Claude, `localDb()` provides the same API over `localStorage` key `btl.data.v1`. The artifact declares `db` (rules: read "view", write "admin") and `downloads`.
- Per-device preferences in localStorage: `btl.profile` (active character), `btl.adv` (Advanced mode), `btl.theme` (system, light or dark), `btl.lang` (en, es, pt or pl; the browser's language until chosen). `btl.ui` is retired.
- Languages: English, Spanish, Brazilian Portuguese and Polish. Code writes English wrapped in `t()`; the translations are in `src/data/i18n/`, keyed by the English text (`core/i18n.js`, `app/lang.js`, `tools/i18n.js`; how-to in `CONTRIBUTING.md`).
- Font: Atkinson Hyperlegible for everything (Pixelify Sans was dropped for readability, October 2026). The dev file loads them from Google Fonts; the build inlines them.

### Data model

Old fields stay readable: each new shape below is read from the old one until it's first written, and the old field is left in place (`store/schema.js`).

- `profiles/{pid}`: name (optional), vocation, level, `bestiaryBonus` (Talisman double-bestiary %), `goal {xp, profit, charm, bounty}` (0–5; the older `weights`, 0–10, kept in step at twice the scale), `sources {reference, otherVocation, older}` (with the older `refOff` / `refOtherOff` kept in step), `settings {world, takenMinutes}`, `weeklyTasks {weekStart, difficulty, slots 6 | 9, exp, tasks [{slug or name, killsLeft, done}], any {killsLeft, done}}` (from the older `weekly`; `any` is the Any Creature task), `slots {preferred[], unwanted[]}`, `reroll {left, hpd, unknown}` (`left` kept in step with the bounty's tokens), `xpMode` ("raw" or "xp"), `rewardObs {diff: [...]}` (Silver/Gold frequency log), `chalRates {slug: [{kills, exp, kind, perKill, level, at}]}`, `ref` (compare-against character). The old `board` is read once for the bounty and left as it was.
- `profiles/{pid}/entries/{slug}`: `rating` ("X" means Avoid), typed `kph/xph/pph`, `notes`, `bestiaryDone`, `wardenDone`, `pinSpot`, `numsAt`, `updatedAt`.
- `profiles/{pid}/sessions/{id}`: spot, `spotId` (new; the spot it belongs to), task (slug or null), start, end, hours, rawXp, xp, loot, supplies, balance, `kills [{slug, name, count}]`, `breaks` (older sessions only; new logs are clean hunts), `raidsBy {name: count}`, level.
- `profiles/{pid}/spots/{id}` (new): the character's own spots and variations `{name, parentId, note, createdAt}`; ids are `my-` plus a slug.
- `creatures/{slug}`: `minLevel {vocation: level}` (shared across characters).
- Planner documents:
  - `profiles/{pid}/planner/state`: `bounty {difficulty, tokens (null until set; 5 assumed), mode "offers" | "active", offers [3] {slug, kills, kind, exp}, active {slug, kills, killsLeft, kind, exp, since}, zeroChecked}` (from the older `diff`, `held` and the profile's `board` / `reroll.left`), `hunting {spotId, at}` (from the older session card `active`), `fixedHours` (a chosen session length; none means hourly rates), `today {boosted, boostedDay, prey[{slug, kind, pct}], event}`, `world` (read for settings until the profile has one), `travel {spotId: minutes}`, `lens`.
  - `profiles/{pid}/marks/{spotId}`: the latest Free/Taken mark `{state, at, world}`.
  - `profiles/{pid}/occupancy/{spotId}`: `{counts: {"world|hour": [free, taken]}}`, the mark history as counts per world and UTC hour.
- Backups are JSON: `{app: "bounty-task-tier-list", version: 2, characters: {pid: {profile, entries, sessions, planner?, spots?}}, creatures}`. `planner` (`state`, `marks`, `occupancy`) and `spots` are optional; version 1 files (no spots) restore as before.

### Screens

Phone first: a tab bar (Plan, Spots, Creatures, Weekly) on phones, header links on desktop; the header's character switcher and settings button open Characters. No pop-ups: editors open inline, and destructive actions confirm in place. Each screen is listed in `docs/design/INVENTORY.md`.

- **Plan** (home): chips for Goal, Bounty, Weekly, Today's boosts, Time and Data, each opening its editor inline (the goal mixer with presets; the bounty's three offers or the active bounty, with tokens and difficulty; Done toggles for weekly tasks; the boosted creature, prey and exp event; a session length; the data sources); the step chain with Free and Taken and a Why? under each; Hunting now (with Log a clean hunt and Back to plan); Taken spots with Free again.
- **Spots**: search, sort by Score, Exp/h or Profit/h, All vocations / Any level / Hide taken, source badges and their legend. A **spot page** shows its score and numbers, Mark taken, the creatures there, where the numbers come from, the character's variations and the hunts logged there.
- **Creatures**: tiers S–D and Avoid or a table for a task difficulty, search, and the Preferred and Unwanted lists with board odds. A **creature page** shows its tier, numbers and sources, the spots it lives in, Preferred / Unwanted / Avoid, bestiary and Echo Warden done, notes.
- **Weekly**: the Any Creature task (kills left typed by the player) and 6 or 9 kill tasks with kills left and Done; Start a new week (offered after Monday's reset).
- **Log a clean hunt** (full page): paste, the preview, a known spot or a new spot or variation.
- **Characters and settings** (full page): characters, sources, world, Taken length, Advanced mode, theme, backup and restore, credits. First run asks for vocation and level only.

Advanced mode (per device) adds: Echo Raid counts per hunt, renaming or deleting the character's own spots, and on a creature page typed numbers, the spot its numbers come from and the level it's usable from.

## How the numbers work

- **Session rates** (`core/rates.js`): per creature and spot, kill rate comes only from clean time (sessions without breaks); exp, profit and kill share are taken per kill from all sessions, then scaled by that clean kill rate. Sessions where the creature was the active bounty are preferred (they include the Talisman bonus). Each creature uses the spot that scores best for the goal unless pinned. Typed numbers override sessions field by field.
- **Metrics** (`core/metrics.js`): exp/h = hunting exp/h + task reward/h + weekly reward share/h. Charm/h = bestiary progress for every creature killed at the spot (Talisman bonus only on the bounty creature) + the expected first Echo Warden for each. Bounty points/h = points × Silver/Gold multiplier ÷ task hours. Task hours = kills required ÷ kills/h (average task size when unknown).
- **Score** (`core/score.js`): each goal factor is divided by the best creature's value in the pool, weighted by the goal mix (0–5 each; six presets), and scaled so 100 is the best creature on a normal task. Tiers: S ≥ 90% of best, A ≥ 75%, B ≥ 60%, C ≥ 45%, D below.
- **Rerolling** (`core/reroll.js`): a small dynamic program over token count (0–10). A task's value accrues over its length (continuous discount 1/40 per hunting hour); tokens arrive +1 per finished task and +1 per day (spread over the hours hunted per day), capped at 10. The plan chain ends at the first spot worth less than rerolling (`rateThreshold`). Silver/Gold odds are used only after 10 logged offers.
- **Weekly tasks** (`core/weekly.js`, `app/weekly.js`): finishing pays the whole reward, so each remaining kill is worth reward ÷ kills left; that share is added at any spot where the creature lives (for Any Creature, over all the spot's kills). Kills left are typed and Done is ticked by hand; logged hunts aren't counted any more (the migration from the old `weekly` counted them once, with the old rule).
- **The plan** (`core/spots.js`, `core/plan.js`, `core/explain.js`; details in `PLANNER_PLAN.md`):
  - **Spots** (`spotIndex`): reference spots of every vocation, the character's own spots and variations, and logged spots matching none (by normalized name, spot names before aliases; a session with a `spotId` belongs to that spot). A spot's numbers (`spotNumbers`) are the character's clean sessions there, else the reference entry, calibrated as below.
  - **Value** (`spotValue`): the spot's exp/h, profit/h and charm/h, plus each remaining kill's share of the bounty's reward and points (for an offer while choosing, or the active bounty) and of open weeklies. Hourly rates by default; with a session length (Time chip), the shares are capped at what the session can finish and travel comes out of the hunting time. Today's boosts raise each creature's share of the spot's exp (kills/h × TibiaWiki base exp, `src/data/creature-exp.json`).
  - **Lens**: logged spots, plus reference spots for the character's vocation or “any” (other vocations' while that source is on) whose level range overlaps level −100 to +150. Solo hunts only: duo and team reference hunts are left out (Decision, October 26, 2026).
  - **Chain** (`planOptions`, `planChain`): each spot's best offer; spots best first until one is worth less than a reroll. Spots marked taken within the Taken length (45 minutes by default) are skipped, ones marked free move up, and with occupancy counts the spots worth checking go in the order with the best expected value. A finished bounty is claimed first; with no tokens the chain ends with See Spots, and the Plan asks once per server day whether there really are none (the daily token may be waiting).
- **Reference hunts** (`core/reference.js`): each character uses the best entry per spot for its vocation (else "any"): solo, post-rebalance first, then newest, skipping entries above its level (and older ones when that source is off). Calibration compares its clean sessions at reference spots with the reference (one vote per spot, log-space mean with a one-spot prior at 1.0, clamped 0.2–1.5; profit as a shrunk offset from post-rebalance entries only) and scales every reference spot it hasn't logged. Creatures with no numbers of their own take those spots. Sources are badged "Yours", "Reference, adjusted to you", "Reference" and "Other vocation". Other vocations' entries are a third tier: calibrated per vocation against the character's hunts at spots that vocation also covers, and used only where nothing for its own vocation exists.

## Game facts established (and how sure we are)

- **Task pools** (TibiaWiki Task Board, verified by checksum, September 2026): Beginner 153, Adept 450, Expert 498, Master 280. Pools follow bestiary class exactly: Easy → Beginner + Adept, Medium → Adept + Expert, Hard → Expert + Master, Challenging → Master. 53 pool creatures are rare. Very rare creatures aren't in any pool.
- **Weekly kill task lists can include creatures outside the bounty pool for that difficulty** (the maintainer's Master weeklies included Medium creatures). The weekly creature box suggests all 730 creatures and accepts any name.
- **Bounty points per task**: 3 / 7 / 16 / 27 (Beginner/Adept/Expert/Master). Kill ranges 50–100 / 100–200 / 200–400 / 300–600. Silver doubles and Gold quadruples both the exp reward and bounty points; the reward shown in game already includes the bonus.
- **Reroll tokens**: +1 per completed bounty task, +1 claimable per day, maximum 10. An accepted (held) offer doesn’t lock you in: you can reroll the board while holding one, including the held one, so holding costs nothing (maintainer, October 24, 2026). Rerolling a held offer is assumed to lose its kill progress.
- **Boosted creature** (TibiaWiki, October 2026): changes at each server save; double experience, double loot and twice the respawn rate. The planner counts the exp only.
- **Prey** (TibiaWiki): one creature per slot for 2 hours of hunting. Bonus experience 13–40% and improved loot 13–40% (a chance of a second loot drop) in steps of 3; damage boost 7–25% and damage reduction 12–30% in steps of 2. The planner counts bonus experience only, applied on top of the boost (TibiaWiki says Prey and events apply on top of it); whether it multiplies or adds with other exp bonuses isn’t settled.
- **Exp events** (TibiaWiki, Experience Point): Double Experience (+100%, about 6 a year) and world-quest bonuses (+10% to +50%, some limited to certain creatures).
- **Bounty exp reward**: Hard creatures on Master pay exactly 1,875 exp per required kill (10 logged offers at levels 612–613, no level effect seen). Expert 510, Adept 97.5 and Beginner 15 come from the open-source Canary server model and are unverified. Challenging creatures on Master vary by creature: Gorerilla 2,034.75, Infernal Demon 2,844.18, Knight's Apparition 3,088.35 per kill (level 615). The tool learns each Challenging creature's rate from one entered reward; unseen ones use the average (about 2,700).
- **Bestiary**: Easy 500 kills / 15 charm points, Medium 1,000 / 25, Hard 2,500 / 50, Challenging 5,000 / 100. First Echo Warden kill: Easy 5, Medium 10, Hard 15, Challenging 30 charm points.
- **Echo Raids**: Wardens lead 10% of raids, 20% once the bestiary is finished. Rare creatures can't start raids. The per-kill raid chance isn't published; the tool assumes 0.1%, blended with logged raids (prior worth 5 raids in 5,000 kills).
- **Bounty Talisman**: damage, life leech and loot bonuses (up to 50%) and a double-bestiary chance (up to 100%) apply to the bounty creature only. Summon kills don't count.
- **Weekly kill task exp**: 25L² − 75L + 100 for level ≤ 82; round(1994.008 × L) for 83–999; 2L² − 6L + 8 for 1000+. Caps: Beginner 200k, Adept 800k, Expert 3kk, Master none. Reset Monday at server save (treated as 08:00 UTC). Hunting task points (25/50/100/110 per kill task, with completion multipliers) and soulseals aren't modeled.
- **Preferred/Unwanted odds**: community model (Preferred creatures weighted ×5, Unwanted removed). Unofficial.

## Release workflow

1. Edit `src/` (code; see `ARCHITECTURE.md` for where things go) or `src/data/` (data; `reference.json` through the readings and `generate.js`). Run `npm test`: it assembles `dist/index.html`, then runs the layer, data, unit and UI tests and the golden-output test. The golden test fails if anything the app computes changed; when that's intended, `npm run golden:update` rewrites `tests/golden/expected/` (with the maintainer's OK). Its real-data run uses a frozen copy of the data in `tests/golden/data/`, so data updates don't affect it.
2. Build: `npm pack @fontsource/atkinson-hyperlegible`, untar it into `fonts-cache` (`tar xzf <file>.tgz && mv package <name>`), then `npm run build` (assembles, then `python3 tools/build.py dist/index.html . fonts-cache`). This writes the built `index.html`, `manifest.webmanifest`, `sw.js` (its cache name changes with the content), icons and `fonts-OFL.txt` to the repo root.
3. Commit source and built files; push to `main`. GitHub Pages updates in about a minute.
4. To update the maintainer's Claude artifact, ask a claude.ai chat in the Project to republish the assembled page to the development artifact, keeping its existing capabilities: `dist/index.html` as `node tools/assemble.js` builds it at the pushed commit. `dist/` isn't committed, so the chat clones the repo, runs `npm ci` (esbuild bundles the script) and the assembler, or gets the file attached. `src/index.html` alone doesn't work, and the root `index.html` is the offline build. Download a backup first when the release changes stored shapes.
5. Keep the TibiaWiki CC BY-SA credit in Characters and settings and the README.

## Known gaps and open questions

- Challenging reward formula (learned per creature for now). Whether rewards change with level (none seen at 612–615).
- Silver/Gold frequency (needs logged boards).
- Many creatures have thin or no data; the reference database (see REFERENCE_DB_PLAN.md) is the planned fix.
- Weekly synergy uses the "reward share" model; a "time saved" model was discussed and not built.
- Delivery tasks, hunting task points and soulseals aren't modeled.
- Planner: double loot, faster respawn and Prey loot/damage aren’t counted; spot meta (travel, access and team per spot) is empty until there’s a source, and travel minutes have no screen in the redesign yet; the level band is a first guess. See the open questions in `PLANNER_PLAN.md`.
- Duo and team reference hunts are left out everywhere; nothing in the UI asks for them yet.
- The golden test's real-data run uses the frozen copy of the data in `tests/golden/data/` (October 26, 2026), so new readings and creature data don't change it; data correctness is `generate.js --check`'s job.
- Claude in Chrome's file upload has failed twice, so GitHub uploads have been manual drag-and-drop. Claude Code pushing with git avoids this.

## Backlog (from outside feedback, October 2026)

Reference database with calibration and source badges (built), vocation lens with level ranges (built, in the planner), data freshness, per-session efficiency readout, access-quest tracking, crowdsourced average-player data, and a video demo script.
