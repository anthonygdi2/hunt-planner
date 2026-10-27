# Security policy

## How the app works

Hunt Planner is one static web page, served by GitHub Pages at https://anthonygdi2.github.io/hunt-planner/. There’s no server, no account and no login: everything a player enters stays in their own browser’s storage, and backups are files they download themselves. The page has no runtime dependencies and loads nothing from other sites. So the main risks are in the page itself: for example, a pasted Hunting Session Analyser text or a restored backup file running code, or one character’s data reaching another site.

## Supported versions

Only the current site (the latest `main`) is supported. Fixes go out with the next release, and installed copies update when they next go online.

## Reporting a vulnerability

Please don’t open a public issue for a security problem. Use **[Report a vulnerability](https://github.com/anthonygdi2/hunt-planner/security/advisories/new)** on the repository’s Security tab, which only the maintainer can read. Include:

- what someone could do, and to whom;
- the steps, file or text that shows it (with invented data, never a real backup);
- the browser and device you used.

This is a one-person fan project, so there’s no bounty and no fixed response time, but reports are read and answered, and you’ll be credited in the fix unless you’d rather not be.

Problems with Tibia itself, TibiaWiki or GitHub Pages belong to them: report those to CipSoft, TibiaWiki or GitHub.
