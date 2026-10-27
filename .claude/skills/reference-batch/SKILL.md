---
name: reference-batch
description: Seed the reference hunt database from Kusnier's videos, ten at a time. Reads the next 10 todo videos in docs/REFERENCE_VIDEOS.md in the in-app browser, embeds them, tests, builds, commits and pushes, reports the batch, and repeats until an issue needs a person. Use when asked to process, continue or seed the next reference videos.
argument-hint: "[batches]  (blank: keep going until an issue; 1: one batch of 10)"
---

# Reference batch

Reads Kusnier's guide videos into `tools/reference/readings.json` (and so into `src/data/reference.json`, which `tools/assemble.js` inlines as the page's `REFERENCE`) ten at a time. Background: `docs/REFERENCE_DB_PLAN.md` ("What we found reading them") and the top of `docs/REFERENCE_VIDEOS.md`. Follow `CLAUDE.md` throughout.

**Arguments:** `$ARGUMENTS` is the number of batches to run. Blank means keep going batch after batch until an issue needs a person.

**Don't wait for an OK between batches.** Embed, test, build, commit and push each clean batch on your own, print its report, and start the next. Stop only at an **issue** (see below).

## Tools

- `node tools/reference/batch.js next 10 --skeleton <file>` lists the next 10 todo rows. It also writes a staging file with the id, spot, aliases, vocation, level and publish date already filled, and blanks for what you read off the slide.
- `node tools/reference/batch.js check <file>` prints the review table, checks kills × TibiaWiki exp against Raw XP Gain (values are cached in `tools/reference/wiki-exp.json`), and lists issues. It exits 1 when there are issues.
- `node tools/reference/batch.js embed <file>` re-checks, then:
  - writes the remark and notes text;
  - appends the readings and regenerates `src/data/reference.json`;
  - marks the Queue rows `done <date>` and updates both status lines;
  - prints the table and the batch report.

  `--accept id1,id2` lets readings through once the user has OK'd their issues.
- `tools/reference/browser-helpers.js` gets pasted into the browser and defines `window.__ref`.

Stage files in `tools/reference/.staging/` (git-ignored), as `batch-<first queue #>.json`, so a batch stopped by an issue can be picked up in a later session. Before starting a new batch, look there: if a staging file exists, that batch is unfinished. Resume it, and don't make a new skeleton.

## Each batch

1. **Start clean.** `git status` should be clean on `main`; `git pull --ff-only`. Run `node tools/reference/refresh-videos.js`. New uploads land at the top of the Queue. `check` rows don't stop the run, but list them in the report.
2. **Skeleton.** `node tools/reference/batch.js next 10 --skeleton tools/reference/.staging/batch-<n>.json`. Review the guesses: spot name, aliases (add the header name or common short names), `notes` prefix ("Advanced guide.", "Profit guide."). A vocation it couldn't map (for example "Sorcerer/Druid") is an issue.
3. **Browser setup**, once per session:
   1. Open the first video with `preview_start` (url `https://www.youtube.com/watch?v=<id>`).
   2. Read `tools/reference/browser-helpers.js` and paste its whole text into `javascript_tool`. It should return `"__ref ready"`.
   3. After any full page navigation, paste it again.
   4. If a screenshot shows only part of the page, call `resize_window` with preset `desktop`.
4. **Read each video** with one `browser_batch`:
   ```json
   [{"name":"javascript_tool","input":{"action":"javascript_exec","text":"await __ref.open('<id>')"}},
    {"name":"javascript_tool","input":{"action":"javascript_exec","text":"__ref.show('full')"}},
    {"name":"computer","input":{"action":"wait","duration":2}},
    {"name":"computer","input":{"action":"screenshot","scale":0.1}},
    {"name":"computer","input":{"action":"screenshot"}},
    {"name":"javascript_tool","input":{"action":"javascript_exec","text":"__ref.show('numbers')"}},
    {"name":"computer","input":{"action":"wait","duration":2}},
    {"name":"computer","input":{"action":"screenshot","scale":0.1}},
    {"name":"computer","input":{"action":"screenshot"}},
    {"name":"javascript_tool","input":{"action":"javascript_exec","text":"__ref.show('kills')"}},
    {"name":"computer","input":{"action":"wait","duration":2}},
    {"name":"computer","input":{"action":"screenshot","scale":0.1}},
    {"name":"computer","input":{"action":"screenshot"}}]
   ```
   - The first screenshot after each `show` is a throwaway, because screenshots lag one paint.
   - `open` handles the rest: it skips ads, forces 1080p, and finds the slide (it tries 0:12, 0:08, 0:04, 0:20 and so on, and returns `t` and `slide: true`).
   - If the result has an `error`, the video is an issue.
   - If the summary table is hard to read in the full frame, use `__ref.show('summary')`.
   - If a number is blurry, crop tighter with `__ref.show([x, y, w, h])` (1920×1080 frame pixels).
   - Check the full frame's layout first: the analyser can sit a few pixels off, and a long kill list can run below the `kills` crop.
