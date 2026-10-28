#!/usr/bin/env node
// Finds new league news (trades, star injuries, week recaps, the odd rumor) and has
// Stephen A. DeLong write it up for the home page.
//
//   node scripts/news/write-news.mjs            # find news, write stories, publish
//   node scripts/news/write-news.mjs --dry-run  # print what it would write; no AI calls, no files
//
// Env: LEAGUE_ID, SEASON, AUSTIN_TEAM_ID; ANTHROPIC_API_KEY or GEMINI_API_KEY (NEWS_AI picks one
// if both are set). Optional: GEMINI_MODEL, CLAUDE_MODEL, RUMOR_CHANCE (0-1, default 0.2).
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { createClient } from '../espn-client.mjs';
import { proTeamAbbrevs } from '../espn-transform.mjs';
import {
  eventFacts,
  findInjuries,
  findTrades,
  firstNameLookup,
  latestFinalPeriod,
  pickRumor,
  recapFacts,
  rosterSnapshot,
} from './events.mjs';
import { addToIndex, easternDate, storyMarkdown, uniqueSlug } from './publish.mjs';
import { isTransient, pickProvider, storyPrompt, tagFor, writeStory } from './writer.mjs';

const { values: args } = parseArgs({
  options: {
    'dry-run': { type: 'boolean', default: false },
    max: { type: 'string', default: '3' },
  },
});
const dryRun = args['dry-run'];
const maxStories = Number(args.max);

const STATE_FILE = 'data/news-state.json';
const NEWS_DIR = 'public/data/news';
const RUMOR_GAP_MS = 6 * 24 * 3600 * 1000; // at most one rumor every ~week
const RUMOR_CHANCE = Number(process.env.RUMOR_CHANCE ?? 0.2); // per run once the gap has passed

function requireEnv(name) {
  const v = process.env[name]?.trim();
  if (!v) throw new Error(`Missing env var ${name}`);
  return v;
}

async function readJson(file, fallback) {
  try {
    return JSON.parse(await readFile(file, 'utf8'));
  } catch {
    return fallback;
  }
}

async function writeJson(file, data) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(data, null, 2) + '\n');
}

