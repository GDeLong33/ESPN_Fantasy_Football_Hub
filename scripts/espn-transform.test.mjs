import { describe, expect, it } from 'vitest';
import {
  ShapeError,
  buildFreeAgents,
  buildStandings,
  firstKickoff,
  shortName,
  startingSlots,
  teamLineup,
  weekIsFinal,
  weekMatchups,
} from './espn-transform.mjs';

const season = 2026;
const week = 8;
const abbrevs = new Map([
  [2, 'BUF'],
  [7, 'DEN'],
]);

const stat = (source, pts, w = week) => ({
  seasonId: season,
  scoringPeriodId: w,
  statSourceId: source,
  statSplitTypeId: 1,
  appliedTotal: pts,
});
const player = (id, pos, stats, extra = {}) => ({ id, fullName: `P${id}`, defaultPositionId: pos, proTeamId: 2, stats, ...extra });

describe('startingSlots', () => {
  it('expands slot counts in lineup order and skips bench/IR', () => {
    const slots = startingSlots({
      rosterSettings: { lineupSlotCounts: { 0: 1, 2: 2, 4: 2, 6: 1, 16: 1, 17: 1, 20: 7, 21: 1, 23: 1 } },
    });
    expect(slots.map((s) => s.label)).toEqual(['QB', 'RB', 'RB', 'WR', 'WR', 'TE', 'FLEX', 'D/ST', 'K']);
    expect(slots.find((s) => s.label === 'FLEX').accepts).toEqual(['RB', 'WR', 'TE']);
  });

  it('fails loudly on a slot it does not understand', () => {
    expect(() => startingSlots({ rosterSettings: { lineupSlotCounts: { 0: 1, 99: 1 } } })).toThrow(ShapeError);
  });
});

describe('teamLineup', () => {
  it('sums starters only, using week projections and actuals', () => {
    const team = {
      id: 9,
      roster: {
        entries: [
          { lineupSlotId: 0, playerPoolEntry: { player: player(1, 1, [stat(1, 14.768), stat(0, 20.1)]) } },
          { lineupSlotId: 23, playerPoolEntry: { player: player(2, 2, [stat(1, 10), stat(1, 99, 7)]) } },
          { lineupSlotId: 20, playerPoolEntry: { player: player(3, 3, [stat(1, 50), stat(0, 50)]) } },
        ],
      },
    };
    const r = teamLineup(team, { season, week, abbrevs });
    expect(r.lineup.map((p) => p.slot)).toEqual(['QB', 'FLEX']);
    expect(r.lineup[0]).toMatchObject({ playerId: 1, pos: 'QB', team: 'BUF', projPts: 14.77, actualPts: 20.1 });
    expect(r.lineup[1].actualPts).toBeNull();
    expect(r.projTotal).toBe(24.77);
    expect(r.actualTotal).toBe(20.1);
  });
});

describe('buildFreeAgents', () => {
  it('keeps usable positions, maps injuries, adds matchups, and sorts by projection', () => {
    const fa = buildFreeAgents(
      {
        players: [
          { onTeamId: 0, player: player(1, 3, [stat(1, 5)], { injuryStatus: 'QUESTIONABLE', ownership: { percentOwned: 12.345 } }) },
          { onTeamId: 0, player: player(2, 16, [stat(1, 9)], { proTeamId: 7, injuryStatus: 'ACTIVE' }) },
          { onTeamId: 0, player: player(3, 9, [stat(1, 30)]) }, // not a fantasy position
          { onTeamId: 4, player: player(4, 2, [stat(1, 40)]) }, // rostered
        ],
        positionAgainstOpponent: {
          positionalRatings: {
            3: { ratingsByOpponent: { 7: { average: 38.9, rank: 30 } } },
            16: { ratingsByOpponent: { 2: { average: -0.3, rank: 1 } } },
          },
        },
      },
      {
        season,
        week,
        abbrevs,
        // BUF (2) away at DEN (7)
        matchups: weekMatchups([{ id: 2, proGamesByScoringPeriod: { 8: [{ homeProTeamId: 7, awayProTeamId: 2 }] } }, { id: 7, proGamesByScoringPeriod: { 8: [{ homeProTeamId: 7, awayProTeamId: 2 }] } }], 8),
      },
    );
    expect(fa.players).toEqual([
      { id: 2, name: 'P2', pos: 'D/ST', team: 'DEN', injury: null, ownedPct: 0, projPts: 9, opp: 'vs BUF', oppRank: 1 },
      { id: 1, name: 'P1', pos: 'WR', team: 'BUF', injury: 'Q', ownedPct: 12.35, projPts: 5, opp: '@ DEN', oppRank: 30 },
    ]);
  });
});

describe('buildStandings', () => {
  it('orders by playoff seed and flags Austin', () => {
    const rec = (wins, losses) => ({ overall: { wins, losses, ties: 0, pointsFor: 100 } });
    const s = buildStandings(
      {
        teams: [
          { id: 9, name: 'Austin FC', playoffSeed: 2, record: rec(1, 6) },
          { id: 1, name: 'Top', playoffSeed: 1, record: rec(6, 1) },
        ],
      },
      { season, week, austinTeamId: 9, ownerOf: () => '' },
    );
    expect(s.teams.map((t) => [t.name, t.isAustin])).toEqual([
      ['Top', false],
      ['Austin FC', true],
    ]);
  });
});

describe('misc', () => {
  it('shortName keeps only the last initial', () => {
    expect(shortName({ firstName: 'Austin', lastName: 'Goulding' })).toBe('Austin G.');
    expect(shortName({ displayName: 'espnfan1' })).toBe('espnfan1');
  });

  it('firstKickoff picks the earliest lock-eligible game of the week', () => {
    const t = (d, valid = true) => ({ date: d, validForLocking: valid });
    const iso = firstKickoff(
      [{ proGamesByScoringPeriod: { 8: [t(3000), t(1000, false)] } }, { proGamesByScoringPeriod: { 8: [t(2000)] } }],
      8,
    );
    expect(iso).toBe(new Date(2000).toISOString());
  });

  it('weekIsFinal needs every matchup decided', () => {
    const sb = (w) => ({ schedule: [{ matchupPeriodId: 8, winner: 'HOME' }, { matchupPeriodId: 8, winner: w }] });
    expect(weekIsFinal(sb('AWAY'), 8)).toBe(true);
    expect(weekIsFinal(sb('UNDECIDED'), 8)).toBe(false);
    expect(weekIsFinal(sb('AWAY'), 9)).toBe(false);
  });
});

describe('weekMatchups', () => {
  it('leaves teams on bye out', () => {
    const m = weekMatchups([{ id: 2, proGamesByScoringPeriod: { 9: [] } }], 8);
    expect(m.has(2)).toBe(false);
  });
});