5. **Fill the staging record** from what's on screen:
   - `t`: the time `open` returned.
   - `charLevel`: the slide's Level.
   - `analyser`:
     - `session`, e.g. "0:15h";
     - `rawXpGain`, `rawXph`, `xpGain`, `xph`, `loot`, `supplies`, `balance`.
     - An "XP/h" shown as "20,307 k" becomes `20307000`, plus the remark "XP/h shown as 20,307 k.".
   - `kills`: lowercase names as listed. Write out names cut off with "…" in full: `check` suggests matching names from `DATA`. Add "N names are cut off on screen." to `remark`.
   - `slide`:
     - `start`: Starting level, e.g. "600+".
     - `raw`: Raw Experience, e.g. "9.0kk/h" or "5.3-5.7kk/h".
     - `loot`: Expected Loot, e.g. "800k/h".
     - `bountyPreys`, `charms`, `animus`: true or false.
   - `remark` (optional): only extra facts, such as "Its header reads \"Upper Rosh\".", "At 0:12 the route map is up; the results slide is at 0:04.", or "The kill list fills the window.". The slide flags and the XP check get added for you.
   - `notesTail` (optional): goes after the generated notes, e.g. "Kill list may be incomplete." when rows look hidden.
6. **Check.** `node tools/reference/batch.js check <file>`. Exit 0 means clean. Exit 1 is an issue.
   - When a kills × exp gap remains with a clearly read, complete list, read the "TibiaWiki exp history" lines `check` prints, ending with each reading's gap at the exp its creatures had on the publish date (or run `node tools/reference/batch.js history <file | id | "creature, creature">`). A dated exp change after the video's publish date usually explains it: if the gap at publish closes, cite the change in `remark` (for example "TibiaWiki notes that on November 14, 2023 the exp of young goanna was cut by 14%…; with the earlier values the kills come to 0.4% over raw XP."). The maintainer asked for this check (October 25, 2026) before any old-exp or Forge note. A change the wiki dates that closes the gap needs no question; still list it in the report.