async function main() {
  const season = Number(requireEnv('SEASON'));
  const austinTeamId = Number(requireEnv('AUSTIN_TEAM_ID'));
  const provider = pickProvider();
  if (!provider && !dryRun) {
    console.log('No ANTHROPIC_API_KEY or GEMINI_API_KEY set: nothing to write with. Skipping.');
    return;
  }
  console.log(`News desk: season ${season}, writer = ${provider ?? 'none (dry run)'}`);

  const espn = createClient({
    season,
    leagueId: requireEnv('LEAGUE_ID'),
    espnS2: process.env.ESPN_S2?.trim(),
    swid: process.env.ESPN_SWID?.trim(),
  });
  const league = await espn.league({ views: ['mSettings', 'mTeam', 'mStatus'] });
  const week = league.scoringPeriodId;
  const currentPeriod = league.status?.currentMatchupPeriod ?? week;
  const [seasonInfo, rosters, scoreboard, txNow, txPrev] = await Promise.all([
    espn.season({ views: ['proTeamSchedules_wl'] }),
    espn.league({ views: ['mRoster'], params: { scoringPeriodId: week } }),
    espn.league({ views: ['mMatchupScore', 'mScoreboard'] }),
    espn.league({ views: ['mTransactions2'], params: { scoringPeriodId: week } }),
    espn.league({ views: ['mTransactions2'], params: { scoringPeriodId: Math.max(1, week - 1) } }),
  ]);
  if (!Array.isArray(league.teams) || !Array.isArray(rosters?.teams)) throw new Error('ESPN: teams or rosters missing');

  const abbrevs = proTeamAbbrevs(seasonInfo?.settings?.proTeams);
  const firstNameOf = firstNameLookup(league);
  const ctx = { austinTeamId, firstNameOf };
  const snapshot = rosterSnapshot(rosters, { season, abbrevs });

  const state = await readJson(STATE_FILE, null);
  const covered = new Set(state?.covered ?? []);
  const now = Date.now();
  // Trades/injuries not written last run (over the cap, or the AI failed) are retried.
  const events = [...(state?.pending ?? [])];

  if (state?.rosters) {
    const transactions = [...(txNow?.transactions ?? []), ...(txPrev?.transactions ?? [])];
    const sinceMs = Date.parse(state.snapshotAt ?? 0) - 3600 * 1000;
    events.push(...findTrades(state.rosters, snapshot, { transactions, sinceMs, week }));
    events.push(...findInjuries(state.rosters, snapshot, { week }));
  } else {
    console.log('  first run: saving rosters; trades and injuries are reported from the next run');
  }

  const finalPeriod = latestFinalPeriod(scoreboard, currentPeriod);
  if (finalPeriod && !(state?.recapped ?? []).includes(finalPeriod)) {
    events.push({ kind: 'recap', id: `recap:${season}:${finalPeriod}`, priority: 2, period: finalPeriod });
  }

  const lastRumor = Date.parse(state?.lastRumorAt ?? 0) || 0;
  if (now - lastRumor >= RUMOR_GAP_MS && Math.random() < RUMOR_CHANCE) {
    events.push(pickRumor(snapshot, league, { ...ctx, random: Math.random, week }));
  }

  const seen = new Set();
  const open = events
    .filter((e) => !covered.has(e.id) && !seen.has(e.id) && seen.add(e.id))
    .sort((a, b) => a.priority - b.priority);
  const todo = open.slice(0, maxStories);
  console.log(`  ${events.length} event(s) found, writing ${todo.length}`);

  const index = await readJson(path.join(NEWS_DIR, 'index.json'), { updatedAt: null, stories: [] });
  let newIndex = index;
  const taken = new Set(index.stories.map((s) => s.slug));
  const recapped = new Set(state?.recapped ?? []);
  let lastRumorAt = state?.lastRumorAt ?? null;
  let failures = 0; // real problems (bad key, bad output): fail the job so it gets noticed

  for (const event of todo) {
    const facts =
      event.kind === 'recap'
        ? recapFacts(scoreboard, league, event.period, ctx)
        : event.kind === 'rumor'
          ? { rumor: event.idea, team: event.team, ...(event.partner ? { tradePartner: event.partner } : {}) }
          : eventFacts(event, league, ctx);

    if (dryRun) {
      console.log(`\n--- ${event.kind} (${event.id})\n${storyPrompt(event.kind, facts)}`);
      continue;
    }
    try {
      const story = await writeStory(provider, event.kind, facts);
      const date = easternDate();
      const slug = uniqueSlug(date, event.kind, story.title, taken);
      taken.add(slug);
      await writeFile(
        path.join(NEWS_DIR, `${slug}.md`),
        storyMarkdown(story, { tag: tagFor(event.kind), date, satire: event.kind === 'rumor' }),
      );
      newIndex = addToIndex(newIndex, slug, new Date().toISOString());
      await writeJson(path.join(NEWS_DIR, 'index.json'), newIndex);
      covered.add(event.id);
      if (event.kind === 'recap') recapped.add(event.period);
      if (event.kind === 'rumor') lastRumorAt = new Date().toISOString();
      console.log(`  published ${slug}`);
    } catch (err) {
      if (isTransient(err)) {
        // The AI is overloaded. Stop here; this and the rest are retried next run.
        console.warn(`  AI is busy (${err.status ?? err.message}); ${event.id} and anything after it will be retried next run`);
        break;
      }
      failures++;
      console.error(`  FAILED to write ${event.id}: ${err.message}`);
    }
  }

  if (dryRun) return;
  // Unwritten trades/injuries carry over (their roster change won't show up in the next diff).
  // Recaps are re-detected anyway, and a skipped rumor is just skipped.
  const pending = open.filter((e) => !covered.has(e.id) && (e.kind === 'trade' || e.kind === 'injury')).slice(0, 20);
  await writeJson(STATE_FILE, {
    snapshotAt: new Date().toISOString(),
    rosters: snapshot,
    recapped: [...recapped].sort((a, b) => a - b),
    lastRumorAt,
    covered: [...covered].slice(-500),
    pending,
  });
  if (failures) throw new Error(`${failures} stor${failures === 1 ? 'y' : 'ies'} failed (see above)`);
}

main().catch((err) => {
  console.error(`\nNews desk FAILED: ${err.message}`);
  process.exit(1);
});
