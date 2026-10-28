// Finds newsworthy league events by comparing ESPN data with the last saved snapshot.
// Pure functions only: no network, no filesystem, no randomness (callers pass `random`).
import { INJURY, POSITIONS } from '../espn-maps.mjs';
import { teamName } from '../espn-transform.mjs';

/** Injury statuses bad enough for a story. */
const BAD = new Set(['OUT', 'INJURY_RESERVE', 'DOUBTFUL', 'SUSPENSION']);
/** Only players at least this widely rostered across ESPN count as stars. */
export const STAR_OWNED_PCT = 60;

const round1 = (n) => Math.round(n * 10) / 10;

function seasonPoints(player, season) {
  const line = (player.stats ?? []).find(
    (s) => s.seasonId === season && s.scoringPeriodId === 0 && s.statSourceId === 0 && s.statSplitTypeId === 0,
  );
  return typeof line?.appliedTotal === 'number' ? round1(line.appliedTotal) : 0;
}

/** First names only, never full names, in anything sent to the AI. */
export function firstNameLookup(league) {
  const members = new Map((league.members ?? []).map((m) => [m.id, m]));
  return (team) => members.get(team.primaryOwner ?? team.owners?.[0])?.firstName?.trim() || null;
}

/** Compact per-team roster snapshot, saved between runs. */
export function rosterSnapshot(rosterResp, { season, abbrevs }) {
  const teams = {};
  for (const t of rosterResp?.teams ?? []) {
    teams[t.id] = (t.roster?.entries ?? []).map((e) => {
      const p = e.playerPoolEntry?.player ?? {};
      return {
        id: p.id ?? e.playerId,
        name: p.fullName ?? `Player ${e.playerId}`,
        pos: POSITIONS[p.defaultPositionId] ?? null,
        nfl: abbrevs?.get(p.proTeamId) ?? null,
        status: p.injuryStatus ?? null,
        owned: Math.round(p.ownership?.percentOwned ?? 0),
        seasonPts: seasonPoints(p, season),
        starter: ![20, 21].includes(e.lineupSlotId),
      };
    });
  }
  return teams;
}

const playerOwners = (snapshot) => {
  const out = new Map();
  for (const [teamId, players] of Object.entries(snapshot ?? {})) for (const p of players) out.set(p.id, { teamId: Number(teamId), p });
  return out;
};

/**
 * Trades: players that moved straight from one team to another since the last snapshot,
 * confirmed by an accepted/upheld trade in ESPN's transaction log (so a drop followed by
 * someone else's waiver claim isn't reported as a trade).
 */
export function findTrades(prev, next, { transactions = [], sinceMs = 0, week }) {
  const before = playerOwners(prev);
  const moves = new Map(); // "a-b" -> { teams: [a, b], players: [{p, from, to}] }
  for (const [teamId, players] of Object.entries(next ?? {})) {
    for (const p of players) {
      const was = before.get(p.id);
      const to = Number(teamId);
      if (!was || was.teamId === to) continue;
      const pair = [was.teamId, to].sort((x, y) => x - y);
      const key = pair.join('-');
      if (!moves.has(key)) moves.set(key, { teams: pair, players: [] });
      moves.get(key).players.push({ p, from: was.teamId, to });
    }
  }
  const recent = transactions.filter((t) => (t.proposedDate ?? 0) >= sinceMs);
  const accepted = new Set(recent.filter((t) => t.type === 'TRADE_ACCEPT').map((t) => t.teamId));
  // TRADE_UPHOLD is filed by the commissioner's team, so it only says "a trade happened".
  const upheld = recent.some((t) => t.type === 'TRADE_UPHOLD');
  const bothWays = (m) => m.players.some((x) => x.to === m.teams[0]) && m.players.some((x) => x.to === m.teams[1]);
  const confirmed = [...moves.values()].filter(
    (m) => accepted.has(m.teams[0]) || accepted.has(m.teams[1]) || (upheld && bothWays(m)),
  );
  return confirmed.map((m) => ({
    kind: 'trade',
    id: `trade:${week}:${m.players.map((x) => x.p.id).sort((a, b) => a - b).join(',')}`,
    priority: 0,
    teams: m.teams,
    moves: m.players,
  }));
}

/** Star players on a fantasy roster who just went OUT / IR / doubtful / suspended. */
export function findInjuries(prev, next, { week }) {
  const before = playerOwners(prev);
  const out = [];
  for (const [teamId, players] of Object.entries(next ?? {})) {
    for (const p of players) {
      if (!BAD.has(p.status) || p.owned < STAR_OWNED_PCT) continue;
      const was = before.get(p.id);
      if (!was || BAD.has(was.p.status)) continue; // new to us, or already hurt last time
      out.push({ kind: 'injury', id: `injury:${p.id}:${p.status}:${week}`, priority: 1, teamId: Number(teamId), player: p });
    }
  }
  return out;
}

/** Latest fully decided matchup period at or before `current`, or null. */
export function latestFinalPeriod(scoreboard, current) {
  for (let mp = current; mp >= 1; mp--) {
    const games = (scoreboard?.schedule ?? []).filter((m) => m.matchupPeriodId === mp);
    if (games.length && games.every((m) => m.winner && m.winner !== 'UNDECIDED')) return mp;
  }
  return null;
}

