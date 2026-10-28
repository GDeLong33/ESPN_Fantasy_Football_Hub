import { describe, expect, it } from 'vitest';
import { buildSeasonResults, decideWeek, scoreEntries } from './scoring.mjs';

const players = new Map([
  [1, { name: 'QB One', pos: 'QB', team: 'CLE', points: 18.224 }],
  [2, { name: 'RB Two', pos: 'RB', team: 'PHI', points: 7.5 }],
  [3, { name: 'K Bye', pos: 'K', team: 'BUF', points: null }], // bye week: no stat line
]);
const entry = (id, name, lineup, created_at = '2026-10-28T00:00:00Z') => ({ id, name, team_name: null, created_at, lineup });

describe('scoreEntries', () => {
  it('sums actual points, scoring missing players as 0', () => {
    const [s] = scoreEntries([entry('a', 'Gavin', [{ slot: 'QB', playerId: 1 }, { slot: 'K', playerId: 3 }, { slot: 'RB', playerId: 99 }])], players);
    expect(s.points).toBe(18.22);
    expect(s.lineup.map((p) => p.points)).toEqual([18.22, 0, 0]);
    expect(s.lineup[2].name).toBe('Player 99');
  });

  it('ranks best first, earlier entry first on a tie', () => {
    const scored = scoreEntries(
      [
        entry('late', 'Late', [{ slot: 'RB', playerId: 2 }], '2026-10-29T00:00:00Z'),
        entry('big', 'Big', [{ slot: 'QB', playerId: 1 }]),
        entry('early', 'Early', [{ slot: 'RB', playerId: 2 }], '2026-10-28T00:00:00Z'),
      ],
      players,
    );
    expect(scored.map((s) => s.entryId)).toEqual(['big', 'early', 'late']);
  });
});

describe('decideWeek', () => {
  const scored = [{ entryId: 'a', name: 'Gavin', points: 100 }];

  it('Austin wins ties and better scores; otherwise the field wins', () => {
    expect(decideWeek(100, scored).winner).toBe('austin');
    expect(decideWeek(100.01, scored).winner).toBe('austin');
    expect(decideWeek(99.99, scored)).toEqual({ winner: 'field', topEntryId: 'a', topEntryName: 'Gavin', topEntryPoints: 100 });
  });

  it('gives no result when nobody entered', () => {
    expect(decideWeek(80, [])).toBeNull();
  });
});

describe('buildSeasonResults', () => {
  it('tallies Austin vs the field by week', () => {
    const rows = [
      { season: 2026, week: 9, austin_points: '90', top_entry_id: 'b', winner: 'field', entry_scores: [{ entryId: 'b', name: 'Sam', points: 101 }, { entryId: 'c', name: 'Jo', points: 70 }] },
      { season: 2026, week: 8, austin_points: '95.08', top_entry_id: 'a', winner: 'austin', entry_scores: [{ entryId: 'a', name: 'Gavin', points: 84.7 }] },
      { season: 2025, week: 1, austin_points: '1', top_entry_id: null, winner: 'field', entry_scores: [] },
    ];
    const r = buildSeasonResults(rows, 2026);
    expect(r.tally).toEqual({ austin: 1, field: 1 });
    expect(r.weeks).toEqual([
      { week: 8, austinPoints: 95.08, topEntryName: 'Gavin', topEntryPoints: 84.7, entryCount: 1, winner: 'austin' },
      { week: 9, austinPoints: 90, topEntryName: 'Sam', topEntryPoints: 101, entryCount: 2, winner: 'field' },
    ]);
  });
});
