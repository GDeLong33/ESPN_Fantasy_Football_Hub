import { Link } from 'react-router-dom';
import { DataState } from '../../components/DataState';
import { formatUpdated } from '../../lib/data';
import { supabase } from '../../lib/supabase';
import { useAsync } from '../../lib/useAsync';
import { LEAGUE_NAME } from '../../site';
import { loadBoard, type BoardEntry } from './board';
import { loadDraft, loadEntered, type EnteredEntry } from './draftStore';
import { fmtPts, loadGameData, oppLabel, type GameData } from './gameData';
import { LeagueBars, rankAmong, type BarItem } from './LeagueBars';
import { lineupTotal, reconcile } from './lineup';
import { formatLock } from './PromoCard';
import { formatCountdown, useNow } from './useNow';

// This week's board: every locked-in entry and every league team, by projection.
// Phase 5 adds final scores, past weeks and the season tally.
export function ResultsPage() {
  const game = useAsync(loadGameData, []);
  return (
    <DataState state={game} loading={<div className="container page-intro">Loading the board…</div>}>
      {(data) => <WeekBoard data={data} />}
    </DataState>
  );
}

const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

function WeekBoard({ data }: { data: GameData }) {
  const { meta, austin } = data;
  const board = useAsync(() => loadBoard(meta.season, meta.week), [meta.season, meta.week]);
  const now = useNow();
  const lockAt = meta.lockTime ? Date.parse(meta.lockTime) : null;
  const locked = lockAt != null && now >= lockAt;
  const mine = loadEntered(meta.season, meta.week);

  return (
    <div className="container">
      <div className="page-intro board-intro">
        <div className="kicker">
          {LEAGUE_NAME} · Week {meta.week} · Projected
        </div>
        <h1 className="display page-title">The board</h1>
        <p>
          Every waiver-wire lineup locked in so far, against Austin and the rest of the league.{' '}
          {locked
            ? 'Lineups are locked. Final scores arrive after Monday night.'
            : `Projections update until kickoff${lockAt != null && meta.lockTime ? ` (${formatLock(meta.lockTime)}, ${formatCountdown(lockAt - now)})` : ''}. Tap any entry to see its lineup.`}
        </p>
      </div>

      {mine && <YourEntry data={data} mine={mine} />}

      {!supabase ? (
        <div className="panel panel__body notice">Entries aren't open yet. Check back soon.</div>
      ) : (
        <DataState state={board} loading={<div className="panel panel__body">Loading entries…</div>}>
          {(entries) => <BoardBody data={data} entries={entries ?? []} mine={mine} />}
        </DataState>
      )}

      <p className="small muted" style={{ marginTop: 16 }}>
        Austin's projection {fmtPts(austin.projTotal)}. League data last updated {formatUpdated(austin.updatedAt)}.
      </p>
    </div>
  );
}

function YourEntry({ data, mine }: { data: GameData; mine: EnteredEntry }) {
  const { meta, byId, austin } = data;
  const lineup = reconcile(meta.slots, mine.lineup ?? loadDraft(meta.season, meta.week), byId);
  const total = lineupTotal(lineup, byId);
  const diff = Math.round((total - austin.projTotal) * 10) / 10;

  return (
    <section className="panel your-entry" aria-labelledby="mine-title">
      <div className="panel__headrow">
        <h2 className="panel__title" id="mine-title">
          Your entry
        </h2>
        <span className="small muted">
          {mine.name}
          {mine.teamName ? ` · ${mine.teamName}` : ''}
        </span>
      </div>
      <ul className="lineup__slots">
        {meta.slots.map((s, i) => {
          const p = lineup[i] != null ? byId.get(lineup[i]!) : undefined;
          return (
            <li key={i} className="lineup__slot">
              <span className="lineup__pos">{s.slot}</span>
              <span className="lineup__name">
                {p ? (
                  <>
                    {p.name}
                    <small>
                      {p.pos} · {p.team ?? 'FA'} {oppLabel(p)}
                    </small>
                  </>
                ) : (
                  <span className="muted">Player no longer listed</span>
                )}
              </span>
              <span className="lineup__pts">{fmtPts(p?.projPts)}</span>
            </li>
          );
        })}
      </ul>
      <div className="panel__body lineup__total">
        <span className="display lineup__totalnum">{fmtPts(total)}</span>
        <span className={diff >= 0 ? 'gap gap--ahead' : 'gap gap--behind'}>
          {diff >= 0 ? `${diff.toFixed(1)} ahead of Austin` : `${Math.abs(diff).toFixed(1)} behind Austin`}
        </span>
      </div>
    </section>
  );
}

