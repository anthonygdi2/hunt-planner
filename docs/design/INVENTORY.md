# Hunt planner redesign: screen inventory

Source: the Claude Design session "Hunt planner redesign" (October 2026). The design files are in `docs/design/source/` (`*.dc.html`, Claude Design format; open them as HTML source for layout and CSS values). Tokens are in `TOKENS.md`.

This is the UI spec: build against it. Where it conflicts with `docs/ARCHITECTURE.md` (section "Decisions"), the architecture doc wins. The overrides are marked **[Decision]** below.

## Global rules

- **Never assume the app saw something.** Rerolls, picks, claims and hunts can happen in game without the app. Every value (tokens, offers, active bounty, kills left, weekly Done) can be typed over at any time. Shortcut buttons only save typing.
- **No kill tracking.** The app never counts kills toward a bounty or weekly task. **[Decision]** The player can type the kills left; it defaults to all kills left, and it feeds scoring only.
- **Logging is optional and rare.** Only clean, focused, break-free hunts. Nothing else in the app depends on a log.
- **Everything on Plan is optional.** With only vocation and level the plan still works, from reference hunts.
- **No modal pop-ups.** Editors expand inline; Log a clean hunt and Characters are full pages with Back. Destructive actions confirm inline, in place of the button.
- **Header (every screen):** app name, character switcher (name, vocation, level), settings button → Characters and settings.
- **Navigation:** Plan, Spots, Creatures, Weekly. Bottom tab bar on phone, header links on desktop.
- **Words:** "Bounty" (never board), "bounty offers" (the three choices), "active bounty" (the one picked), "pick" (not hold), "reroll token", "Taken / Free", "clean hunt", **[Decision]** "kills left".
- **Data** is saved in this browser per character; backup and restore in Characters.

## 1. Plan (home)

Answers "where should I hunt right now?" as a short chain of steps. Opens as you left it.

**Shows**
- "Plan is using" chips: Goal, Bounty, Weekly, Today's boosts, Time, Data. Set chips show their value; unset ones are dashed.
- Step 1: title ("Go to Cobra Bastion"), a bounty line ("counts for your active bounty", or "for offer A, pick once the spot is free"), exp/h, profit/h, source badge(s), low-sample warning if any.
- Fallback steps ("Taken? → …"): name, exp/h · profit/h, badge.
- End of chain: "Reroll and re-plan" with tokens left (and "drops your bounty" when one is active), or "See Spots for more" when tokens are 0.
- Taken spots list: name, marked how long ago, minutes until it clears. Hidden when empty.
- Desktop: the same inputs as an always-open left column; steps on the right.

**You can**
- Tap a chip to open its editor below the chips; tap again or Done to close. Only one open at a time.
- **Free** on step 1: the card becomes "Hunting now" at that spot. If you're still choosing offers and this spot is for one of them, a gold prompt says "pick offer A now" with **Picked A** (makes it the active bounty).
- **Taken** on any step: marks the spot taken (default 45 min), moves the next step up, adds it to Taken spots.
- **Why?**: expands the reason for that step in place.
- In Hunting now: **Log a clean hunt** (optional) or **Back to plan**.
- **Free again** on a Taken spot: clears the mark early.
- Tap the end of chain: Reroll opens the Bounty editor; See Spots goes to Spots.

**States:** normal; Hunting now; every planned spot taken ("See Spots for more, or free a spot below"); no bounty set (plan ignores bounty); choosing offers vs active bounty.

Reference-only numbers carry the note "top players' numbers, likely more than you'll get" until a log adjusts them. After server save the Today chip resets to unset.

## 2. Plan editors (inline)

Each opens below the chips, has a one-line intro saying what it changes, and ends with a live "Plan: …" line and Done.

**Goal mix**
- Presets: Exp (exp 5), Profit (profit 5), Mostly exp some profit (exp 4, profit 2), Balanced (exp 3, profit 3), Charm points (charm 5), Bounty points (bounty 5). Picking one sets all weights.
- Weights 0–5 for Exp, Profit, Charm points, Bounty points.
- Split bar and text ("Exp 67% · Profit 33%"). All zero: "Nothing weighted yet, so the plan uses Exp."
- Chip shows the preset name, or "Custom mix".

