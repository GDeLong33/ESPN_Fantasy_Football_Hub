// Runs the real migration in an in-process Postgres (PGlite) and checks the rules
// from a visitor's point of view (the `anon` role), the way Supabase enforces them.
import { readFileSync, readdirSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

// Every migration, in filename (date) order, the way they're pasted into Supabase.
const dir = new URL('./migrations/', import.meta.url);
const migrations = readdirSync(dir)
  .filter((f) => f.endsWith('.sql'))
  .sort()
  .map((f) => readFileSync(new URL(f, dir), 'utf8'));

const SLOTS = [
  { slot: 'QB', accepts: ['QB'] },
  { slot: 'RB', accepts: ['RB'] },
  { slot: 'FLEX', accepts: ['RB', 'WR', 'TE'] },
];
const POOL = [
  { id: 1, pos: 'QB', name: 'Q One', team: 'CLE', projPts: 13.04 },
  { id: 2, pos: 'RB', name: 'R Two', team: 'PHI', projPts: 8.8 },
  { id: 3, pos: 'RB', name: 'R Three', team: 'LAC', projPts: 7.9 },
  { id: 4, pos: 'WR', name: 'W Four', team: 'JAX', projPts: 10.8 },
  { id: 5, pos: 'QB', name: 'Q Five', team: 'TEN', projPts: 10.9 },
];
const LINEUP = [
  { slot: 'QB', playerId: 1 },
  { slot: 'RB', playerId: 2 },
  { slot: 'FLEX', playerId: 4 },
];

let db;

async function asAnon(sql, params) {
  await db.exec('set role anon');
  try {
    return await db.query(sql, params);
  } finally {
    await db.exec('reset role');
  }
}

const enter = (name, lineup = LINEUP, week = 8, team = null) =>
  asAnon('insert into entries (season, week, name, team_name, lineup) values (2026, $1, $2, $3, $4)', [
    week,
    name,
    team,
    JSON.stringify(lineup),
  ]);

async function syncWeek(week, lockTime, pool = POOL) {
  return db.query('select sync_week(2026, $1, $2, $3, $4) as status', [
    week,
    lockTime,
    JSON.stringify(SLOTS),
    JSON.stringify(pool),
  ]);
}

const future = () => new Date(Date.now() + 86_400_000).toISOString();
const past = () => new Date(Date.now() - 60_000).toISOString();

beforeAll(async () => {
  db = new PGlite();
  // Roles Supabase provides out of the box.
  await db.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create role service_role nologin bypassrls;
    grant usage on schema public to anon, authenticated, service_role;
  `);
  for (const sql of migrations) await db.exec(sql);
  for (const sql of migrations) await db.exec(sql); // must be safe to run twice
});

beforeEach(async () => {
  await db.exec('truncate weekly_results, entries, week_pool, weeks cascade');
  await syncWeek(8, future());
});

describe('submitting entries', () => {
  it('accepts a valid lineup and normalises the name', async () => {
    await enter('  Gavin   D ', [...LINEUP.slice(0, 2), { slot: 'FLEX', playerId: 4, extra: 'x' }], 8, '  ');
    const { rows } = await db.query('select name, name_key, team_name, lineup from entries');
    expect(rows).toEqual([{ name: 'Gavin D', name_key: 'gavin d', team_name: null, lineup: LINEUP }]);
  });

  it('allows one entry per name per week, ignoring case and spacing', async () => {
    await enter('Gavin');
    await expect(enter(' GAVIN ')).rejects.toMatchObject({ code: '23505' });
  });

  it('rejects entries after lock', async () => {
    await db.query('update weeks set lock_time = $1', [past()]);
    await expect(enter('Late')).rejects.toThrow('Lineups are locked for week 8');
  });

  it('rejects weeks that are not open', async () => {
    await expect(enter('Gavin', LINEUP, 9)).rejects.toThrow('Week 9 is not open for entries yet.');
  });

  it.each([
    ['wrong length', LINEUP.slice(0, 2), 'Lineup needs exactly 3 players.'],
    ['QB in FLEX', [LINEUP[0], LINEUP[1], { slot: 'FLEX', playerId: 5 }], "FLEX: a QB can't play there."],
    ['duplicate player', [LINEUP[0], LINEUP[1], { slot: 'FLEX', playerId: 2 }], 'FLEX: a player can only be used once.'],
    ['not a free agent', [{ slot: 'QB', playerId: 999 }, LINEUP[1], LINEUP[2]], 'QB: that player is not on the waiver wire.'],
    ['slots out of order', [LINEUP[1], LINEUP[0], LINEUP[2]], 'Pick 1 should be the QB slot.'],
  ])('rejects %s', async (_label, lineup, message) => {
    await expect(enter('Gavin', lineup)).rejects.toThrow(message);
  });

  it('rejects a one-letter name', async () => {
    await expect(enter('G')).rejects.toThrow('Your name must be 2 to 40 characters.');
  });
});

describe('visibility and permissions', () => {
  it('hides entries until the week locks', async () => {
    await enter('Gavin');
    expect((await asAnon('select * from entries')).rows).toHaveLength(0);
    await db.query('update weeks set lock_time = $1', [past()]);
    expect((await asAnon('select name from entries')).rows).toEqual([{ name: 'Gavin' }]);
  });

  it('never lets visitors edit or delete entries', async () => {
    await enter('Gavin');
    await db.query('update weeks set lock_time = $1', [past()]);
    await expect(asAnon("update entries set name = 'Austin'")).rejects.toThrow(/permission denied/);
    await expect(asAnon('delete from entries')).rejects.toThrow(/permission denied/);
  });

  it('keeps the pool and the sync function away from visitors', async () => {
    await expect(asAnon('select * from week_pool')).rejects.toThrow(/permission denied/);
    await expect(asAnon("select sync_week(2026, 8, now(), '[]', '[]')")).rejects.toThrow(/permission denied/);
    await expect(asAnon("insert into weekly_results (season, week, austin_points, winner) values (2026, 8, 1, 'field')")).rejects.toThrow(
      /permission denied/,
    );
  });
});

describe('sync_week', () => {
  it('replaces the pool before lock and freezes it after', async () => {
    expect((await db.query('select count(*)::int as n from week_pool')).rows[0].n).toBe(POOL.length);
    await db.query('update weeks set lock_time = $1', [past()]);
    const { rows } = await syncWeek(8, future());
    expect(rows[0].status).toBe('frozen');
    expect((await db.query('select lock_time < now() as locked from weeks')).rows[0].locked).toBe(true);
  });
});

describe('entry_board', () => {
  const board = () => asAnon('select name, proj_total::float as proj, lineup from entry_board(2026, 8)');

  it('shows names and projected totals before lock, but not lineups', async () => {
    await enter('Low', [LINEUP[0], { slot: 'RB', playerId: 3 }, LINEUP[2]]);
    await enter('High');
    const { rows } = await board();
    expect(rows).toEqual([
      { name: 'High', proj: 32.64, lineup: null },
      { name: 'Low', proj: 31.74, lineup: null },
    ]);
  });

  it('reveals lineups with player details once the week locks', async () => {
    await enter('Gavin');
    await db.query('update weeks set lock_time = $1', [past()]);
    const { rows } = await board();
    expect(rows[0].lineup[0]).toEqual({ slot: 'QB', playerId: 1, name: 'Q One', pos: 'QB', team: 'CLE', proj: 13.04 });
  });

  it('keeps projections for players claimed after an entry, but blocks new picks of them', async () => {
    await enter('Early');
    await syncWeek(8, future(), POOL.filter((p) => p.id !== 4)); // WR 4 got claimed
    expect((await board()).rows[0].proj).toBe(32.64);
    await expect(enter('Late')).rejects.toThrow('FLEX: that player is not on the waiver wire.');
  });
});
