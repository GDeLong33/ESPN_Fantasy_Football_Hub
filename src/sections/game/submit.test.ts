import { describe, expect, it } from 'vitest';
import { friendlyError, nameProblem } from './submit';

describe('friendlyError', () => {
  it('explains a duplicate name', () => {
    expect(friendlyError({ code: '23505', message: 'duplicate key' }, ' Gavin ')).toMatch(
      /already entered as "Gavin" this week/,
    );
  });

  it('passes through validation messages from the database', () => {
    expect(friendlyError({ code: 'P0001', message: 'Lineups are locked for week 8. Kickoff has passed.' }, 'x')).toBe(
      'Lineups are locked for week 8. Kickoff has passed.',
    );
  });

  it('recognises network failures and hides other internals', () => {
    expect(friendlyError(new TypeError('Failed to fetch'), 'x')).toMatch(/Couldn't reach the server/);
    expect(friendlyError({ code: '42501', message: 'permission denied for table entries' }, 'x')).toBe(
      'Something went wrong saving your lineup. Please try again.',
    );
  });
});

describe('nameProblem', () => {
  it('requires 2 to 40 characters after trimming', () => {
    expect(nameProblem(' G ')).not.toBeNull();
    expect(nameProblem('Gavin D')).toBeNull();
    expect(nameProblem('x'.repeat(41))).not.toBeNull();
  });
});
