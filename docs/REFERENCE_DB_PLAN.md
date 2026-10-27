# Reference hunt database: plan

Status: Phase 1 (reference layer) built October 24, 2026. Phase 2 seed tooling built the same day (readings file, generator, video list refresh); 722 seed entries from 488 videos. Last updated October 24, 2026.

## Problem

The tool only knows creatures you've hunted yourself, so new users (and the maintainer at unexplored spawns) see mostly "Not enough data." Outside feedback: "there needs to be a database to pull from" and "I don't wanna have to hunt everything first."

The catch, also from the feedback: published hunt numbers are optimized laps that maybe 1% of players hit, and results differ a lot by vocation, level and skill.

## Principles

1. **Reference numbers are goalposts, not predictions.** They're scaled to each character before use.
2. **Your own data always wins.** Once you log a spot, your numbers replace the reference for that spot.
3. **Every number shows its source.** Badge each value as Yours, Reference adjusted to you, or Reference (not yet adjusted).
4. **Newer beats older.** Several entries per spot are allowed; the newest for that vocation is used, and pre-rebalance data is flagged.
5. **Offline still works.** Reference data is embedded in the HTML like `DATA`, versioned with each build. No runtime fetching.

## Data source

Kusnier's YouTube hunt videos, which are being remade after the vocation rebalance. TibiaPal (tibiapal.com) lists hunts and links his videos; entries with a blue video link are the updated ones, so TibiaPal is the easiest index to work from.

What the videos show (per the maintainer):
- The Hunt Analyser is usually visible: session length, raw XP/h, XP/h, loot, balance.
- The killed-monsters list may not be visible.
- In most videos he shows a list of how long it takes to finish the bounty for each creature at that spot. Kills required ÷ that time gives a kills/h estimate per creature. Open item: confirm which kill count his times assume (a specific task size, or an average).

What we found reading them (October 24, 2026):
- The time lists in the videos read so far are **bestiary** times (hours to finish the bestiary), not bounty times, and they can assume the wrong class (Draken Warmaster is Medium, 1,000 kills; his times fit 2,500). So kills/h comes from the analyser's kill list (`how: "kills"`): kill count ÷ session length, where the length is XP gain ÷ XP/h (the analyser rounds "00:15h" down).
- His results tables label balance as "Loot" (old videos) or "Expected Loot (market values)" (2026 videos): balance per hour, usually rounded down (250k/h on the slide for 313k/h in the analyser). The tool uses the analyser's balance.
- The kill list can be checked: kills × TibiaWiki base exp should equal the analyser's Raw XP Gain. Of the ten October 2026 batch, five matched exactly and four were within 0.3%; Ramoa was 3.8% short with the list filling the window, so rows were probably hidden (noted on the entry). In the third batch the five level 200–327 guides were within 0.25%, but the five level 600+ guides (charms on, three with animus) were 2.9–4.1% short even with the whole list visible, so something there adds exp per kill that the base values miss; kill rates are unaffected. Norcferatu Dungeons West was 9.1% short with the list filling the window (noted on the entry).
- When the kill-list check misses with a complete list, look at the creatures' TibiaWiki **history** field first (`node tools/reference/batch.js history <file | reading id | "creature, creature">`; `check` prints it for failing readings). TibiaWiki dates balance changes there ("On November 14, 2023, its exp was reduced by 7%", "As announced on May 14, 2024, the patch increased experience from 2,500 to 2,770"), so an older guide's gap can be explained exactly without rescanning the video (batch 43, October 25, 2026: Issavi Surface East −7.4% → +0.4% with the pre-November-2023 goanna, manticore and feral sphinx exp; Yalahar Alchemist Central +1.3% → exact with nightmare at 1,666). Many creatures have no history note yet, including the June 2026 rebalance changes, so a missing note proves nothing.
- Earlier readings to revisit with that check: `node tools/reference/batch.js recheck` lists every reading more than 1% off whose gap a dated change after its publish date narrows, from the saved kills (no rescanning). On October 25, 2026 it found 51 of 152: most of the old-exp notes close to within 1% (asuras, nagas, Iksupan mitmah seers, Wote 8 drakens, Deep Desert, Warzone 6, Diremaw Task Area, Oramond golems and wildlife, Glooth Tower, Norcferatu Dungeons West), and the Nimmersatt dragons, true asuras, Norcferatu Fortress and Dungeons East, Oramond Minotaur Raid and Seacrest get within 1.6–3.7%. The same day their remarks were rewritten to cite the dated changes instead of the generic "before the rebalance", "before the 2024 exp changes" or Forge guesses (48 readings; 12 say part of the gap remains). Batch 45 found Lizard Chosens (+15%) the same way: lizard chosen 2,200 → 2,530 on August 27, 2024.
- The results slide shows from about 0:04 to 1:30 in 2026 guides; 0:08 sometimes lands on a route map, 0:12 is safer.
- Since the rebalance, guides open with a results slide at about 0:08 showing everything at once, and say whether preys, charms, bounty or animus were used.
- The queue of videos to read, newest first, with what's done: `docs/REFERENCE_VIDEOS.md`.