function BoardBody({
  data,
  entries,
  mine,
}: {
  data: GameData;
  entries: BoardEntry[];
  mine: EnteredEntry | null;
}) {
  const { austin, league, meta } = data;
  const ahead = entries.filter((e) => e.projTotal >= austin.projTotal).length;
  const leagueTotals = league?.teams.map((t) => t.projTotal) ?? [];

  const bars: BarItem[] = [
    ...(league?.teams ?? []).map((t) => ({
      id: `team-${t.teamId}`,
      label: t.isAustin ? `${t.name} (Austin)` : t.name,
      value: t.projTotal,
      kind: t.isAustin ? ('austin' as const) : ('other' as const),
    })),
    ...entries.map((e) => ({
      id: e.entryId,
      label: e.name,
      note: e.teamName ?? undefined,
      value: e.projTotal,
      kind: mine && sameName(mine.name, e.name) ? ('you' as const) : ('entry' as const),
    })),
  ];

  return (
    <>
      <div className="stat-row">
        <Stat label="Lineups locked in" value={String(entries.length)} />
        <Stat label="Projected to beat Austin" value={`${ahead} of ${entries.length}`} />
        <Stat label="Austin projects" value={fmtPts(austin.projTotal)} tone="austin" />
      </div>

      <section className="panel" aria-labelledby="entries-title">
        <div className="panel__headrow">
          <h2 className="panel__title" id="entries-title">
            Entries
          </h2>
          <span className="small muted">Tap a row to see the lineup</span>
        </div>
        {entries.length === 0 ? (
          <div className="state">
            No lineups locked in yet.{' '}
            <Link className="text-link" to="/play">
              Be the first
            </Link>
          </div>
        ) : (
          <ol className="board">
            {entries.map((e, i) => (
              <BoardRow
                key={e.entryId}
                entry={e}
                rank={i + 1}
                austin={austin.projTotal}
                leagueRank={rankAmong(e.projTotal, leagueTotals)}
                leagueSize={leagueTotals.length + 1}
                isMine={!!mine && sameName(mine.name, e.name)}
              />
            ))}
          </ol>
        )}
      </section>

      {league && (
        <section className="panel panel__body" aria-labelledby="league-title" style={{ marginTop: 24 }}>
          <h2 className="panel__title" id="league-title">
            Entries vs the league
          </h2>
          <p className="small muted" style={{ margin: '4px 0 16px' }}>
            Projected points for week {meta.week}: every {LEAGUE_NAME} team plus every waiver-wire entry.
          </p>
          <LeagueBars items={bars} caption={`Projected points, week ${meta.week}`} youLabel="Your entry" />
        </section>
      )}
    </>
  );
}

function BoardRow({
  entry,
  rank,
  austin,
  leagueRank,
  leagueSize,
  isMine,
}: {
  entry: BoardEntry;
  rank: number;
  austin: number;
  leagueRank: number;
  leagueSize: number;
  isMine: boolean;
}) {
  const ahead = entry.projTotal >= austin;
  const summary = (
    <>
      <span className="board__rank">{rank}</span>
      <span className="board__name">
        {entry.name}
        {isMine && <span className="board__you">You</span>}
        <small>
          {entry.teamName ? `${entry.teamName} · ` : ''}would rank {leagueRank} of {leagueSize} in the league
        </small>
      </span>
      <span className="board__pts">{fmtPts(entry.projTotal)}</span>
      <span className={ahead ? 'tag tag--ahead' : 'tag tag--behind'}>{ahead ? 'Ahead of Austin' : 'Behind Austin'}</span>
    </>
  );

  if (!entry.lineup) {
    return (
      <li className={isMine ? 'board__row is-mine' : 'board__row'}>
        <div className="board__summary">{summary}</div>
      </li>
    );
  }
  return (
    <li className={isMine ? 'board__row is-mine' : 'board__row'}>
      <details>
        <summary className="board__summary">{summary}</summary>
        <ul className="board__lineup">
          {entry.lineup.map((p) => (
            <li key={`${p.slot}-${p.playerId}`}>
              <span className="lineup__pos">{p.slot}</span>
              <span className="lineup__name">
                {p.name ?? `Player ${p.playerId}`}
                <small>
                  {p.pos ?? ''} · {p.team ?? 'FA'}
                </small>
              </span>
              <span className="lineup__pts">{fmtPts(p.proj)}</span>
            </li>
          ))}
        </ul>
      </details>
    </li>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'austin' }) {
  return (
    <div className="panel stat">
      <div className="label">{label}</div>
      <div className={tone ? `display stat__value stat__value--${tone}` : 'display stat__value'}>{value}</div>
    </div>
  );
}