/** Everything a weekly recap needs, as plain facts. */
export function recapFacts(scoreboard, league, period, { austinTeamId, firstNameOf }) {
  const teams = new Map(league.teams.map((t) => [t.id, t]));
  const side = (s) => {
    const t = teams.get(s.teamId);
    return { team: teamName(t), owner: firstNameOf(t), points: round1(s.totalPoints ?? 0), isAustin: s.teamId === austinTeamId };
  };
  const games = (scoreboard.schedule ?? [])
    .filter((m) => m.matchupPeriodId === period && m.home && m.away)
    .map((m) => {
      const home = side(m.home);
      const away = side(m.away);
      const [winner, loser] = m.winner === 'AWAY' ? [away, home] : [home, away];
      return { winner, loser, tie: m.winner === 'TIE', margin: round1(winner.points - loser.points) };
    });
  const scores = games.flatMap((g) => [g.winner, g.loser]).sort((a, b) => b.points - a.points);
  const byMargin = games.slice().sort((a, b) => b.margin - a.margin);
  const standings = league.teams
    .slice()
    .sort((a, b) => (a.playoffSeed ?? 99) - (b.playoffSeed ?? 99))
    .map((t, i) => ({
      rank: i + 1,
      team: teamName(t),
      record: `${t.record?.overall?.wins ?? 0}-${t.record?.overall?.losses ?? 0}`,
      isAustin: t.id === austinTeamId,
    }));
  return {
    week: period,
    games,
    topScore: scores[0] ?? null,
    lowScore: scores.at(-1) ?? null,
    biggestBlowout: byMargin[0] ?? null,
    closestGame: byMargin.at(-1) ?? null,
    austinGame: games.find((g) => g.winner.isAustin || g.loser.isAustin) ?? null,
    standings,
  };
}

export const RUMOR_IDEAS = [
  'the team is reportedly about to fire its strength and conditioning coach',
  'a wildly one-sided trade offer involving this team is supposedly being floated around the league',
  'the front office has called an emergency 6 a.m. film session',
  'the general manager has allegedly started making lineup decisions with a Magic 8-Ball',
  'the team is said to be considering a mid-season name change to shake off bad luck',
  'the team has reportedly hired a motivational speaker for the locker room',
  'sources say the team just launched a brand-new "analytics department" of questionable quality',
];

/**
 * Pick a rumor target and idea. `random` returns [0, 1). Austin is twice as likely,
 * because of course he is. Trade rumors get a partner team and players to name.
 */
export function pickRumor(snapshot, league, { austinTeamId, firstNameOf, random, week }) {
  const ids = league.teams.map((t) => t.id);
  const weighted = ids.flatMap((id) => (id === austinTeamId ? [id, id] : [id]));
  const teamId = weighted[Math.floor(random() * weighted.length)];
  const idea = RUMOR_IDEAS[Math.floor(random() * RUMOR_IDEAS.length)];
  const describe = (id) => {
    const t = league.teams.find((x) => x.id === id);
    const r = t.record?.overall ?? {};
    const players = (snapshot[id] ?? []).slice().sort((a, b) => b.seasonPts - a.seasonPts);
    return {
      team: teamName(t),
      owner: firstNameOf(t),
      record: `${r.wins ?? 0}-${r.losses ?? 0}`,
      isAustin: id === austinTeamId,
      bestPlayers: players.slice(0, 3).map((p) => `${p.name} (${p.pos}, ${p.seasonPts} pts)`),
      worstStarter: players.filter((p) => p.starter).at(-1)?.name ?? null,
    };
  };
  const rumor = { kind: 'rumor', id: `rumor:${week}:${teamId}:${RUMOR_IDEAS.indexOf(idea)}`, priority: 3, idea, team: describe(teamId) };
  if (idea.includes('trade')) {
    const others = ids.filter((id) => id !== teamId);
    rumor.partner = describe(others[Math.floor(random() * others.length)]);
  }
  return rumor;
}

/** Facts for trade / injury events, ready for the writer. */
export function eventFacts(event, league, { austinTeamId, firstNameOf }) {
  const team = (id) => {
    const t = league.teams.find((x) => x.id === id);
    const r = t?.record?.overall ?? {};
    return { team: t ? teamName(t) : `Team ${id}`, owner: t ? firstNameOf(t) : null, record: `${r.wins ?? 0}-${r.losses ?? 0}`, isAustin: id === austinTeamId };
  };
  const player = (p) => ({ name: p.name, pos: p.pos, nflTeam: p.nfl, seasonFantasyPoints: p.seasonPts, rosteredPct: p.owned });
  if (event.kind === 'trade') {
    return {
      sides: event.teams.map((id) => ({ ...team(id), receives: event.moves.filter((m) => m.to === id).map((m) => player(m.p)) })),
    };
  }
  if (event.kind === 'injury') {
    return { ...team(event.teamId), player: player(event.player), status: INJURY[event.player.status] ?? event.player.status, statusWord: event.player.status.replace(/_/g, ' ').toLowerCase() };
  }
  return {};
}
