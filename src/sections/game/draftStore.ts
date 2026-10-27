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

/** Lineup state that starts from (already reconciled) saved picks and saves on change. */
export function useDraft(season: number, week: number, initial: () => Lineup) {
  const [lineup, setLineup] = useState<Lineup>(initial);
  useEffect(() => saveDraft(season, week, lineup), [season, week, lineup]);
  const update = useCallback((fn: (l: Lineup) => Lineup) => setLineup((l) => fn(l)), []);
  return [lineup, update] as const;
}
