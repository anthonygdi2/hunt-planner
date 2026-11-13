# Improvements: the ranked list

What to build next, in order, with why. Re-evaluate it after each step ships (prompt at the end). Started November 13, 2026.

Value is what it does for the player's question, "where should I hunt, and is it worth my time?". Effort is the size of the change including tests, translations and docs.

## Done

- **Prey loot in profit** (November 13, 2026). A loot Prey raises the profit of every spot its creature lives at: the spot's loot/h × the creature's share of it (by exp, an estimate) × the bonus. Reference entries carry `lootph`; own hunts use their logged loot. Details in `PROJECT_CONTEXT.md` (How the numbers work, The plan).

## Next, in order

| # | Improvement | Value | Effort | Notes |
|---|---|---|---|---|
| 1 | Boosted creature's double loot | Medium | Low | The same code as Prey loot (`core/plan.js` `todayFactor`): one more factor. Held back only because the golden fixture has a boosted creature, so it changes golden output and needs the maintainer's OK for `npm run golden:update`. |
| 2 | Bestiary kills left | High for charm goals | Medium | Optional kills left per creature on the character's entry (`bestiaryLeft`, beside `bestiaryDone`; 0 sets done). Each kill is then worth charm points ÷ kills left, as held and weekly tasks are valued, capped at what an hour (or the session) can finish. Entered on the creature page and per creature on the spot page. Open: subtract kills from the character's hunts logged after the number was typed (recommended), or keep it typed by hand as Weekly does. |
| 3 | Suggest which creatures to put Prey on | High | Low | For the spot the plan sends you to: the creature with the largest exp share for an exp Prey, the largest loot share for a loot Prey. The shares exist since Prey loot. |
| 4 | After a hunt is logged, compare it with the reference | High | Low to medium | "82% of the expected exp/h here." It answers "am I wasting my time?" directly. Calibration already computes the ratios (`core/reference.js` `calibrateAgainst`). In the October backlog as "per-session efficiency readout". |
| 5 | "Can't go there" per spot, and a screen for travel minutes | Medium | Low | A per-character switch on the spot page keeps a spot without access out of the plan. Travel minutes are modelled (`travel` in the planner state) but have no screen since the redesign. |
| 6 | Loot value per creature from TibiaWiki | Medium | Medium | Replaces the exp-share estimate behind Prey loot and item 3. A new data file like `creature-exp.json`; prices go stale. Only if the estimate proves too rough. |
| 7 | Duo and team hunts | Medium | High | Reference entries exist but are left out everywhere; nothing in the UI asks for them. |

## Considered, not planned

- Prey damage and defense, and the boosted creature's faster respawn: they change kill rates, which the plan takes from hunts, not from rules.
- Weekly "time saved" model, hunting task points, soulseals, delivery tasks: no one has asked.

## Re-evaluating the list

After each step ships, a new session gets this prompt:

> Read `CLAUDE.md`, `docs/PROJECT_CONTEXT.md` and `docs/IMPROVEMENTS.md` in this repo. The last step built is the newest entry under Done in `docs/IMPROVEMENTS.md`; look at how it was built (`git log`, the code it names). Then re-evaluate the list under “Next, in order”: check each item against the code as it is now (is it still needed, did the last step make it cheaper or change its design, is its value or effort wrong), add anything the last step exposed, drop or move to “Considered, not planned” what no longer earns its place, and re-order. Update `docs/IMPROVEMENTS.md` with your changes. Then tell me which item to build next and why, and what decisions it needs from me before you start. Don't build anything yet.
