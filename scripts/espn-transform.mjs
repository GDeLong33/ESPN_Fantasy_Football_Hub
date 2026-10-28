// Pure functions that turn raw ESPN responses into the site's JSON files.
// No network or filesystem here, so they can be unit-tested with small fixtures.
import { INJURY, NON_STARTING_SLOTS, POSITIONS, SLOTS, SLOT_ORDER, SPLIT_WEEK, STAT_SOURCE } from './espn-maps.mjs';

export class ShapeError extends Error {}

export function assert(cond, msg) {
  if (!cond) throw new ShapeError(msg);
}

const round = (n) => Math.round(n * 100) / 100;

/** Points for one player in one week. Returns null when ESPN has no stat line. */
export function weekPoints(player, season, week, source) {
  const line = (player?.stats ?? []).find(
    (s) =>
      s.seasonId === season && s.scoringPeriodId === week && s.statSourceId === source && s.statSplitTypeId === SPLIT_WEEK,
  );
  return typeof line?.appliedTotal === 'number' ? round(line.appliedTotal) : null;
}

/** Starting lineup slots from mSettings, in display order, e.g. ['QB','RB','RB',...]. */
export function startingSlots(settings) {
  const counts = settings?.rosterSettings?.lineupSlotCounts;
  assert(counts && typeof counts === 'object', 'mSettings: settings.rosterSettings.lineupSlotCounts missing');
  const slots = [];
  for (const id of SLOT_ORDER) {
    const n = counts[id] ?? 0;
    if (n > 0) {
      assert(SLOTS[id], `mSettings: unknown lineup slot id ${id}`);
      for (let i = 0; i < n; i++) slots.push({ id, label: SLOTS[id].label, accepts: SLOTS[id].accepts });
    }
  }
  const unknown = Object.entries(counts).filter(
    ([id, n]) => n > 0 && !SLOT_ORDER.includes(Number(id)) && !NON_STARTING_SLOTS.has(Number(id)),
  );
  assert(unknown.length === 0, `mSettings: unhandled starting slot ids ${unknown.map(([id]) => id).join(', ')}`);
  assert(slots.length > 0, 'mSettings: no starting slots found');
  return slots;
}

/** "Austin Goulding" -> "Austin G." Keeps full names off the public site. */
export function shortName(member) {
  const first = (member?.firstName ?? '').trim();
  const last = (member?.lastName ?? '').trim();
  if (!first) return member?.displayName ?? '';
  return last ? `${first} ${last[0]}.` : first;
}

export function teamName(team) {
  return (team.name ?? `${team.location ?? ''} ${team.nickname ?? ''}`).trim() || `Team ${team.id}`;
}

export function ownerLookup(league) {
  const members = new Map((league.members ?? []).map((m) => [m.id, m]));
  return (team) => shortName(members.get(team.primaryOwner ?? team.owners?.[0]));
}

export function proTeamAbbrevs(proTeams) {
  return new Map((proTeams ?? []).map((t) => [t.id, t.abbrev]));
}

/** Earliest lock-eligible kickoff in a scoring period, as an ISO string. */
export function firstKickoff(proTeams, week) {
  const times = [];
  for (const t of proTeams ?? []) {
    for (const g of t.proGamesByScoringPeriod?.[String(week)] ?? []) {
      if (g.validForLocking !== false && typeof g.date === 'number') times.push(g.date);
    }
  }
  return times.length ? new Date(Math.min(...times)).toISOString() : null;
}

/** Starting lineup for one team from an mRoster response. */
export function teamLineup(team, { season, week, abbrevs }) {
  const entries = team?.roster?.entries;
  assert(Array.isArray(entries), `mRoster: team ${team?.id} has no roster.entries`);
  const lineup = entries
    .filter((e) => !NON_STARTING_SLOTS.has(e.lineupSlotId))
    .map((e) => {
      const p = e.playerPoolEntry?.player;
      assert(p, `mRoster: team ${team.id} entry ${e.playerId} has no player`);
      assert(SLOTS[e.lineupSlotId], `mRoster: unknown lineup slot id ${e.lineupSlotId}`);
      return {
        slot: SLOTS[e.lineupSlotId].label,
        slotId: e.lineupSlotId,
        playerId: p.id,
        name: p.fullName,
        pos: POSITIONS[p.defaultPositionId] ?? String(p.defaultPositionId),
        team: abbrevs?.get(p.proTeamId) ?? null,
        projPts: weekPoints(p, season, week, STAT_SOURCE.PROJECTED),
        actualPts: weekPoints(p, season, week, STAT_SOURCE.ACTUAL),
      };
    })
    .sort((a, b) => SLOT_ORDER.indexOf(a.slotId) - SLOT_ORDER.indexOf(b.slotId))
    .map(({ slotId: _slotId, ...rest }) => rest);
  return {
    lineup,
    projTotal: round(lineup.reduce((sum, p) => sum + (p.projPts ?? 0), 0)),
    actualTotal: round(lineup.reduce((sum, p) => sum + (p.actualPts ?? 0), 0)),
  };
}

