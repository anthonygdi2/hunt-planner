# Contributing

Thanks for helping. Bug reports and ideas go in [issues](https://github.com/anthonygdi2/hunt-planner/issues); please don’t attach a backup file there, since it holds your characters and hunts. Security problems go privately through [SECURITY.md](SECURITY.md) instead. Everyone taking part follows the [code of conduct](CODE_OF_CONDUCT.md).

## Setup

You need Node.js 22 (the tests use `node --test` with globs) and npm.

```
npm install
npm test
```

`npm test` assembles the page and runs every check. Then open `dist/index.html` in a browser; it’s the whole app in one file, saving to that browser’s storage. `src/index.html` is only the shell and doesn’t run on its own.

Building the offline GitHub Pages site (`npm run build`) also needs Python 3 with Pillow and the fonts; `CLAUDE.md` has the steps. You don’t need it to work on the app.

## How the code is laid out

ES modules under `src/`, bundled by esbuild into one self-contained page with no runtime dependencies. They’re in layers, and imports only point down: `ui → app → core → data`, and `app → store` (`tests/layers.test.js` checks this).

- `src/data/`: the creature list, the reference hunts and `rules.js`, every game number with its source.
- `src/core/`: pure functions: numbers in, numbers out. No DOM, storage, timers or current date (“now” is a parameter).
- `src/store/`: saving and loading through one small db API, reading every document shape ever saved, backups.
- `src/app/`: the compute pipeline, the character model, the actions that change things, and a view model per screen.
- `src/ui/`: the design tokens and CSS, small components, the shell (header, tabs, routes) and one module per screen.

[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) has the details: each module’s job, the stored data shapes, and the decisions so far. [`docs/PROJECT_CONTEXT.md`](docs/PROJECT_CONTEXT.md) explains how the numbers work and which game facts are settled.

## Making a change

- **New logic** goes in the right layer with unit tests in `tests/unit/`. **Screens** render a view model from `app/views.js` and call app actions; each screen has checks in `tests/ui/` (what it shows, what each control calls).
- **Stored data** must stay readable: readers in `store/schema.js` accept every shape ever saved, and writers keep old fields in step or leave them in place. Existing backups (version 1 and 2) must still restore. Describe a new shape in `docs/ARCHITECTURE.md` (State model) first.
- **The UI** follows `docs/design/`: colors from the tokens of both themes, no pop-ups (inline editors, full pages with Back, inline confirms), 44 px tap targets, 16 px inputs, never color alone, typographic quotes and apostrophes. Check widths down to 320 px.
- **Game numbers** live only in `src/data/rules.js`, each with its source. Don’t change one without evidence (a TibiaWiki page, an in-game screenshot).
- **The golden test** (`tests/golden.test.js`) records what the app computes for two invented characters and fails on any difference. If your change is meant to change those numbers, say so in the pull request and show which ones moved and why; the maintainer decides whether to update `tests/golden/expected/` (`npm run golden:update`). Never update it just to make a failure go away.

`npm test` must pass before a pull request. Keep commits focused, and say in the description what you checked by hand.

## Text and translations

Visible text is written in English and wrapped for translation: `t("…")` from `src/app/lang.js` in view models and screens (with `{placeholders}` for anything that changes), `t.n(count, "{n} hunt", "{n} hunts")` for counts, and `_("…")` for a string kept in a table and translated where it’s shown. Core functions that produce text take a translator as a parameter (`ctx.t`), so they stay pure.

The translations are in `src/data/i18n/` (`es.js`, `pt.js`, `pl.js`), keyed by the English text. `node tools/i18n.js` shows what’s missing, and `node tools/i18n.js --missing` prints it ready to fill in. `npm test` fails while a string has no translation, has different placeholders, or misses one of its language’s plural forms (Polish has four). Creature, spot and in-game feature names stay in English, as Tibia’s client shows them. If you add a string and can’t translate it, say so in the pull request; corrections from native speakers are very welcome.

## Reference hunt data

`src/data/reference.json` is generated: don’t edit it. Readings go in `tools/reference/readings.json` (one per Hunt Analyser shown in a video, with the video’s link and time), then `node tools/reference/generate.js` writes the data file (`--check` confirms the file matches the readings; `npm test` checks that too). The queue of videos still to read is `docs/REFERENCE_VIDEOS.md`, and the rules for readings are in `docs/REFERENCE_DB_PLAN.md`.

## Using Claude Code

`CLAUDE.md` holds the working instructions for Claude Code in this repository, and `.claude/skills/reference-batch/` is the skill that reads reference videos in batches.
