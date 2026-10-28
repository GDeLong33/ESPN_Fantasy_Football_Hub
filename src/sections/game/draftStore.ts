import { useCallback, useEffect, useState } from 'react';
import type { Lineup } from './lineup';

// The in-progress lineup lives in this browser only, keyed by season and week,
// so it survives a refresh and the trip to the lock-in page.

const key = (season: number, week: number) => `cyba:draft:${season}:${week}`;

export function loadDraft(season: number, week: number): unknown {
  try {
    const raw = localStorage.getItem(key(season, week));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveDraft(season: number, week: number, lineup: Lineup) {
  try {
    localStorage.setItem(key(season, week), JSON.stringify(lineup));
  } catch {
    // Storage blocked: the lineup still works for this page view.
  }
}

/** What this browser submitted this week. `lineup` is missing on entries saved before it was added. */
export type EnteredEntry = { name: string; teamName: string | null; lineup?: Lineup };

/** Remembers, in this browser only, that an entry was submitted this week. */
const enteredKey = (season: number, week: number) => `cyba:entered:${season}:${week}`;

export function loadEntered(season: number, week: number): EnteredEntry | null {
  try {
    const raw = localStorage.getItem(enteredKey(season, week));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveEntered(season: number, week: number, entry: EnteredEntry) {
  try {
    localStorage.setItem(enteredKey(season, week), JSON.stringify(entry));
  } catch {
    // Not critical: only used to show "you're entered" on return visits.
  }
}

/** Lineup state that starts from (already reconciled) saved picks and saves on change. */
export function useDraft(season: number, week: number, initial: () => Lineup) {
  const [lineup, setLineup] = useState<Lineup>(initial);
  useEffect(() => saveDraft(season, week, lineup), [season, week, lineup]);
  const update = useCallback((fn: (l: Lineup) => Lineup) => setLineup((l) => fn(l)), []);
  return [lineup, update] as const;
}
