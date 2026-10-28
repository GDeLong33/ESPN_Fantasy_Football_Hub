import { describe, expect, it } from 'vitest';
import { parseFrontmatter } from '../../src/lib/frontmatter.ts';
import { findInjuries, findTrades, latestFinalPeriod, pickRumor, recapFacts, RUMOR_IDEAS } from './events.mjs';
import { addToIndex, storyMarkdown, uniqueSlug } from './publish.mjs';
import { cleanStory, pickProvider, rankGeminiModels } from './writer.mjs';

const P = (id, extra = {}) => ({ id, name: `P${id}`, pos: 'WR', nfl: 'DAL', status: 'ACTIVE', owned: 90, seasonPts: 50, starter: true, ...extra });

describe('findTrades', () => {
  const prev = { 1: [P(10), P(11)], 2: [P(20)], 3: [P(30)] };
  const swapped = { 1: [P(11), P(20)], 2: [P(10)], 3: [P(30)] };

  it('reports players swapped between two teams when ESPN logged a trade', () => {
    const tx = [{ type: 'TRADE_UPHOLD', teamId: 5, proposedDate: 2000 }];
    const trades = findTrades(prev, swapped, { transactions: tx, sinceMs: 1000, week: 8 });
    expect(trades).toHaveLength(1);
    expect(trades[0]).toMatchObject({ kind: 'trade', teams: [1, 2], id: 'trade:8:10,20' });
  });

  it('ignores moves without a matching trade, or older than the last check', () => {
    expect(findTrades(prev, swapped, { transactions: [], sinceMs: 0, week: 8 })).toEqual([]);
    const old = [{ type: 'TRADE_ACCEPT', teamId: 1, proposedDate: 500 }];
    expect(findTrades(prev, swapped, { transactions: old, sinceMs: 1000, week: 8 })).toEqual([]);
  });

  it('a one-way move needs one of its teams to have accepted a trade', () => {
    const oneWay = { 1: [P(11)], 2: [P(20)], 3: [P(30), P(10)] };
    const uphold = [{ type: 'TRADE_UPHOLD', teamId: 5, proposedDate: 2000 }];
    expect(findTrades(prev, oneWay, { transactions: uphold, sinceMs: 1000, week: 8 })).toEqual([]);
    const accept = [{ type: 'TRADE_ACCEPT', teamId: 3, proposedDate: 2000 }];
    expect(findTrades(prev, oneWay, { transactions: accept, sinceMs: 1000, week: 8 })).toHaveLength(1);
  });
});

describe('findInjuries', () => {
  it('reports a rostered star who just went out', () => {
    const next = { 1: [P(10, { status: 'OUT' })] };
    const events = findInjuries({ 1: [P(10)] }, next, { week: 8 });
    expect(events).toEqual([expect.objectContaining({ kind: 'injury', id: 'injury:10:OUT:8', teamId: 1 })]);
  });

  it('skips bench-level players, players already hurt, and players new to us', () => {
    expect(findInjuries({ 1: [P(10, { owned: 20 })] }, { 1: [P(10, { owned: 20, status: 'OUT' })] }, { week: 8 })).toEqual([]);
    expect(findInjuries({ 1: [P(10, { status: 'DOUBTFUL' })] }, { 1: [P(10, { status: 'OUT' })] }, { week: 8 })).toEqual([]);
    expect(findInjuries({}, { 1: [P(10, { status: 'OUT' })] }, { week: 8 })).toEqual([]);
    expect(findInjuries({ 1: [P(10)] }, { 1: [P(10, { status: 'QUESTIONABLE' })] }, { week: 8 })).toEqual([]);
  });
});

const league = {
  teams: [
    { id: 1, name: 'Top Dogs', playoffSeed: 1, primaryOwner: 'a', record: { overall: { wins: 6, losses: 1 } } },
    { id: 9, name: 'Austin FC', playoffSeed: 2, primaryOwner: 'b', record: { overall: { wins: 1, losses: 6 } } },
  ],
};
const firstNameOf = (t) => (t.id === 9 ? 'Austin' : 'Jared');

describe('recaps', () => {
  const scoreboard = {
    schedule: [
      { matchupPeriodId: 7, winner: 'AWAY', home: { teamId: 9, totalPoints: 80.04 }, away: { teamId: 1, totalPoints: 120.5 } },
      { matchupPeriodId: 8, winner: 'UNDECIDED', home: { teamId: 9, totalPoints: 0 }, away: { teamId: 1, totalPoints: 0 } },
    ],
  };

  it('finds the latest fully decided week', () => {
    expect(latestFinalPeriod(scoreboard, 8)).toBe(7);
    expect(latestFinalPeriod({ schedule: [] }, 8)).toBeNull();
  });

  it('builds winners, margins and Austin’s game', () => {
    const f = recapFacts(scoreboard, league, 7, { austinTeamId: 9, firstNameOf });
    expect(f.games[0]).toMatchObject({ winner: { team: 'Top Dogs', points: 120.5 }, loser: { team: 'Austin FC', owner: 'Austin', isAustin: true }, margin: 40.5 });
    expect(f.austinGame).toBe(f.games[0]);
    expect(f.topScore.team).toBe('Top Dogs');
    expect(f.standings.map((s) => s.record)).toEqual(['6-1', '1-6']);
  });
});