Fallbacks when no bounty-time list exists:
- Single-creature spawns: kills/h ≈ raw exp/h ÷ that creature's base exp (TibiaWiki).
- Mixed spawns: leave per-creature kills/h unknown rather than guess, unless the analyser's kill list is visible.

Collection approach: scrape TibiaPal's hunt index (spot, vocation, level range, exp/h, profit/h, video link, date) with a script or Claude in Chrome, then read each video's first minute for the analyser numbers and bounty-time list. The maintainer is willing to do or check this by hand, and has floated a computer-vision tool for the video frames. Credit TibiaPal and Kusnier in the app, and ideally ask them first, since this republishes their compiled data.

## Proposed data shape

```
REFERENCE = [{
  id: "cobra-bastion-ek-2026-08",
  spot: "Cobra Bastion",
  vocation: "Elite Knight",          // or "any"
  levelMin: 400, levelMax: 900,       // recommended range
  team: "solo",
  rawXph: 5200000, xph: 7800000, profitph: 300000,
  creatures: [{ slug: "cobra-assassin", kph: 480 }, ...],
  source: { who: "Kusnier", url: "...", date: "2026-08-14", postRebalance: true },
  profitStale: false,                 // optional: true marks profit as dated even after the rebalance
  access: "Cobra Bastion access quest", // optional, for later access tracking
  notes: "Meta lap"
}]
```

## Calibration ("how close am I to the goalpost?")

Agreed rules (October 24, 2026):

- **Global per-character ratios**, not per creature or per spot. Wherever you'd have local data, your own numbers already replace the reference, so the ratios only ever adjust spots you haven't logged.
- **Overlap**: every spot where the character has clean (no-break) sessions and a matching reference entry (your vocation, else "any"). **No minimum session length**: which hunts to log is the player's call, and a 3-minute hunt counts if they think it's representative.
- **Per-spot ratios** come from all clean time logged at that spot:
  - kills: your summed kills/h ÷ reference summed kills/h, over the creatures that appear in both;
  - exp: your raw exp/h ÷ reference `rawXph`, always in raw terms. In XP mode, adjusted exp is then multiplied by the character's own XP-to-raw ratio from their sessions.
