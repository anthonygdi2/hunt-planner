# Hunt planner: plan

Status: M0 to M6 built, cutover done, and then the Claude Design pass built as the redesign (`docs/RESTRUCTURE_PLAN.md`, Phase F, October 2026). The redesign supersedes how the planner ships, its stored shapes for the board and the session card, and its screens: those sections below are marked. The value model, the chain, the lens and the open questions still describe the app. Last updated October 26, 2026.

## Goal

Answer “where should I hunt right now?” with a short list of steps, for example:

> Hold offer B (Cobra Assassin). Go to Cobra Bastion. Taken? → Ruins of Nuur. Taken? → Reroll, then re-plan.

The plan weighs the bounty board, weekly kill tasks and the player’s goals together. If the best spot for the goals has none of the player’s task creatures and still beats every task-boosted option, the plan says to hunt it anyway, and says why.

The current page (tier list, table, board, slots, weekly) stays the default and keeps working, unchanged, until cutover. After cutover comes a UI/UX pass with Claude Design.

## Game mechanics this relies on

Confirmed by the maintainer, October 24, 2026:

- **An accepted offer doesn’t lock you in.** You can reroll the board while an offer is accepted, including the accepted one.
- **Reroll tokens:** +1 claimable per day, whether or not you’re doing bounties, and +1 per completed bounty task. Those are the only sources. The cap is 10. This matches the model already in `rerollPlan`.

What follows for the planner:

- **Holding an offer costs nothing**, so the plan always names one to hold, normally the offer whose creature is worth most at the spots you’re likely to use. Its kills count wherever you happen to kill it.
- **“Ignore the bounty” means hunting a spot without the held creature.** You don’t decline anything. The cost is slower task completion, which means less task-token income and a later reward. The reroll dynamic program already prices token income.
- **Rerolling a held offer forfeits its progress** (assumed: see Open questions). The plan treats kills already done as sunk, and values the held task by the kills remaining.

## Principles

1. **The current page is untouched until cutover.** Planner code is additive. Any change to shared functions is a small refactor that doesn’t change behavior, gets its own commit, and keeps `npm test` green.
2. **Shared data, additive only.** Both pages read the same profiles, sessions, entries and REFERENCE. The planner writes only to new documents (see Data), so the current page never sees, overwrites or chokes on planner data.
3. **Spots are the unit of decision.** Creature numbers still come from `derive`/`eff` (own data, then calibrated reference, then raw reference), but the planner adds them up per spot.
4. **One value scale.** Planner values use the same goal sliders and the same normalization as the Score, so a spot’s number and a creature’s tier mean comparable things.
5. **Every step explains itself.** Each step has a “Why?” stating what it beat and by how much, in the same plain style as the reroll advice.
6. **Offline and dependency-free, as before.** ES5 style, one file, no framework.

## How it ships beside the current page

*Superseded by the redesign: there is one app now, no classic page and no `btl.ui`. The code is ES modules in layers (`docs/ARCHITECTURE.md`), the planner logic lives in `src/core/` (`spots.js`, `plan.js`, `occupancy.js`, `explain.js`), and its checks are in `tests/unit/` and `tests/ui/`. Kept for history.*

- A per-device preference `btl.ui` = `"classic"` (default) or `"planner"`. The footer gets a link “Try the new planner (beta)”, and the planner has “Back to classic.” Switching just shows the other top-level section; no reload, no data change.
- Everything lives in `src/index.html`, in one place:
  - markup: one `<section id="planner" hidden>` placed after the classic views;
  - CSS: one block, every selector scoped under `#planner` or prefixed `.pl-`;
  - JS: one block headed `// ===== Planner (beta) =====` at the end of the main script, after the classic code and well away from the `DATA` and `REFERENCE` blocks.
- The planner calls classic functions (`derive`, `eff`, `metrics`, `scoreList`, `calibrate`, `refHuntAt`, `rerollPlan`, `saveProfile`) and doesn’t redefine them. When it needs one of them to behave differently, the change is a small extraction (for example pulling a pure helper out of `rerollPlan`) with a test showing the classic output is unchanged.
- The planner reuses the existing Log a session dialog and the creature panel instead of building new ones.
- Tests go in a new `tests/planner.test.js`, run by `npm test` alongside the smoke test, so planner tests never collide with edits to `smoke.test.js`.

