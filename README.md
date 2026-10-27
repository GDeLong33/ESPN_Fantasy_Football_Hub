# Woo She Woo Bing Chiling: league hub

The news hub for our ESPN fantasy league, starting with **Can You Beat Austin?**: build the best lineup you can from free agents only and see if it out-scores Austin's real lineup.

Static site on GitHub Pages (Vite + React + TypeScript). League data is fetched from ESPN by a scheduled GitHub Action and committed as JSON under `public/data/`.

## Local development

```sh
npm install
npm run dev     # http://localhost:5173/ESPN_Fantasy_Football_Hub/
npm test        # unit tests (Vitest)
npm run build   # production build into dist/
```

## Deploying to GitHub Pages

1. In the repo on GitHub, go to **Settings → Pages** and set **Source** to **GitHub Actions**.
2. Push to `main`. The `Deploy to GitHub Pages` workflow tests, builds and publishes the site.
3. The site is served at `https://<user>.github.io/<repo>/`. The Vite `base` is taken from the repo name automatically in CI.

## Project layout

```
src/
  components/        shared UI (header, Byline, data states)
  sections/news/     front page and story renderer
  sections/game/     Can You Beat Austin?
  site.ts            nav and section branding; add new sections here
public/data/         JSON written by the ESPN Action (do not hand-edit)
public/data/news/    index.json + one Markdown file per story
public/data/sample/  labeled placeholder fixtures used until real data exists
```

### Publishing a story

Add `public/data/news/<slug>.md`:

```md
---
title: Headline goes here
tag: Power rankings
summary: One or two sentences for the card.
date: 2026-10-27
image: my-image.jpg        # optional; relative to public/data/news/ or an absolute URL
author: Stephen A. DeLong  # optional; this is the default
---

Story body in Markdown.
```

Then list it first in `public/data/news/index.json` (newest first; the first story is the lead):

```json
{ "updatedAt": "2026-10-27T12:00:00Z", "stories": [{ "slug": "my-story" }] }
```

More setup (ESPN cookies, Supabase, secrets) arrives with later phases.
