# Setup notes

Personal notes for running and maintaining the site.

## Local development

```sh
npm install
npm run dev        # http://localhost:5173/ESPN_Fantasy_Football_Hub/
npm test           # unit tests (Vitest)
npm run test:e2e   # Playwright: every page at 360/390px, fails on sideways scroll
npm run build
```

## GitHub Pages

Settings → Pages → Source: **GitHub Actions**. Every push to `main` runs `deploy.yml` (test, build, publish).

## ESPN data sync

`scripts/fetch-espn.mjs` runs every 3 hours in `.github/workflows/fetch-espn.yml`, writes `public/data/*.json`, commits only when something changed, then redeploys.

Run it locally:

```sh
LEAGUE_ID=1143865755 SEASON=2026 AUSTIN_TEAM_ID=9 node scripts/fetch-espn.mjs
LEAGUE_ID=1143865755 SEASON=2026 AUSTIN_TEAM_ID=9 node scripts/fetch-espn.mjs --week 7   # backfill weeks/7 only
```

From GitHub: Actions → Sync ESPN data → Run workflow (optionally with a week to backfill).

Defaults for `LEAGUE_ID`, `SEASON` and `AUSTIN_TEAM_ID` are in the workflow. Override them with repo **variables** (Settings → Secrets and variables → Actions → Variables) next season.

What it writes:

| File | Contents |
| --- | --- |
| `meta.json` | season, week, lock time (first kickoff), isFinal, starting slots |
| `freeagents.json` | waiver-wire pool with projections. Frozen at lock so later pickups don't change it |
| `austin.json` | Austin's starting lineup, projected and actual points |
| `league.json` | every team's projected and actual total this week |
| `standings.json` | standings in playoff-seed order |
| `weeks/<n>/` | archived `austin.json` and `league.json` for each week |

### If the league goes private

The league is currently public, so no cookies are needed. If that changes, the sync will fail with a 401 and say so. Then:

1. Log in at fantasy.espn.com in Chrome or Edge.
2. Open dev tools (F12) → Application → Cookies → `https://fantasy.espn.com`.
3. Copy `espn_s2` and `SWID` (keep the curly braces in SWID).
4. Add them as repo **secrets** `ESPN_S2` and `ESPN_SWID`. Never commit them. They expire about once a year.

## Publishing a news story

Add `public/data/news/<slug>.md`:

```md
---
title: Headline goes here
tag: Power rankings
summary: One or two sentences for the card.
date: 2026-10-27
image: my-image.jpg        # optional; relative to public/data/news/ or a full URL
author: Stephen A. DeLong  # optional; this is the default
---

Story body in Markdown.
```

Then add it to the top of `public/data/news/index.json` (newest first; the first is the lead story):

```json
{ "updatedAt": "2026-10-27T12:00:00Z", "stories": [{ "slug": "my-story" }] }
```