## Data

### Spots, derived at runtime

There’s no new embedded spot table yet. `spotIndex()` builds one each render from:

- REFERENCE entries: `spot`, `aliases`, `creatures`, `vocation`, level range, `team`;
- the user’s logged sessions: spot strings and creatures killed there;
- `SPOT_META` (below).

A spot’s id is the slug of its REFERENCE name. A session spot string maps to a spot through the same normalized name and alias matching `refHuntAt` already uses. Unmatched session spots become spots of their own, with only the user’s data.

`SPOT_META` is a separate embedded object owned by the planner, keyed by spot id: `travelMin` (minutes from depot, rough), `access` (quest or requirement text), `team` override, `notes`. It starts empty, and every field has a default. It’s kept apart from `REFERENCE` so `tools/reference/generate.js`, which regenerates the `REFERENCE` block, never touches it.

### New stored data

*Partly superseded by the redesign (state model in `docs/ARCHITECTURE.md`): the board and the held offer became `bounty` in the planner state (offers or the active bounty, with tokens and difficulty), the session card `active` became `hunting {spotId, at}`, the weekly tasks became the profile's `weeklyTasks`, the character's own spots are `profiles/{pid}/spots/{id}`, and backups are version 2. The old fields are read through migrations and left in place. Marks and occupancy are as below.*

Separate documents, so classic writes (`ref.set` on whole profiles in some paths) can’t drop planner fields:

- `profiles/{pid}/planner/state`: `fixedHours` (a session length the user chose; none means hourly rates; the older `sessionHours`, saved as a default whether chosen or not, is ignored), `diff` (the board’s task difficulty, default Master), `held {slug, kills, done, kind, exp, i, since}` (the held offer, its board slot, kills done outside logged sessions, and when it was held: kills in sessions logged since then are added), `today {boosted, boostedDay, prey: [{slug, kind, pct}], event}` (the boosted creature counts only on the server-save day it was entered), `lens {vocation, levelBand, allVocations}`, `active {spot, name, at, slug}` (the session card: spot id and name, start time, held task), `travel {spotId: minutes}` (the character’s own travel time per spot, which overrides `SPOT_META`). The board offers and rerolls left stay in the profile (`board`, `reroll`), shared with the classic page.
- `profiles/{pid}/marks/{spotId}`: `{state: "taken" | "free", at, world}`. One document per spot holds the latest mark.
- `profiles/{pid}/occupancy/{spotId}`: `{counts: {"world|hour": [free, taken]}}`, the mark history as counts per world (lowercase, from the planner state’s `world`) and UTC hour. Counts rather than a log, so it stays small; the same mark again within 15 minutes counts once.

Backups: add an optional `planner` key per character (`state`, `marks`, `occupancy`). Restore ignores it when absent, and older versions of the app ignore it when present, so `version` stays 1.

## The value model

For a character with goal weights, a spot s and, optionally, a session length H hours (by default there is none: values are hourly rates, every remaining kill counts at reward ÷ kills left with no cap, and travel is ignored; choosing H in Options turns on the caps and the overhead below):

- **Base value.** Sum over creatures killed at s of their kills/h × per-kill exp, profit, charm and bounty contributions, from `eff` (own > calibrated reference > raw reference). This gives exp/h, profit/h and charm/h for the whole spot.
- **Held bounty.** If the held creature lives at s: task reward per remaining kill × its kills/h, plus bounty points per hour, plus the Talisman effects already modeled for task sessions. Reward per remaining kill = reward ÷ kills left, as the weekly model does.
- **Weekly.** For each unfinished weekly creature at s: reward ÷ kills left × its kills/h (existing model).
- **Today’s multipliers.** Boosted creature, Prey bonuses and events adjust the per-creature numbers they apply to. Game numbers for these need sources before they ship (see Open questions); until then they’re off.
- **Overhead.** Effective value = V × max(0, H − travelMin/60) ÷ H. With no `travelMin`, overhead is zero.
- **Score.** The goal factors are normalized and weighted as in `scoreList`, then scaled so 100 means the best spot for this character on a normal day.

