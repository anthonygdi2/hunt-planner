# Hunt planner redesign: tokens

From the Claude Design token sheet (`source/Tokens.dc.html`) and components page (`source/Components.dc.html`). These become `src/ui/tokens.css`.

## Color

Every color is a CSS variable set on a theme class (`.hp-dark`, `.hp-light`) at the app root. "System" follows `prefers-color-scheme`. Ratios are WCAG contrast against the surface the token sits on.

| Token | Dark | Light | Use |
|---|---|---|---|
| `--bg` | #17191c | #f4f2ee | Page background |
| `--surface` | #212429 | #ffffff | Cards, header, tab bar, editors |
| `--surface2` | #2c3036 | #ece8e1 | Set chips, inner panels, stat tiles, active tab |
| `--line` | #3a3f47 | #d9d5cc | Dividers and card outlines (decorative only) |
| `--line2` | #78808b (3.9:1) | #857f73 (4.0:1) | Borders of inputs, buttons, chips, dashed "not set" outlines |
| `--text` | #ecebe8 (13.1:1) | #1c1b19 (17.2:1) | Body text; fill of a selected segment and the Done button |
| `--muted` | #b4b8bf (7.8:1) | #55514a (7.9:1) | Labels, hints, secondary lines |
| `--accent` | #8fb3ff | #2f5fc4 | Open chip and its editor's border; "Reference, adjusted" badge outline |
| `--accent-text` | #a9c4ff (8.9:1) | #2a55b0 (6.9:1) | Links, Why?, reference badge text |
| `--gold` | #e8b84a | #c99a2e | Your next move: step 1 border, Free button, active bounty, selected vocation. Fill or border only |
| `--gold-text` | #e8b84a (8.4:1) | #7d5a00 (6.3:1) | Gold as text or icon: "Low sample", "Your bounty" |
| `--on-gold` | #1a1408 (9.9:1) | #1a1408 (7.1:1) | Text on gold, on tier tiles and on the green Done button |
| `--yours` | #7fd19b (8.5:1) | #19683a (6.8:1) | "Yours" badge, Hunting now, Done, switch on |
| `--other` | #c9a7ff (7.7:1) | #6b3fb8 (6.9:1) | "Other vocation" badge (always dashed) |
| `--focus` | #8fb3ff | #2f5fc4 | Keyboard focus: 3px outline, 2px offset, on every control |

**Tiers** (each tile always shows its letter; text is `--on-gold`):

| | S | A | B | C | D |
|---|---|---|---|---|---|
| Dark | #ff8a80 | #ffb74d | #ffe082 | #a5d6a7 | #90caf9 |
| Light | #f28b82 | #f6b26b | #ffd966 | #93c47d | #8ab4f8 |

**Avoid / Trap** (both themes): 45° stripes of gold and #1a1408, a black label with the word, and a dashed gold outline on the row. The word carries the meaning.

## Type

Atkinson Hyperlegible for everything, with bold titles and bold numbers in equal-width digits (`tabular-nums`). Form inputs are 16px so phones don't zoom. (The design used Pixelify Sans for titles and big numbers; it was dropped in October 2026 because it was hard to read and looked gimmicky.)

| Style | Font · size/line · weight |
|---|---|
| Display | Atkinson · 30/36 phone, 34/40 desktop · 700 |
| Title | Atkinson · 24/30 · 700 |
| Panel title | Atkinson · 20/26 · 700 |
| Stat number | Atkinson · 28/32 phone, 34/38 desktop · 700, tabular digits |
| Step title | Atkinson · 22/28 phone, 28/34 desktop · 700 |
| Body | Atkinson · 15/21 · 400 (700 for emphasis) |
| Small | Atkinson · 14/20 · 400 (Why? text, editor intros) |
| Caption | Atkinson · 13/18 · 400 (field labels, hints) |
| Eyebrow | Atkinson · 12/16 · 700 · caps · 0.08em |
| Badge | Atkinson · 12/17 in lists, 13/18 on step 1 · 400 |

## Spacing, radii, sizes

- Spacing on a 4px base: `--s1` 4, `--s2` 8, `--s3` 12, `--s4` 16, `--s5` 24, `--s6` 32, `--s7` 48. Inside a component 8–12, between sections 24, page padding 16 phone and 24–32 desktop.
- Radii: tiles 8, inputs 10, buttons 12, cards 14, editors 16, step 1 18, chips pill.
- Tap targets 44px minimum; main actions 52px; tab bar items 56px.
- Phone design width 390px, works down to 320. Desktop content max 1280px; inputs column 340–420px, the plan takes the rest; below about 900px the columns stack.
- Borders 1px; 2px for "open", "next move" and selected.
- Motion: none needed. If added, 150ms, and none under `prefers-reduced-motion`.

## Components (summary; details in `source/Components.dc.html`)

- **Chip:** set (muted label, bold value, solid border), not set (dashed, "+ name"), open (2px accent border, `aria-expanded`). Opens its inline editor below the chip row; one open at a time.
- **Source badges:** Yours · n hunts; Reference, adjusted to you; Reference; Other vocation; Older · before the rebalance; Low sample; Not enough data for your vocation; Taken · clears in n min. Each has its own words and border style (solid, dashed, dotted). One badge per number. "Not enough data" replaces numbers instead of showing zero.
- **Step card:** step 1 has a gold 2px border, title, bounty line, two stats, source badge, Free + Taken, Why? expanding in place. Fallbacks are compact with their own Taken. End of chain is dashed with no buttons. Hunting now uses a green border and shows the "pick offer A now" prompt while choosing offers.
- **Buttons:** Primary (gold) only for the next move (Free, Save hunt, Show my plan, Picked A), one per screen. Solid closes or confirms an editor (Done, Back to plan). Secondary for everything else. Dashed adds something new. Icon-only buttons carry an `aria-label`.
- **Segmented, switch, stepper:** segmented uses `aria-pressed` and arrow keys; switch is `role=switch`; the token stepper (0–10) output is `aria-live`.
- **Goal mixer:** presets set all four weights; editing a weight shows "Custom mix". Four rows, each 0–5. The bar is decorative; the text line carries the split.
- **Offer card and active bounty:** letter tile, creature (suggestions after 2 letters), kills (number pad), kind, Picked; Enter moves on. Active bounty has a gold border, the same fields plus kills left, Finished it (+1) and Rerolled (−1, drops it).
- **Inline editor:** short intro line, fields, live "Plan:" line, Done. Destructive actions confirm inline in place of the button.
- **Tier row and tab bar:** creature chips link to the creature panel (36px tall in a 44px row). Tab bar on phone (icon + label, `aria-current`); on desktop the same four links sit in the header.
