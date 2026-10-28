#!/usr/bin/env node
// Scores a finished week of Can You Beat Austin? and updates the season tally.
//
//   node scripts/score-week.mjs              # the latest week whose games are all final
//   node scripts/score-week.mjs --week 8     # backfill or re-score one week
//   node scripts/score-week.mjs --dry-run    # print results; write nothing
//
// Safe to re-run: it recomputes from ESPN and overwrites the same rows and files
// (which also picks up ESPN stat corrections).
// Env: LEAGUE_ID, SEASON, AUSTIN_TEAM_ID, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { createClient } from './espn-client.mjs';
import { POSITIONS, SPLIT_WEEK, STAT_SOURCE } from './espn-maps.mjs';
import {
  assert,
  buildAustin,
  buildLeague,
  matchupPeriodFor,
  ownerLookup,
  proTeamAbbrevs,
  weekIsFinal,
} from './espn-transform.mjs';
import { buildSeasonResults, decideWeek, scoreEntries } from './scoring.mjs';
import { supabaseFromEnv } from './supabase-rest.mjs';

const { values: args } = parseArgs({
  options: {
    week: { type: 'string' },
    'dry-run': { type: 'boolean', default: false },
    force: { type: 'boolean', default: false }, // score a week that isn't final yet (testing only)
    out: { type: 'string', default: 'public/data' },
  },
});
const dryRun = args['dry-run'];

function requireEnv(name) {
  const v = process.env[name]?.trim();
  if (!v) throw new Error(`Missing env var ${name}`);
  return v;
}

async function readJson(file) {
  try {
    return JSON.parse(await readFile(file, 'utf8'));
  } catch {
    return null;
  }
}

const stripStamp = ({ updatedAt: _u, ...rest }) => JSON.stringify(rest);

async function writeIfChanged(rel, data, updatedAt) {
  const file = path.join(args.out, rel);
  const prev = await readJson(file);
  if (prev && stripStamp(prev) === stripStamp(data)) {
    console.log(`  unchanged  ${rel}`);
    return;
  }
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify({ updatedAt, ...data }, null, 2) + '\n');
  console.log(`  wrote      ${rel}`);
}

/** Actual points (plus name/pos/team) for specific players in one week. */
async function playerPoints(espn, ids, { season, week, abbrevs }) {
  const out = new Map();
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100);
    const resp = await espn.league({
      views: ['kona_player_info'],
      params: { scoringPeriodId: week },
      filter: { players: { filterIds: { value: chunk } } },
    });
    assert(Array.isArray(resp?.players), 'kona_player_info: players array missing');
    for (const { player: p } of resp.players) {
      const line = (p.stats ?? []).find(
        (s) => s.seasonId === season && s.scoringPeriodId === week && s.statSourceId === STAT_SOURCE.ACTUAL && s.statSplitTypeId === SPLIT_WEEK,
      );
      out.set(p.id, {
        name: p.fullName,
        pos: POSITIONS[p.defaultPositionId] ?? null,
        team: abbrevs.get(p.proTeamId) ?? null,
        points: typeof line?.appliedTotal === 'number' ? line.appliedTotal : null,
      });
    }
  }
  const missing = ids.filter((id) => !out.has(id));
  if (missing.length) console.warn(`  ESPN returned nothing for player(s) ${missing.join(', ')}; scoring them 0`);
  return out;
}