### Candidates

An option is (offer to hold, spot). The offers considered are the three on the board (and the held one, if it’s already among them). For each offer o, every spot gets valued with o held, whether or not o’s creature lives there. The best option for each spot is the one with the best offer to hold, and that offer is what the step says to hold.

Spots are filtered by the lens (vocation and level band), by access when `SPOT_META` says so, and by solo/team.

### The chain

1. Rank options by effective value.
2. Compute the reroll value R. This is the expected value of spending a token now, from the existing dynamic program, including the loss of the held task’s remaining value.
3. Walk down the ranking. Each option becomes a step: “Go to s (hold o).” Stop at the first option worth less than R. The final step is then “Reroll and re-plan,” or, with no tokens, “Hunt the best free spot from this list.”
4. Marks. A spot marked taken within the last 45 minutes is skipped, with a note. A spot marked free within that window rises to the top of the steps worth checking.
5. Occupancy (M6): the chance a spot is free near this hour (±1 h) on the character’s world, from its counts, smoothed toward the spot’s rate at all hours and that toward the world’s rate across spots (Beta priors worth two marks each). Spots worth checking go in the order with the best expected value: hunt the first free one; a taken one costs its travel minutes (10 if unknown) off the session; if all are taken, a reroll’s worth is left. With no marks and no travel this is best value first, so a slightly worse spot that’s almost always free, or much closer, can come before a contested one only once there’s evidence.

Step vocabulary: Hold, Go to, Taken? →, Reroll, Claim your daily token (a reminder only; the tool can’t see whether it’s claimed), Hunt.

## Screens (beta)

*Superseded by the redesign's screens (`docs/design/INVENTORY.md`): Plan with its chips and inline editors, Spots and the spot page, Creatures and the creature page, Weekly, Log a clean hunt, and Characters and settings. Kept for history.*

- **Plan (home).**
  - Header chip “EK · 615 ▾”: switches character, and opens vocation/level.
  - Options, collapsed (as built): session length, No limit by default, or 30 minutes to 4 hours; world; today’s bonuses (boosted creature, one Prey row with Add a prey, exp event).
  - A “Your character” card for vocation and level until the character has a level, the only required input.
  - The board as a compact card: three offers plus which one is held, quick to re-enter after a reroll.
  - The chain, where every step has **Free** and **Taken** buttons and a “Why?” expander. Free starts a session card with a timer; ending it opens the existing Log a session dialog.
- **Spots.** Browse every spot through the lens, with source badges and sorting by value, exp/h or profit/h.
- **Spot page.** Creatures and their numbers with sources, your sessions there, reference entries (newest first, pre-rebalance flagged), access and travel, recent marks.
- **Weekly and board entry.** Reuse the classic data. Weekly editing moves into the planner, outside advanced mode, by milestone 5.
- The tier list, table and slots stay in classic. After cutover, Creatures (the tier list) becomes a secondary view.

## Vocation and level lens

The character keeps existing (the board, tokens, weeklies, Talisman and logged sessions are per character), but it’s reduced to name, vocation and level. The lens defaults to the character’s vocation and a level band around its level, using the reference tiers the app already has: own vocation, then “any”, then other vocations, badged. The lens can be widened to all vocations and any level for browsing. The plan always uses the default lens unless the user changes it on the Plan screen.

As built (M4): a spot is in the default lens if the character has logged it, or if it has a reference entry for the character’s vocation or “any” (other vocations’ entries count while the “other vocations” switch is on in Characters, as on the classic page) whose level range overlaps the character’s level −100 to +150. An entry without a level bound is open at that end, so the band mostly drops spots far above the character and the few entries with a maximum level below it. The Spots view’s All vocations and Any level widen the list; spots without numbers for the character are listed with the reason. There’s no lens control on the Plan screen yet.

## Milestones

*All built. The Claude Design pass after cutover is the redesign in `docs/RESTRUCTURE_PLAN.md` (Phase F), which retired the classic views and folded the tier list in as Creatures.*

Each milestone ends with `npm test` green, and the classic page behaving exactly as on `main`.

