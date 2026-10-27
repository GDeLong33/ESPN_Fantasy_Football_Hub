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

## Supabase (stores locked-in lineups)

Supabase is a free hosted database. GitHub Pages can't save anything, so entries go here.

### 1. Create the project

1. Go to https://supabase.com and sign in (Continue with GitHub is easiest).
2. Click **New project**. Name it anything (e.g. `wswbc`), set a database password (save it somewhere, though you won't need it day to day), pick a US region, and click **Create new project**. It takes a minute or two to start.

### 2. Run the setup file

1. In the left sidebar, open **SQL Editor**.
2. Open `supabase/migrations/20261027000000_game_schema.sql` from this repo, copy the whole file, and paste it into the editor.
3. Click **Run**. You should see "Success. No rows returned." It's safe to run again if you're unsure.

### 3. Copy the keys into GitHub

In Supabase, open **Project Settings → API Keys** (or **Settings → API** on older layouts). Then in GitHub, open the repo's **Settings → Secrets and variables → Actions**.

| Supabase value | GitHub tab | Name |
| --- | --- | --- |
| Project URL (looks like `https://abcd1234.supabase.co`, under **Settings → Data API** if it isn't on the keys page) | **Variables** | `SUPABASE_URL` |
| **Publishable** key (`sb_publishable_…`), or the legacy **anon** key | **Variables** | `SUPABASE_ANON_KEY` |
| **Secret** key (`sb_secret_…`), or the legacy **service_role** key | **Secrets** | `SUPABASE_SERVICE_ROLE_KEY` |

The publishable/anon key is meant to be public; the database rules decide what it can do. The secret/service_role key can do anything, so it only goes in **Secrets**, never in code or a variable.

### 4. Turn it on

1. Actions → **Sync ESPN data** → **Run workflow**. Its log should end with `Supabase: week N synced`. This loads the week's slots, lock time and free agents into the database (it then repeats every 3 hours until kickoff).
2. Actions → **Deploy to GitHub Pages** → **Run workflow**, so the site is rebuilt with the Supabase variables. The lock-in page then shows the entry form instead of "Entries aren't open yet".

### What the database enforces

Even if someone bypasses the site, the database itself rejects entries after kickoff, a second entry under the same name (ignoring capitals and spaces), players who weren't free agents, the wrong position in a slot (FLEX takes RB/WR/TE only), and the same player twice. Nobody can read other people's lineups until the week locks, and visitors can never edit or delete entries. To see or remove entries yourself, use **Table Editor → entries** in Supabase.

The rules are tested against a real Postgres in `supabase/schema.test.mjs` (part of `npm test`).

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