async function main() {
  const season = Number(requireEnv('SEASON'));
  const austinTeamId = Number(requireEnv('AUSTIN_TEAM_ID'));
  const db = supabaseFromEnv();
  if (!db) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required to read entries');
  const espn = createClient({
    season,
    leagueId: requireEnv('LEAGUE_ID'),
    espnS2: process.env.ESPN_S2?.trim(),
    swid: process.env.ESPN_SWID?.trim(),
  });

  const [league, seasonInfo, scoreboard] = await Promise.all([
    espn.league({ views: ['mSettings', 'mTeam', 'mStatus'] }),
    espn.season({ views: ['proTeamSchedules_wl'] }),
    espn.league({ views: ['mMatchupScore', 'mScoreboard'] }),
  ]);
  assert(league?.settings && Array.isArray(league.teams), 'league: settings/teams missing');
  const currentWeek = league.scoringPeriodId;
  const isFinal = (w) => weekIsFinal(scoreboard, matchupPeriodFor(league.settings, w));

  let week;
  if (args.week) {
    week = Number(args.week);
    assert(Number.isInteger(week) && week >= 1 && week <= currentWeek, `--week must be 1..${currentWeek}`);
    if (!isFinal(week) && !args.force) throw new Error(`Week ${week} isn't final yet (use --force to score it anyway)`);
  } else {
    for (let w = currentWeek; w >= 1 && !week; w--) if (isFinal(w)) week = w;
    if (!week) {
      console.log('No finished week yet. Nothing to score.');
      return;
    }
  }
  console.log(`Scoring week ${week} of ${season}${dryRun ? ' (dry run)' : ''}`);

  // Austin and the league, final for that week (also refreshes the weekly archive).
  const abbrevs = proTeamAbbrevs(seasonInfo?.settings?.proTeams);
  const teamsById = new Map(league.teams.map((t) => [t.id, t]));
  const ctx = { season, week, austinTeamId, abbrevs, teamsById, ownerOf: ownerLookup(league) };
  const rosters = await espn.league({ views: ['mRoster'], params: { scoringPeriodId: week } });
  const austin = buildAustin(rosters, ctx);
  const leagueWeek = buildLeague(rosters, ctx);

  const entries = await db.select(
    `entries?season=eq.${season}&week=eq.${week}&select=id,name,team_name,lineup,created_at&order=created_at`,
  );
  assert(Array.isArray(entries), 'Supabase: entries response is not a list');
  const ids = [...new Set(entries.flatMap((e) => (e.lineup ?? []).map((p) => p.playerId)))];
  const players = ids.length ? await playerPoints(espn, ids, ctx) : new Map();
  const scored = scoreEntries(entries, players);
  const result = decideWeek(austin.actualTotal, scored);

  console.log(`  Austin (${austin.teamName}): ${austin.actualTotal}`);
  for (const [i, s] of scored.entries()) console.log(`  ${i + 1}. ${s.name}: ${s.points}`);
  console.log(result ? `  Winner: ${result.winner === 'austin' ? 'Austin' : 'the field'}` : '  Nobody entered: no result');
  if (dryRun) return;

  const updatedAt = new Date().toISOString();
  if (result) {
    await db.upsert(
      'weekly_results',
      [
        {
          season,
          week,
          austin_points: austin.actualTotal,
          top_entry_id: result.topEntryId,
          winner: result.winner,
          entry_scores: scored.map((s) => ({ entryId: s.entryId, name: s.name, points: s.points })),
          updated_at: updatedAt,
        },
      ],
      'season,week',
    );
  } else {
    // e.g. the only entry was a test that has since been deleted.
    await db.remove(`weekly_results?season=eq.${season}&week=eq.${week}`);
  }

  await writeIfChanged(`weeks/${week}/austin.json`, austin, updatedAt);
  await writeIfChanged(`weeks/${week}/league.json`, leagueWeek, updatedAt);
  await writeIfChanged(
    `weeks/${week}/results.json`,
    {
      season,
      week,
      austin: { teamName: austin.teamName, points: austin.actualTotal, lineup: austin.lineup },
      winner: result?.winner ?? null,
      entries: scored.map(({ createdAt: _c, ...s }) => ({ ...s, beatAustin: s.points > austin.actualTotal })),
    },
    updatedAt,
  );

  // The season file is rebuilt from every scored week in the database.
  const rows = await db.select(`weekly_results?season=eq.${season}&select=*`);
  await writeIfChanged('results.json', buildSeasonResults(rows, season), updatedAt);
  console.log('Done.');
}

main().catch((err) => {
  console.error(`\nScoring FAILED: ${err.message}`);
  process.exit(1);
});