- **M0 Scaffold.** `btl.ui` switch, empty planner section, footer link, `tests/planner.test.js` wired into `npm test`.
- **M1 Spots and value engine.** `spotIndex()`, `SPOT_META`, `spotValue()` as pure functions. Tests: alias matching, own data beats reference, held-bounty and weekly shares, overhead.
- **M2 Chain.** Candidate generation, reroll comparison via `rerollPlan`, marks handling, “Why?” text. Tests: ignore-the-bounty case, reroll cutoff, taken marks skip, no tokens.
- **M3 Plan screen.** Session length, board card with held offer, chain with Free/Taken, session card handing off to Log a session. Planner state and marks storage, and backup inclusion.
- **M4 Spots and spot page,** with the lens and source badges.
- **M5 Extras.** Held-task progress from logged sessions, weekly editing in the planner, travel minutes for common spots, today’s multipliers once their numbers have sources.
- **M6 Occupancy learning.** Mark history by world and hour, expected-value ordering.
- **Cutover.** `btl.ui` defaults to planner, classic stays a link away. Then the Claude Design pass, then retire or fold classic views.

## Working beside the reference-data session

A Claude Code session is reading Kusnier’s videos with the `reference-batch` skill. Each batch it pulls `main`, regenerates the `REFERENCE` block in `src/index.html`, rebuilds the root files (`index.html`, `sw.js`), edits `docs/REFERENCE_DB_PLAN.md` and `docs/REFERENCE_VIDEOS.md`, and commits and pushes to `main`. It stops if `git status` isn’t clean on `main`.

Rules for planner work, so that session never notices:

1. **Separate working folder.** From the main clone: `git worktree add ../bounty-planner -b planner`. Run the planner Claude Code session in `../bounty-planner`. Never switch branches or leave changes in the batch session’s folder.
2. **Never push to `main` while batches are running.** Push only `planner`. Merging waits until the batch session is idle.
3. **Stay current by merging `main` into `planner`** (or rebasing) at the start of each planner session, so the beta sees the newest reference data.
4. **Don’t commit built files on `planner`.** Commit only `src/`, `tests/`, `package.json` (test script) and `docs/PLANNER_PLAN.md`. Root `index.html`, `sw.js` and icons get rebuilt at merge time. Generated files are where conflicts would otherwise always happen.
5. **Don’t touch files the batch session owns:** the `DATA` and `REFERENCE` blocks, `tools/reference/`, `docs/REFERENCE_DB_PLAN.md`, `docs/REFERENCE_VIDEOS.md`, `.claude/skills/reference-batch/`. Read REFERENCE, never write it.
6. **Shared docs at merge time only.** Updates to `docs/PROJECT_CONTEXT.md` and `CLAUDE.md` (new views, mechanics above, planner data model) are written on `planner` as one final commit just before merging, rebased on the latest `main`.
7. **Merging to `main`:** when the batch session is idle, merge `main` into `planner`, run `npm test`, build, commit the built files, then fast-forward `main` and push. The batch session’s next `git pull --ff-only` then just works.

Testing the beta before merge: build the `planner` branch locally and open the built `index.html`, or have a claude.ai chat in the Project republish the branch’s `src/index.html` to a separate preview artifact (and restore a backup into it for real data). The dev artifact stays tied to `main`.

## Open questions

- Does rerolling a held offer lose its kill progress? Assumed yes.
- Does the daily token stack if unclaimed for several days, or is an unclaimed day lost?
- Boosted creature, Prey and event effects: settled for exp (M5, TibiaWiki October 2026: boosted creature double exp; Prey bonus experience 13% to 40% in steps of 3; Double Experience +100% and world bonuses +10% to +50%; Prey and events apply on top of the boost). Still open: double loot and Prey improved loot (needs each creature’s share of a spot’s loot), faster respawn, and whether Prey stacks with other exp bonuses by adding or multiplying (multiplying is assumed).
- Default level band for the lens (for example −100 to +150 levels).
- Taken-mark expiry: 45 minutes to start; tune from use.
- Travel minutes: each character can enter its own per spot (M5). `SPOT_META` defaults stay empty until there’s a source; travel depends on the home depot anyway.
