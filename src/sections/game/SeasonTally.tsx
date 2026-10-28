import { fmtPts } from './gameData';
import type { ResultsFile } from './types';

/** Austin vs the field, season to date, with one row per scored week. */
export function SeasonTally({ results, onPick }: { results: ResultsFile | null; onPick: (week: number) => void }) {
  const weeks = results?.weeks.slice().reverse() ?? [];
  return (
    <section className="panel" aria-labelledby="tally-title" style={{ marginTop: 24 }}>
      <div className="panel__headrow">
        <h2 className="panel__title" id="tally-title">
          Season tally
        </h2>
        {results && <span className="small muted">{results.season} season</span>}
      </div>
      {weeks.length === 0 ? (
        <div className="state">No weeks scored yet. The tally starts after the first week with entries is final.</div>
      ) : (
        <>
          <div className="tally">
            <div className="tally__side tally__side--austin">
              <span className="display tally__num">{results!.tally.austin}</span>
              <span className="label">Austin wins</span>
            </div>
            <div className="tally__side tally__side--field">
              <span className="display tally__num">{results!.tally.field}</span>
              <span className="label">Field wins</span>
            </div>
          </div>
          <ul className="tally__weeks">
            {weeks.map((w) => (
              <li key={w.week}>
                <button type="button" className="tally__week" onClick={() => onPick(w.week)}>
                  <span className="tally__wk">Week {w.week}</span>
                  <span className="tally__detail">
                    Austin {fmtPts(w.austinPoints)} vs {w.topEntryName ?? 'nobody'} {fmtPts(w.topEntryPoints)}
                    <small>
                      {w.entryCount} entr{w.entryCount === 1 ? 'y' : 'ies'}
                    </small>
                  </span>
                  <span className={w.winner === 'austin' ? 'tag tag--behind' : 'tag tag--ahead'}>
                    {w.winner === 'austin' ? 'Austin' : 'Field'}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
