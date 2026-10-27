# src/data

The data the app embeds. These files aren't covered by the code's MIT License (`LICENSE`); each keeps the license below. `tools/assemble.js` inlines each file into `dist/index.html` at its `{{src/data/<file>}}` placeholder in `src/index.html`. Each file has one record per line.

| File | In the page | What it is | Source | License |
|---|---|---|---|---|
| `creatures.json` | `var DATA` | The 730 creatures: `n` name, `c` bestiary class (`E`, `M`, `H`, `C`), `m` task-pool bitmask (Beginner 1, Adept 2, Expert 4, Master 8), `w` TibiaWiki title when it differs from the name, `r` 1 for rare creatures. | Derived from [TibiaWiki](https://tibia.fandom.com/wiki/Task_Board) (Task Board and bestiary pages). | CC BY-SA |
| `creature-exp.json` | `var PL_EXP` | TibiaWiki base exp per creature, used by the planner to split a spot's exp between its creatures for today's bonuses. | From TibiaWiki (the `exp` field of each creature's infobox), a copy of `tools/reference/wiki-exp.json` for the creatures in `creatures.json`. Refresh with `node tools/reference/generate.js --exp`. | CC BY-SA, as TibiaWiki |
| `reference.json` | `var REFERENCE` | Reference hunts: kills/h, exp/h and profit/h per spot, vocation and level, read from published hunt videos (shape and rules in `docs/REFERENCE_DB_PLAN.md`). | Read from [Kusnier's YouTube hunt videos](https://www.youtube.com/@Kusnierr/videos) (also listed on [TibiaPal](https://tibiapal.com)): numbers read off each video's Hunt Analyser, with the video's link in every entry. Generated from `tools/reference/readings.json` by `node tools/reference/generate.js`; don't edit by hand. | Permission pending |

Game numbers here are facts with sources: don't change them without evidence. The footer and the README keep the TibiaWiki CC BY-SA credit.

`tests/golden/data/` holds a frozen copy of these files for the golden test; it isn't updated with them.
