# Accessibility

Hunt Planner should be usable by every Tibia player, on a phone or a computer, whatever their eyesight, hands or language.

## What the app does

- **Text and contrast:** the Atkinson Hyperlegible font, built for readers with low vision. Text contrast is measured in both themes (at least 4.5:1, or 3:1 for large text), and inputs use 16 px text so phones don’t zoom.
- **Color is never the only signal:** tiers always show their letter, badges have words, and marks like Preferred (★) and Unwanted (⊘) have names.
- **Light and dark themes**, or the system’s choice.
- **Touch:** tap targets are at least 44 px.
- **Keyboard:** every control can be reached and used with the keyboard, with a visible focus ring; segmented controls take the arrow keys.
- **Screen readers:** every control has an accessible name, and controls use `aria-pressed`, `aria-expanded`, `aria-current` and live regions where they apply.
- **No pop-ups:** editors open inline and pages have a Back button, so focus doesn’t jump into a dialog.
- **No motion:** there are no animations.
- **Small screens:** every screen works from 320 px wide.
- **Languages:** English, Español, Português (Brasil) and Polski.

## Supported environments

Current versions of Chrome, Edge, Firefox and Safari, on phones and computers, in the browser or installed as an app. It works offline once loaded.

## Known limitations

- It hasn’t been tested end to end with a screen reader (VoiceOver, TalkBack, NVDA) yet.
- Creature and spot names stay in English, as Tibia shows them, in every language.
- The screenshots in the README show the English app, and the Creatures screen’s tier rows are easier to scan by sight than by ear. The Table view lists the same creatures in rows.

## Reporting a barrier

[Open an issue](https://github.com/anthonygdi2/hunt-planner/issues/new?template=bug_report.yml): what you were trying to do, what got in the way, and the device, browser and any assistive technology you use. Barriers are treated as bugs.