**Bounty: choosing offers**
- Difficulty (Master, Expert, Adept, Beginner). Reroll tokens stepper 0–10.
- **[Decision]** Under the difficulty, one line saying whether another difficulty suits the goal better (and that switching is free while a bounty is active, a token while choosing), with Compare difficulties opening a table: value against the current one and how many creatures have numbers.
- **[Decision]** The Preferred / Unwanted lists in one line ("★ Preferred 2 of 5 · ⊘ Unwanted 1 of 5", or "not set") with **Edit lists**, which opens the lists on Creatures. They change the odds of the next board, so they belong where the reroll is decided.
- Offers A, B, C: creature (suggestions after 2 letters), kills needed (number pad), kind Normal / Silver / Gold, **Picked**. Enter moves to the next field. An offer whose creature is on a list says so (★ Preferred / ⊘ Unwanted).
- **[Decision]** For a Challenging creature on Master, an optional "Reward exp" field (the reward the game shows), used to learn that creature's reward rate.
- **Rerolled**: tokens −1, clears the three offers, cursor to offer A.
- Note: picking makes the other two disappear in game, so pick after checking the spot is free.

**Bounty: active**
- Difficulty, tokens stepper, active bounty: creature, kills needed, kind, **[Decision]** kills left (defaults to kills needed; type over it from the game's counter). All editable.
- **Finished it**: tokens +1 (max 10), clears the bounty, switches to choosing offers.
- **Rerolled**: tokens −1, drops the bounty, switches to choosing offers.
- Chip value: "Cobra Assassin · 4 tokens", or "3 offers · 4 tokens" while choosing.

**Today's boosts**: boosted creature; Prey 1 (creature, bonus type, size); Add a prey; Exp event. Counts the boosted creature's double exp, prey exp bonus and exp events only. Clears at server save.

**Weekly**: compact list of open kill tasks with kills left and Done; link to the Weekly tab.

**Time**: No limit, 30 min, 1 h, 1.5 h, 2 h, 3 h, 4 h (counts travel time and only kills you can finish).

**Data**: Mine only / + Reference / Everything; link to the detailed switches in Characters.

## 3. First run

**Shows:** heading and one line (two answers get a plan; everything else optional); five vocation buttons; level field; what you'll see first (reference numbers caveat); restore-backup link.

**You can:** pick a vocation, type a level, **Show my plan** (disabled until level is set) → Plan with dashed hint chips. Restore a backup instead. Name is optional; the character is called by vocation and level until named.

## 4. Log a clean hunt (full page)

Reached from Hunting now, a spot page, a variation button, or Spots → "Log a clean hunt at a new spot".

**Shows**
- Reminder: only focused, break-free hunts; skipping is fine.
- Paste box (focused on open); once read: the pasted text and "Read it: 1 h 2 min, 4 creature types".
- Preview: where (Known spot / New spot), exp/h, profit/h, kills per hour per creature, what saving does.
- Parse error message with how to fix it.

**You can**
- **Known spot**: choose the spot (preset to where you tapped Free, or the spot page you came from). Variations appear in the list.
- **New spot**: name (required), Variation of (optional, an existing spot), route or tactic note (optional). Creatures come from the paste.
- **Save hunt** or **Don't save**. Paste again.

**Rules**
- Saving updates only spot numbers ("Yours · n hunts") and the reference adjustment. Bounty, tokens and weekly are never touched.
- A new spot joins Spots and the plan with Yours · 1 hunt and low sample. A variation is listed under its parent too. **[Decision]** Variations compete in the plan as their own spots.
- Leaving the page after a paste asks inline: discard this hunt?

## 5. Spots

**Shows:** count and what Score means. Rows: name (variations show "Your variation of …"), score, exp/h · profit/h, creatures (your bounty marked), source badge, low sample, Taken with minutes left, or "Not enough data for your vocation" in place of numbers. "What the badges mean" (collapsed).

**You can:** search by spot or creature; sort by Score, Exp/h, Profit/h; toggle All vocations, Any level, Hide taken; open a spot; **Log a clean hunt at a new spot**.

## 6. Spot page

**Shows:** name, score for this character and goal, exp/h, profit/h, source badge. Creatures here with kills/h, marked "Your bounty", "Bounty offer B" or "Weekly task". Where the numbers come from: your hunts, the reference as recorded and as adjusted, sources skipped and why. Your variations (name, score, numbers, note, hunts). Your sessions (date, length, exp/h, profit/h).

**You can:** **Mark taken** / Free again; **Log a clean hunt** here; **Log a hunt as a new variation** (opens Log with New spot and this spot as parent); open a variation; open a creature; delete one of your sessions (inline confirm). Advanced mode: type your own numbers for this spot; **[Decision]** rename or delete a spot you created; edit a session's Echo Raid counts.

## 7. Creatures (was Classic view)

**Shows:** tiers S–D and Avoid for the chosen difficulty and goal mix; each creature as a chip, with bounty, Preferred, Unwanted and low-data markers. Table view: creature, tier, best spot, exp/h, profit/h, source.

**You can:** switch Tiers / Table; search; open a creature panel (its spots, numbers and sources; mark Preferred or Unwanted, mirroring the in-game lists); edit the Preferred / Unwanted lists (the old slots planner, with odds). **[Decision]** The creature panel also keeps: Avoid, bestiary finished, Echo Warden done, notes, and in Advanced mode own numbers, pinned spot and "usable from level".

## 8. Weekly

**Shows:** week start and next reset (Monday, server save). Done count. 6 kill-task rows, or 9 with the expansion: creature, **[Decision]** kills left, Done. How the plan uses these. Delivery tasks are not listed.

**You can:** set difficulty and 6 / 9 tasks; type creature and kills left; toggle Done when claimed in game; **Start a new week** (clears rows; also offered automatically after the Monday reset).

## 9. Characters and settings (full page)

**Shows:** character pills; this character's name, vocation, level, Talisman bestiary bonus. Numbers from: preset plus switches for reference hunts, other vocations, older hunts; calibration status in plain words. World; how long a Taken mark lasts. Advanced mode. Theme. Backup. Credits.

**You can:** switch, add or delete a character (inline confirm); choose Mine only / + Reference / Everything, or flip each switch (the preset shows "Custom" when switches don't match one); set world and Taken length (30 min, 45 min default, 1 h, 2 h); turn on Advanced mode; Theme System / Dark / Light; Download backup, Restore. **[Decision]** Advanced mode adds: Raw or boosted exp, hunting hours per day (reroll model), logging boards for Silver/Gold odds, full score breakdown in Why?

## Data changes (from the design, with decisions applied)

See `docs/ARCHITECTURE.md`, "State model", for the authoritative version and migrations.

- **Bounty:** mode (offers | active); offers[3] {creature, kills, kind}; active {creature, kills, killsLeft, kind}; tokens 0–10; difficulty.
- **Goal weights** {xp, profit, charm, bounty}, each 0–5; preset name is derived, not stored.
- **Taken marks** {spot, markedAt}; expire after the Taken length setting (default 45 min).
- **Hunting now:** the spot tapped Free (cleared by Back to plan, Taken or a log).
- **User spots** {id, name, parentSpot?, note?, creatures from paste, sessions}. Treated as spots everywhere, with no reference.
- **Weekly:** up to 9 kill tasks {creature, killsLeft, done}; slots 6 | 9; week start; difficulty.
- **Source switches** {reference, otherVocation, older}; preset derived.
- **Settings:** Taken length, theme (system | dark | light).
- **Removed:** kill progress counted from logged hunts; the active-hunt timer and End and log; "Hold" as a separate state from the active bounty; Classic view as a separate mode (its parts live in Creatures).

## Open questions from the design, answered

- Does scoring combine goal weights as plain shares? Yes, as shares of normalized factors: each goal's number is divided by the best value in the pool, then the weighted average is taken. The split bar is accurate.
- Kill-count ranges per creature and difficulty: not known; offers and weekly rows aren't prefilled.
- Variations compete in the plan as their own spots: yes.
- Should scoring prefer offers whose spots have a free fallback? Not now; revisit with occupancy learning.