describe('pickRumor', () => {
  const snapshot = { 1: [P(10, { seasonPts: 100 })], 9: [P(90, { seasonPts: 10 })] };

  it('picks a team and idea from the random source, with a partner for trade rumors', () => {
    const tradeIdx = RUMOR_IDEAS.findIndex((i) => i.includes('trade'));
    const rolls = [0.99, (tradeIdx + 0.5) / RUMOR_IDEAS.length, 0];
    const r = pickRumor(snapshot, league, { austinTeamId: 9, firstNameOf, random: () => rolls.shift(), week: 8 });
    expect(r.team).toMatchObject({ team: 'Austin FC', owner: 'Austin', isAustin: true });
    expect(r.idea).toContain('trade');
    expect(r.partner.team).toBe('Top Dogs');
  });
});

describe('writer helpers', () => {
  const body = 'LET ME TELL YOU SOMETHING. '.repeat(15);

  it('cleanStory trims, unquotes and escapes HTML', () => {
    const s = cleanStory(JSON.stringify({ title: ' "Big   Trade" ', summary: 'A trade happened, folks.', body: body + '<script>x</script>' }));
    expect(s.title).toBe('Big Trade');
    expect(s.body).toContain('&lt;script>');
    expect(s.body).not.toContain('<script>');
  });

  it('cleanStory rejects stories that are too short', () => {
    expect(() => cleanStory({ title: 'Hi there', summary: 'Ten chars!!', body: 'short' })).toThrow(/bad body length/);
  });

  it('picks the provider from NEWS_AI, then whichever key exists', () => {
    expect(pickProvider({ GEMINI_API_KEY: 'g' })).toBe('gemini');
    expect(pickProvider({ GEMINI_API_KEY: 'g', ANTHROPIC_API_KEY: 'a' })).toBe('claude');
    expect(pickProvider({ GEMINI_API_KEY: 'g', ANTHROPIC_API_KEY: 'a', NEWS_AI: 'Gemini' })).toBe('gemini');
    expect(pickProvider({})).toBeNull();
  });

  it('ranks Gemini Flash models: stable, then full Flash, then newest', () => {
    const names = ['gemini-2.5-flash', 'gemini-3.1-flash-lite', 'gemini-3.1-flash-preview', 'gemini-3.1-pro', 'gemini-3.0-flash', 'gemini-3.1-flash-image'];
    const ranked = rankGeminiModels(names.map((n) => ({ name: `models/${n}`, supportedActions: ['generateContent'] })));
    expect(ranked).toEqual(['gemini-3.0-flash', 'gemini-2.5-flash', 'gemini-3.1-flash-lite', 'gemini-3.1-flash-preview']);
  });
});

describe('publishing', () => {
  it('writes frontmatter the site can read back', () => {
    const md = storyMarkdown(
      { title: 'He said "no"', summary: 'Two lines\nof summary', body: 'Body text.' },
      { tag: 'Rumor mill', date: '2026-10-28', satire: true },
    );
    const { meta, body } = parseFrontmatter(md);
    expect(meta).toEqual({ title: "He said 'no'", tag: 'Rumor mill', summary: 'Two lines of summary', date: '2026-10-28', author: 'Stephen A. DeLong', satire: 'true' });
    expect(body.trim()).toBe('Body text.');
  });

  it('makes unique slugs and puts new stories first', () => {
    const taken = new Set(['2026-10-28-trade-big-deal']);
    expect(uniqueSlug('2026-10-28', 'trade', 'Big Deal!', taken)).toBe('2026-10-28-trade-big-deal-2');
    const idx = addToIndex({ stories: [{ slug: 'old' }] }, 'new', 'now');
    expect(idx).toEqual({ updatedAt: 'now', stories: [{ slug: 'new' }, { slug: 'old' }] });
  });
});

describe('retries', () => {
  it('retries overloads, then gives up; never retries a bad request', async () => {
    const { withRetries, isTransient } = await import('./writer.mjs');
    let calls = 0;
    const busyTwice = () => (++calls <= 2 ? Promise.reject(Object.assign(new Error('high demand'), { status: 503 })) : Promise.resolve('ok'));
    await expect(withRetries(busyTwice, { waits: [0, 0, 0], label: 't' })).resolves.toBe('ok');
    expect(calls).toBe(3);

    calls = 0;
    const alwaysBusy = () => (calls++, Promise.reject(Object.assign(new Error('busy'), { status: 503 })));
    await expect(withRetries(alwaysBusy, { waits: [0, 0], label: 't' })).rejects.toMatchObject({ status: 503 });
    expect(calls).toBe(3);

    calls = 0;
    const badKey = () => (calls++, Promise.reject(Object.assign(new Error('bad key'), { status: 401 })));
    await expect(withRetries(badKey, { waits: [0, 0], label: 't' })).rejects.toMatchObject({ status: 401 });
    expect(calls).toBe(1);

    expect(isTransient({ status: 503 })).toBe(true);
    expect(isTransient({ status: 400 })).toBe(false);
  });
});