7. **Embed and ship.**
   1. `node tools/reference/batch.js embed <file>`. Keep its output for the report.
   2. `npm test`. The golden test runs on a frozen copy of the data (`tests/golden/data/`), so new readings don't touch it; any golden failure is an issue (below).
   3. Build: `npm run build` (fetch `fonts-cache/` first as in `CLAUDE.md` if it isn't there). If the build only changed icon PNG bytes, compare their pixels with `git show HEAD:<file>`, using `python3` with Pillow. If the pixels are identical, `git checkout` the icons.
   4. Commit `src/` (including `src/data/reference.json`), the built root files, `docs/` and `tools/reference/`. Use the message "Add ten more reference seeds (batch N)", a body listing the spots and the XP-check outcome, and the co-author line.
   5. `git push origin main`. The repo-local credential username is `anthonygdi2`.
   6. Delete the staging file.
8. **Report** in chat after every batch, under a heading such as "Batch N":
   - the embed's review table;
   - **Videos processed**;
   - **Net new monsters**: creatures no earlier reading covered;
   - **Additional spawns or vocations**: creatures already covered, now at a new spot or for a new vocation;
   - **Videos left**: counts and the next 10;
   - any `check` rows from the refresh, and anything you noted but that wasn't an issue.

   The report sections come straight from the embed output. Then start the next batch, unless `$ARGUMENTS` batches are done.

## Pre-rebalance guides

The maintainer's call (2026-10-24): one reading per Hunt Analyser on the slide.

- The results slide sits around 0:30 to 1:00 and `open` doesn't recognise it. Load the video, then use `__ref.grab(t)` and crop each analyser with `__ref.show([x, y, w, h])`.
- Each analyser becomes its own staging record with its own `id`, made from the skeleton row, for example `deeper-ingol-3-em-2026-03` and `deeper-ingol-4-em-2026-03`. Records from one video can share it; `embed` marks the Queue row once.
- The slide's table describes one analyser, usually the first. Give that record the `slide` and set `slide: null` on the rest. Note headers such as "-4 (1x bounty)" in the remark.
- There is no character level on these slides, so `charLevel` stays null unless a Skills window or the description shows it.
- Put the Bestiary box (hours per creature) and the tier rating in the remark.
- Profit showcases with no results slide: read the in-game Hunt Analyser near the end of the 15-minute session, take the level from the description, and set `slide: null`.

- "Mage (Druid/Sorcerer)" guides: record every analyser twice, once as Master Sorcerer (`-ms-`) and once as Elder Druid (`-ed-`), with the same numbers, and say so in the remark (the maintainer's call, 2026-10-24).
- Many pre-rebalance showcases overlay the finished 15-minute analyser at about 0:45; others only show it in the right-hand column near the end. Unskippable ads can run 15 to 85 seconds before the video, so wait them out instead of seeking.

## Standing decisions

- Kills × exp 1–3% over raw XP, with counts re-zoomed and clear: accept without asking. Embed with `--accept`, add a remark that influenced or fiendish (Forge) creatures probably explain it, and list it in the report.
- Creatures not in `DATA` (snake, wisp, deer, rabbit, sandcrawler, a cut-off "venerable foam …"): leave them out of `kills` and note them in the remark.
- Post-rebalance slides with two Hunt Analysers for the same spot: record the first and put the second one's numbers in the remark.
- Cut-off kill lists: the list is alphabetical, so only creatures that sort below the last visible row can be hidden. Propose an estimate split across the creatures Damage Sources lists down there, weighted by damage share. Ask before embedding it.

## Issues: stop and ask

Stop before embedding the batch when any of these happen:

- `check` lists an issue. Kills × exp more than 5% short usually means hidden rows; more than 1% over means a misread.
- `open` finds no slide on a post-rebalance guide. (Pre-rebalance guides: see the section above.)
- A digit or a name you can't read with confidence.
- A video that isn't a solo hunt guide.
- A vocation that needs a decision.
- An ad that won't skip.
- `npm test`, the build, the commit or the push fails. New readings can't change the golden test (it uses the frozen data in `tests/golden/data/`), so a golden failure means something else changed: show its first differences and stop.

To stop:

1. Finish reading the rest of the batch if you can, so the staging file holds everything readable.
2. Show the table and the issue, with the frame you saw.
3. Ask one question with these choices:
   - **accept as is**, with a note: rerun `embed` with `--accept <id>`;
   - **skip that video**: remove it from the staging file. Ask whether its Queue row stays `todo` or is moved to a skipped count;
   - **correct a value**: the user tells you the value.
4. After the answer, finish the batch and carry on with the loop.

Don't change game numbers or TibiaWiki values to make a check pass.

## When the run ends

Whether the run ended at an issue or at the batch count:

1. Summarize all batches: the readings added, the commits pushed, and the next video in the Queue.
2. Remind the maintainer that the Claude artifact still has the old version, and give the Cowork prompt with the last pushed commit hash:

> Republish my Hunt Planner artifact (<the development artifact's link, from the Claude Project>) from commit <hash> on the main branch of https://github.com/anthonygdi2/hunt-planner. The page is assembled: clone the repo at that commit, run `npm ci` (it installs esbuild, which bundles the script), then `node tools/assemble.js`, which writes dist/index.html. If you can't install npm packages, tell me and I'll attach dist/index.html instead. Publish dist/index.html, not src/index.html (it has placeholders and doesn't run on its own) and not the root index.html (that's the offline build). Update the existing artifact at that URL instead of creating a new one, and keep its existing capabilities: db (read: view, write: admin) and downloads. Don't change the file's contents. Afterwards, open it and confirm my characters and logged sessions still load.