- **One spot, one vote**: each matched spot counts once, however long it was hunted. A long farm spot can't dominate, so no hours cap is needed.
- **Shrinkage**: the average is taken in log space, with a prior worth one spot at 1.0: `ratio = exp( Σ ln rᵢ / (n + 1) )` over n spots. One spot at 0.6 gives about 0.77; three at 0.6 give about 0.68.
- **Clamping**: each spot's ratio to 0.2–1.5 before averaging, and the result to 0.2–1.5. With no minimum length, this is the guard against one odd hunt.
- **Profit uses an offset, not a ratio**, because profit can be negative: `adjusted = reference profit × kill ratio + offset`. The offset is the average, one vote per spot, of (yours − reference × kill ratio), shrunk toward 0 with the same one-spot prior. Each spot's difference is clamped to ± the larger of the reference profit and 500k.
- **Dated profit** (agreed October 24, 2026): newer game systems made some spawns much more profitable, so a profit gap against an old video reflects the spawn and the era, not the player. Only post-rebalance entries (`source.postRebalance !== false`) vote on the profit offset; older ones still vote on kills and exp. Entries that are pre-rebalance, or flagged with the optional `profitStale: true`, show `reference profit × kill ratio` with no offset, labelled "Profit from 2021, may be out of date" in the creature panel, on offer cards and in the Table.
- **The summary shows what it rests on**, for example "from 6 spots (2h 40m logged)", so a ratio built on very little time is visible.
- Apply the ratios to reference entries for spots the character hasn't logged.
- With no overlap yet, use the reference unadjusted and say so.

## UI changes

- Source badge on numbers in the creature panel, spot table, offer cards and table view.
- Characters dialog: show the calibration ("You hunt at about 72% of reference exp/h and 85% of reference kills/h, from 6 spots").
- Optional per-session readout later: "This hunt was 68% of the reference lap" (keep the tone encouraging).
- A setting to turn reference data off, for people who only want their own numbers.
- Vocation lens: the character's vocation picks the reference entries; fall back to "any" entries with a note.
- Other vocations (built October 24, 2026): a third tier after your own numbers and your vocation's (or "any") references. Another vocation's hunt fills a creature only when nothing for your vocation covers it, carries an "Other vocation" badge (purple), and is calibrated per vocation: your clean hunts at spots where that vocation also has a reference give a separate kill/exp ratio and profit offset, with the same rules as above. One other-vocation entry per spot, preferring a vocation you're calibrated against. Unused ones are still listed in the creature panel's Hunt spots with the reason. A per-character switch (`refOtherOff`) turns the tier off.
- Reference level ranges can fill in "usable from level" where the user hasn't set one.

## Phases

**Phase 1: reference layer (Claude Code).** Schema, embedding, calibration, source badges, merging reference data into `derive`/`eff` so every existing feature (tier list, board, reroll, weekly, slots) uses it. Seed with 5–10 spots entered by hand from videos the maintainer knows, enough to prove the display and calibration. Tests for: own data overriding reference, calibration math, badges, reference off.

**Phase 2: data collection (Claude Code, or a claude.ai chat with Claude in Chrome).** Scripts in `tools/` to pull TibiaPal's index and record video readings into a reviewable CSV/JSON, then a step that converts it into the embedded `REFERENCE`. Human review before each import.

Built October 24, 2026 (working from Kusnier's channel directly rather than TibiaPal):
- `tools/reference/readings.json`: one record per video reading (video id and time, published date, spot, aliases, vocation, level, character level, the analyser numbers, the kill list, notes).
- `node tools/reference/generate.js` rewrites `src/data/reference.json` (the page's `REFERENCE`, inlined by `tools/assemble.js`) from the readings (rules in its header comment); `--check` only verifies. The smoke test fails if the file and the readings disagree, so never edit the file by hand.
- `node tools/reference/refresh-videos.js` adds new uploads from the channel to `docs/REFERENCE_VIDEOS.md` (see that file).
- `/reference-batch` (`.claude/skills/reference-batch/SKILL.md`) runs the reading loop ten videos at a time: `tools/reference/batch.js` writes a staging skeleton from the Queue, checks kills × TibiaWiki exp (cached in `wiki-exp.json`), embeds, marks rows done and reports net new monsters, new spots or vocations for known ones, and videos left; `browser-helpers.js` finds the results slide and crops it for screenshots. It stops for a person on any check issue, an unreadable frame, a guide without the 2026 slide, or a failing test, build or push.

**Phase 3: polish.** Freshness handling and rebalance flags, efficiency readout, access-quest tracking, then crowdsourced average-player data (export one spot's sessions, merge into the reference) if wanted.

## Open decisions

- Who to ask and how to credit TibiaPal and Kusnier.
- Whether reference data should affect the Score on day one or only fill gaps until the user logs anything.