export function buildAustin(rosterResp, { season, week, austinTeamId, abbrevs, teamsById }) {
  const team = rosterResp?.teams?.find((t) => t.id === austinTeamId);
  assert(team, `mRoster: Austin's team id ${austinTeamId} not found`);
  const { lineup, projTotal, actualTotal } = teamLineup(team, { season, week, abbrevs });
  return {
    week,
    teamId: austinTeamId,
    teamName: teamName(teamsById.get(austinTeamId) ?? team),
    lineup,
    projTotal,
    actualTotal,
  };
}

export function buildLeague(rosterResp, { season, week, austinTeamId, abbrevs, teamsById, ownerOf }) {
  const teams = rosterResp?.teams;
  assert(Array.isArray(teams) && teams.length > 1, 'mRoster: teams missing');
  return {
    week,
    teams: teams
      .map((t) => {
        const meta = teamsById.get(t.id) ?? t;
        const { projTotal, actualTotal } = teamLineup(t, { season, week, abbrevs });
        return {
          teamId: t.id,
          name: teamName(meta),
          owner: ownerOf(meta),
          projTotal,
          actualTotal,
          isAustin: t.id === austinTeamId,
        };
      })
      .sort((a, b) => b.projTotal - a.projTotal),
  };
}

export function buildStandings(league, { season, week, austinTeamId, ownerOf }) {
  assert(Array.isArray(league?.teams) && league.teams.length > 1, 'mTeam: teams missing');
  const teams = league.teams.map((t) => {
    const r = t.record?.overall;
    assert(r && typeof r.wins === 'number', `mTeam: team ${t.id} has no record.overall`);
    return {
      teamId: t.id,
      name: teamName(t),
      owner: ownerOf(t),
      wins: r.wins,
      losses: r.losses,
      ties: r.ties ?? 0,
      pointsFor: round(r.pointsFor ?? 0),
      seed: t.playoffSeed ?? null,
      isAustin: t.id === austinTeamId,
    };
  });
  teams.sort(
    (a, b) =>
      (a.seed ?? 99) - (b.seed ?? 99) ||
      b.wins - a.wins ||
      a.losses - b.losses ||
      b.pointsFor - a.pointsFor,
  );
  return { season, week, teams: teams.map(({ seed: _seed, ...t }) => t) };
}

/** proTeamId -> { oppId, home } for one week. Teams on bye are absent. */
export function weekMatchups(proTeams, week) {
  const out = new Map();
  for (const t of proTeams ?? []) {
    const g = t.proGamesByScoringPeriod?.[String(week)]?.[0];
    if (!g) continue;
    const home = g.homeProTeamId === t.id;
    out.set(t.id, { oppId: home ? g.awayProTeamId : g.homeProTeamId, home });
  }
  return out;
}

/**
 * How the opponent ranks against this position, from kona_player_info's
 * positionAgainstOpponent: 1 = allows the fewest points (toughest), 32 = the most (easiest).
 */
export function opponentRank(konaResp, positionId, oppId) {
  const r = konaResp?.positionAgainstOpponent?.positionalRatings?.[positionId]?.ratingsByOpponent?.[oppId]?.rank;
  return Number.isInteger(r) && r > 0 ? r : null;
}

export function buildFreeAgents(konaResp, { season, week, abbrevs, matchups = new Map() }) {
  const players = konaResp?.players;
  assert(Array.isArray(players), 'kona_player_info: players array missing');
  const out = [];
  for (const entry of players) {
    const p = entry.player;
    if (!p) continue;
    const pos = POSITIONS[p.defaultPositionId];
    if (!pos) continue; // positions the game cannot use
    if (entry.onTeamId && entry.onTeamId !== 0) continue; // rostered, defensive
    const game = matchups.get(p.proTeamId);
    out.push({
      id: p.id,
      name: p.fullName,
      pos,
      team: abbrevs.get(p.proTeamId) ?? null,
      injury: p.injuryStatus in INJURY ? INJURY[p.injuryStatus] : (p.injuryStatus ?? null),
      ownedPct: round(p.ownership?.percentOwned ?? 0),
      projPts: weekPoints(p, season, week, STAT_SOURCE.PROJECTED) ?? 0,
      // "@ DAL" (away), "vs DAL" (home), or null on a bye / free agent with no team.
      opp: game ? `${game.home ? 'vs' : '@'} ${abbrevs.get(game.oppId) ?? '?'}` : null,
      oppRank: game ? opponentRank(konaResp, p.defaultPositionId, game.oppId) : null,
    });
  }
  assert(out.length > 0, 'kona_player_info: no usable free agents returned');
  out.sort((a, b) => b.projPts - a.projPts || b.ownedPct - a.ownedPct);
  return { season, week, players: out };
}

/** A week is final once ESPN has decided every matchup in it. */
export function weekIsFinal(scoreboard, matchupPeriodId) {
  const games = (scoreboard?.schedule ?? []).filter((m) => m.matchupPeriodId === matchupPeriodId);
  return games.length > 0 && games.every((m) => m.winner && m.winner !== 'UNDECIDED');
}

/** scoringPeriodId -> matchupPeriodId (they differ for multi-week playoff rounds). */
export function matchupPeriodFor(settings, week) {
  const periods = settings?.scheduleSettings?.matchupPeriods ?? {};
  for (const [mp, weeks] of Object.entries(periods)) if (weeks.includes(week)) return Number(mp);
  return week;
}
