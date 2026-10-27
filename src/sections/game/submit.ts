import type { SupabaseClient } from '@supabase/supabase-js';
import type { Pick } from './lineup';

export type EntryInput = { season: number; week: number; name: string; teamName: string; lineup: Pick[] };

type DbError = { code?: string; message?: string } | null;

/** Turn a database or network error into something a visitor can act on. */
export function friendlyError(err: DbError | Error, name: string): string {
  const e = err as { code?: string; message?: string; name?: string };
  if (e?.code === '23505') {
    return `Someone already entered as "${name.trim()}" this week. One entry per name. If that wasn't you, add a last initial.`;
  }
  // Messages raised by validate_entry() are written for visitors.
  if (e?.code === 'P0001' && e.message) return e.message;
  if (e?.name === 'TypeError' || /fetch|network/i.test(e?.message ?? '')) {
    return "Couldn't reach the server. Check your connection and try again.";
  }
  return 'Something went wrong saving your lineup. Please try again.';
}

export async function submitEntry(db: SupabaseClient, input: EntryInput): Promise<string | null> {
  try {
    const { error } = await db.from('entries').insert({
      season: input.season,
      week: input.week,
      name: input.name,
      team_name: input.teamName.trim() || null,
      lineup: input.lineup,
    });
    return error ? friendlyError(error, input.name) : null;
  } catch (err) {
    return friendlyError(err as Error, input.name);
  }
}

/** Client-side mirror of the database name rules. */
export function nameProblem(name: string): string | null {
  const n = name.trim().replace(/\s+/g, ' ');
  if (n.length < 2 || n.length > 40) return 'Enter a name between 2 and 40 characters.';
  return null;
}
