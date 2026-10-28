#!/usr/bin/env node
// Pulls league data from ESPN and writes the static JSON the site reads.
//
//   node scripts/fetch-espn.mjs              # current week -> public/data/*.json
//   node scripts/fetch-espn.mjs --week 7     # backfill public/data/weeks/7/ only
//
// Env: LEAGUE_ID, SEASON, AUSTIN_TEAM_ID (required); ESPN_S2, ESPN_SWID (private leagues only).
// Every file is built and validated in memory first, so a bad response writes nothing.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { createClient } from './espn-client.mjs';
import { supabaseFromEnv } from './supabase-rest.mjs';
import {
  ShapeError,
  assert,
  buildAustin,
  buildFreeAgents,
  buildLeague,
  buildStandings,
  firstKickoff,
  matchupPeriodFor,
  ownerLookup,
  proTeamAbbrevs,
  weekMatchups,
  startingSlots,
  weekIsFinal,
} from './espn-transform.mjs';

const { values: args } = parseArgs({
  options: {
    week: { type: 'string' },
    out: { type: 'string', default: 'public/data' },
  },
});

function requireEnv(name) {
  const v = process.env[name]?.trim();
  if (!v) throw new Error(`Missing env var ${name}`);
  return v;
}

const season = Number(requireEnv('SEASON'));
const leagueId = requireEnv('LEAGUE_ID');
const austinTeamId = Number(requireEnv('AUSTIN_TEAM_ID'));
const outDir = args.out;

const espn = createClient({
  season,
  leagueId,
  espnS2: process.env.ESPN_S2?.trim(),
  swid: process.env.ESPN_SWID?.trim(),
});

async function readJson(file) {
  try {
    return JSON.parse(await readFile(file, 'utf8'));
  } catch {
    return null;
  }
}

const stripStamp = ({ updatedAt: _u, ...rest }) => JSON.stringify(rest);

/** Write only when the content (ignoring updatedAt) changed, so unchanged runs make no commit. */
async function writeIfChanged(rel, data, updatedAt) {
  const file = path.join(outDir, rel);
  const prev = await readJson(file);
  if (prev && stripStamp(prev) === stripStamp(data)) {
    console.log(`  unchanged  ${rel}`);
    return;
  }
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify({ updatedAt, ...data }, null, 2) + '\n');
  console.log(`  wrote      ${rel}`);
}

async function main() {
  const updatedAt = new Date().toISOString();
  console.log(`ESPN sync: league ${leagueId}, season ${season}, Austin = team ${austinTeamId}`);

  const [league, seasonInfo] = await Promise.all([
    espn.league({ views: ['mSettings', 'mTeam', 'mStatus'] }),
    espn.season({ views: ['proTeamSchedules_wl'] }),
  ]);
  assert(league?.settings && Array.isArray(league.teams), 'league: settings/teams missing');
  assert(Array.isArray(seasonInfo?.settings?.proTeams), 'season: settings.proTeams missing');

  const currentWeek = league.scoringPeriodId ?? league.status?.latestScoringPeriod;
  assert(Number.isInteger(currentWeek), 'league: scoringPeriodId missing');
  const week = args.week ? Number(args.week) : currentWeek;
  assert(Number.isInteger(week) && week >= 1 && week <= currentWeek, `--week must be 1..${currentWeek}`);
  const backfill = week !== currentWeek;
  console.log(`  week ${week}${backfill ? ' (backfill)' : ' (current)'}, league "${league.settings.name}"`);

  const slots = startingSlots(league.settings);
  const proTeams = seasonInfo.settings.proTeams;
  const abbrevs = proTeamAbbrevs(proTeams);
  const teamsById = new Map(league.teams.map((t) => [t.id, t]));
  const ownerOf = ownerLookup(league);
  assert(teamsById.has(austinTeamId), `Austin's team id ${austinTeamId} is not in this league`);
  const ctx = { season, week, austinTeamId, abbrevs, teamsById, ownerOf };

  const [rosters, scoreboard] = await Promise.all([
    espn.league({ views: ['mRoster'], params: { scoringPeriodId: week } }),
    espn.league({ views: ['mMatchupScore', 'mScoreboard'], params: { scoringPeriodId: week } }),
  ]);

  const austin = buildAustin(rosters, ctx);
  const leagueWeek = buildLeague(rosters, ctx);
  const isFinal = weekIsFinal(scoreboard, matchupPeriodFor(league.settings, week));
  const lockTime = firstKickoff(proTeams, week);

  // Per-week archive, used by the results page for any past week.
  await writeIfChanged(`weeks/${week}/austin.json`, austin, updatedAt);
  await writeIfChanged(`weeks/${week}/league.json`, leagueWeek, updatedAt);
  if (backfill) return;

  const meta = {
    season,
    week,
    lockTime,
    isFinal,
    leagueName: league.settings.name,
    slots: slots.map(({ label, accepts }) => ({ slot: label, accepts })),
  };
  const standings = buildStandings(league, ctx);

  // Freeze the pool at lock: after first kickoff, pickups would change what was available.
  const prevMeta = await readJson(path.join(outDir, 'meta.json'));
  const prevPool = await readJson(path.join(outDir, 'freeagents.json'));
  const locked = lockTime && Date.now() >= Date.parse(lockTime);
  let freeagents = null;
  if (locked && prevPool?.week === week && prevMeta?.week === week) {
    console.log('  week is locked: keeping the free-agent pool as it was at lock');
  } else {
    const kona = await espn.league({
      views: ['kona_player_info'],
      params: { scoringPeriodId: week },
      filter: {
        players: {
          filterStatus: { value: ['FREEAGENT', 'WAIVERS'] },
          filterSlotIds: { value: [0, 2, 4, 6, 16, 17] },
          limit: 2000,
          sortPercOwned: { sortPriority: 1, sortAsc: false },
        },
      },
    });
    freeagents = buildFreeAgents(kona, { ...ctx, matchups: weekMatchups(proTeams, week) });
    console.log(`  ${freeagents.players.length} free agents`);
  }

  await writeIfChanged('meta.json', meta, updatedAt);
  await writeIfChanged('austin.json', austin, updatedAt);
  await writeIfChanged('league.json', leagueWeek, updatedAt);
  await writeIfChanged('standings.json', standings, updatedAt);

  // Give the database the same slots, lock time and pool so it can validate entries itself.
  const db = supabaseFromEnv();
  if (!db) {
    console.log('  Supabase not configured: skipping pool sync');
  } else if (!freeagents || locked || !lockTime) {
    console.log('  Supabase: week locked or no lock time, pool left as is');
  } else {
    const status = await db.rpc('sync_week', {
      p_season: season,
      p_week: week,
      p_lock_time: lockTime,
      p_slots: meta.slots,
      p_players: freeagents.players.map(({ id, pos, name, team, projPts }) => ({ id, pos, name, team, projPts })),
    });
    console.log(`  Supabase: week ${week} ${status} (${freeagents.players.length} players)`);
  }
  if (freeagents) await writeIfChanged('freeagents.json', freeagents, updatedAt);
  console.log(
    `Done. Austin projects ${austin.projTotal} (actual ${austin.actualTotal}); lock ${lockTime ?? 'unknown'}; final=${isFinal}`,
  );
}

main().catch((err) => {
  console.error(`\nESPN sync FAILED: ${err instanceof ShapeError ? 'unexpected response shape: ' : ''}${err.message}`);
  process.exit(1);
});
