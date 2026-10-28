import { useState } from 'react';
import { DataState } from '../../components/DataState';
import { formatUpdated, loadData } from '../../lib/data';
import { useAsync } from '../../lib/useAsync';
import { LEAGUE_NAME } from '../../site';
import { loadEntered } from './draftStore';
import { fmtPts } from './gameData';
import { LeagueBars, rankAmong, type BarItem } from './LeagueBars';
import type { LeagueFile, WeekResultsFile } from './types';

async function loadWeek(week: number) {
  const [results, league] = await Promise.all([
    loadData<WeekResultsFile>(`weeks/${week}/results.json`),
    loadData<LeagueFile>(`weeks/${week}/league.json`),
  ]);
  if (!results.data) throw new Error(`Week ${week} hasn't been scored yet`);
  return { results: results.data, league: league.data };
}

/** A finished, scored week: the verdict, the leaderboard and the league comparison. */
export function FinalWeek({ season, week }: { season: number; week: number }) {
  const state = useAsync(() => loadWeek(week), [week]);
  return (
    <DataState state={state} loading={<div className="panel panel__body">Loading week {week}…</div>}>
      {({ results, league }) => <FinalWeekBody season={season} results={results} league={league} />}
    </DataState>
  );
}

const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

function FinalWeekBody({ season, results, league }: { season: number; results: WeekResultsFile; league: LeagueFile | null }) {
  const { austin, entries, week } = results;
  const mine = loadEntered(season, week);
  const top = entries[0];
  const austinWon = results.winner === 'austin';

  // Austin's row slots into the leaderboard by score (ahead of entries he tied).
  const rows: ({ kind: 'austin' } | { kind: 'entry'; entry: WeekResultsFile['entries'][number] })[] = [];
  let austinPlaced = false;
  for (const e of entries) {
    if (!austinPlaced && austin.points >= e.points) {
      rows.push({ kind: 'austin' });
      austinPlaced = true;
    }
    rows.push({ kind: 'entry', entry: e });
  }
  if (!austinPlaced) rows.push({ kind: 'austin' });

  return (
    <>
      <section className={`panel verdict ${austinWon ? 'verdict--austin' : 'verdict--field'}`} aria-labelledby="verdict-title">
        <div className="label">Week {week} · Final</div>
        <h2 className="display verdict__title" id="verdict-title">
          {austinWon ? 'Austin wins the week' : 'The field beats Austin'}
        </h2>
        <p className="verdict__line">
          Austin scored <strong>{fmtPts(austin.points)}</strong>.{' '}
          {top ? (
            <>
              Best entry: <strong>{top.name}</strong> with <strong>{fmtPts(top.points)}</strong>.{' '}
              {entries.filter((e) => e.beatAustin).length} of {entries.length} beat him.
            </>
          ) : null}
        </p>
      </section>

      <section className="panel" aria-labelledby="final-board-title" style={{ marginTop: 24 }}>
        <div className="panel__headrow">
          <h2 className="panel__title" id="final-board-title">
            Leaderboard
          </h2>
          <span className="small muted">Actual points · tap a row for the lineup</span>
        </div>
        <ol className="board">
          {rows.map((row) => {
            if (row.kind === 'austin') {
              return (
                <li key="austin" className="board__row is-austin">
                  <details>
                    <summary className="board__summary">
                      <span className="board__rank" aria-hidden="true">
                        A
                      </span>
                      <span className="board__name">
                        Austin
                        <small>{austin.teamName}</small>
                      </span>
                      <span className="board__pts">{fmtPts(austin.points)}</span>
                      <span className="tag tag--behind">The score to beat</span>
                    </summary>
                    <ul className="board__lineup">
                      {austin.lineup.map((p) => (
                        <li key={`${p.slot}-${p.playerId}`}>
                          <span className="lineup__pos">{p.slot}</span>
                          <span className="lineup__name">
                            {p.name}
                            <small>
                              {p.pos} · {p.team ?? 'FA'}
                            </small>
                          </span>
                          <span className="lineup__pts">{fmtPts(p.actualPts ?? 0)}</span>
                        </li>
                      ))}
                    </ul>
                  </details>
                </li>
              );
            }
            const e = row.entry;
            const isMine = !!mine && sameName(mine.name, e.name);
            return (
              <li key={e.entryId} className={isMine ? 'board__row is-mine' : 'board__row'}>
                <details>
                  <summary className="board__summary">
                    <span className="board__rank">{entries.indexOf(e) + 1}</span>
                    <span className="board__name">
                      {e.name}
                      {isMine && <span className="board__you">You</span>}
                      {e.teamName && <small>{e.teamName}</small>}
                    </span>
                    <span className="board__pts">{fmtPts(e.points)}</span>
                    <span className={e.beatAustin ? 'tag tag--ahead' : 'tag tag--behind'}>
                      {e.beatAustin ? 'Beat Austin' : 'Fell short'}
                    </span>
                  </summary>
                  <ul className="board__lineup">
                    {e.lineup.map((p) => (
                      <li key={`${p.slot}-${p.playerId}`}>
                        <span className="lineup__pos">{p.slot}</span>
                        <span className="lineup__name">
                          {p.name}
                          <small>
                            {p.pos ?? ''} · {p.team ?? 'FA'}
                          </small>
                        </span>
                        <span className="lineup__pts">{fmtPts(p.points)}</span>
                      </li>
                    ))}
                  </ul>
                </details>
              </li>
            );
          })}
        </ol>
      </section>

      {league && entries.length > 0 && <Compare results={results} league={league} defaultName={mine?.name} />}

      <p className="small muted" style={{ marginTop: 16 }}>
        Scored {formatUpdated(results.updatedAt)}. Austin wins ties.
      </p>
    </>
  );
}

function Compare({ results, league, defaultName }: { results: WeekResultsFile; league: LeagueFile; defaultName?: string }) {
  const { entries, week } = results;
  const initial = entries.find((e) => defaultName && sameName(defaultName, e.name)) ?? entries[0];
  const [entryId, setEntryId] = useState(initial.entryId);
  const entry = entries.find((e) => e.entryId === entryId) ?? entries[0];
  const leagueTotals = league.teams.map((t) => t.actualTotal);
  const rank = rankAmong(entry.points, leagueTotals);

  const bars: BarItem[] = [
    ...league.teams.map((t) => ({
      id: `team-${t.teamId}`,
      label: t.isAustin ? `${t.name} (Austin)` : t.name,
      value: t.actualTotal,
      kind: t.isAustin ? ('austin' as const) : ('other' as const),
    })),
    { id: entry.entryId, label: entry.name, note: entry.teamName ?? undefined, value: entry.points, kind: 'you' },
  ];

  return (
    <section className="panel panel__body" aria-labelledby="compare-title" style={{ marginTop: 24 }}>
      <div className="rank-head">
        <h2 className="panel__title" id="compare-title">
          Compare an entry
        </h2>
        <span className="rank-line">
          {entry.name} would have finished {rank} of {leagueTotals.length + 1}
        </span>
      </div>
      <p className="small muted" style={{ margin: '4px 0 12px' }}>
        Actual points for week {week}: every {LEAGUE_NAME} team, plus the entry you pick.
      </p>
      <label className="field compare-pick">
        <span>Entry</span>
        <select value={entry.entryId} onChange={(e) => setEntryId(e.target.value)}>
          {entries.map((e) => (
            <option key={e.entryId} value={e.entryId}>
              {e.name} ({fmtPts(e.points)})
            </option>
          ))}
        </select>
      </label>
      <LeagueBars items={bars} caption={`Actual points, week ${week}`} youLabel="Selected entry" />
    </section>
  );
}
