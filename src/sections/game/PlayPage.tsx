import { useDeferredValue, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { DataState } from '../../components/DataState';
import { formatUpdated } from '../../lib/data';
import { useAsync } from '../../lib/useAsync';
import { LEAGUE_NAME } from '../../site';
import { loadDraft, useDraft } from './draftStore';
import { INJURY_LABELS, fmtPts, loadGameData, type GameData } from './gameData';
import { LeagueBars, rankAmong, type BarItem } from './LeagueBars';
import {
  addPlayer,
  filledCount,
  lineupTotal,
  reconcile,
  removePlayer,
  slotFor,
  type Lineup,
  type PoolPlayer,
} from './lineup';
import { formatLock } from './PromoCard';
import { formatCountdown, useNow } from './useNow';

export function PlayPage() {
  const state = useAsync(loadGameData, []);
  return (
    <DataState state={state} loading={<div className="container page-intro">Loading the waiver wire…</div>}>
      {(data) => <DraftRoom data={data} />}
    </DataState>
  );
}

function DraftRoom({ data }: { data: GameData }) {
  const { meta, pool, austin, league, byId } = data;
  const slots = meta.slots;
  const now = useNow();
  const lockAt = meta.lockTime ? Date.parse(meta.lockTime) : null;
  const locked = lockAt != null && now >= lockAt;

  const [lineup, update] = useDraft(meta.season, meta.week, () =>
    reconcile(slots, loadDraft(meta.season, meta.week), byId),
  );
  const [filter, setFilter] = useState('All');
  const searchRef = useRef<HTMLInputElement>(null);

  if (locked) return <LockedState week={meta.week} />;

  const total = lineupTotal(lineup, byId);
  const filled = filledCount(lineup);
  const add = (p: PoolPlayer) => update((l) => addPlayer(slots, l, p.id, p.pos));
  const remove = (id: number) => update((l) => removePlayer(l, id));
  const findFor = (pos: string) => {
    setFilter(pos);
    searchRef.current?.focus();
  };

  return (
    <>
      <div className="container draft-hero">
        <div className="draft-hero__text">
          <div className="kicker">
            {LEAGUE_NAME} · Week {meta.week} · Waiver wire only
          </div>
          <h1 className="display page-title">
            Austin has the worst team in the league.
            <br />
            Surely you can beat him.
          </h1>
          <p className="draft-hero__lede">
            Every player below is a free agent in our league. Fill your lineup, lock it in with your name, and we
            compare it to Austin's real lineup at the end of the week.
          </p>
        </div>
        <section className="panel score-card" aria-labelledby="beat-title">
          <h2 className="label" id="beat-title" style={{ margin: 0 }}>
            Score to beat
          </h2>
          <div className="score-card__row">
            <span className="display score-card__num">{fmtPts(austin.projTotal)}</span>
            <span className="muted small">Austin's projected</span>
          </div>
          <p className="small muted" style={{ margin: '12px 0 0' }}>
            {meta.lockTime && lockAt != null
              ? `Lineup locks ${formatLock(meta.lockTime)} · ${formatCountdown(lockAt - now)}`
              : 'Lineups lock at the first kickoff of the week.'}
          </p>
        </section>
      </div>

      <div className="container draft-cols">
        <LineupPanel
          data={data}
          lineup={lineup}
          total={total}
          filled={filled}
          onRemove={remove}
          onFind={findFor}
        />
        <WaiverWire
          players={pool.players}
          slots={slots}
          lineup={lineup}
          filter={filter}
          setFilter={setFilter}
          searchRef={searchRef}
          onAdd={add}
          onRemove={remove}
          updatedAt={pool.updatedAt}
        />
      </div>

      {league && (
        <div className="container" style={{ paddingBottom: 24 }}>
          <RankPanel league={league} total={total} filled={filled} slotCount={slots.length} week={meta.week} />
        </div>
      )}
    </>
  );
}

function LineupPanel({
  data,
  lineup,
  total,
  filled,
  onRemove,
  onFind,
}: {
  data: GameData;
  lineup: Lineup;
  total: number;
  filled: number;
  onRemove: (id: number) => void;
  onFind: (pos: string) => void;
}) {
  const { meta, austin, byId } = data;
  const target = austin.projTotal;
  const diff = Math.round((total - target) * 10) / 10;
  const complete = filled === meta.slots.length;

  return (
    <section className="panel lineup" aria-labelledby="lineup-title">
      <div className="panel__headrow">
        <h2 className="panel__title" id="lineup-title">
          Your lineup
        </h2>
        <span className="small muted">
          {filled} of {meta.slots.length} filled
        </span>
      </div>
      <ul className="lineup__slots">
        {meta.slots.map((slot, i) => {
          const p = lineup[i] != null ? byId.get(lineup[i]!) : undefined;
          return (
            <li key={i} className="lineup__slot">
              <span className="lineup__pos">{slot.slot}</span>
              {p ? (
                <>
                  <span className="lineup__name">
                    {p.name}
                    <small>
                      {p.pos} · {p.team ?? 'FA'}
                      {p.injury && <> · {INJURY_LABELS[p.injury] ?? p.injury}</>}
                    </small>
                  </span>
                  <span className="lineup__pts">{fmtPts(p.projPts)}</span>
                  <button type="button" className="icon-btn" aria-label={`Remove ${p.name}`} onClick={() => onRemove(p.id)}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
                      <path d="M6 6l12 12M18 6L6 18" />
                    </svg>
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className="lineup__empty"
                  onClick={() => onFind(slot.accepts.length === 1 ? slot.accepts[0] : 'All')}
                >
                  Pick a {slot.accepts.join('/')}
                </button>
              )}
            </li>
          );
        })}
      </ul>
      <div className="panel__body">
        <div className="lineup__totalhead small muted">
          <span>Your projected total</span>
          <span>vs {fmtPts(target)}</span>
        </div>
        <div className="lineup__total">
          <span className="display lineup__totalnum">{fmtPts(total)}</span>
          <span className={diff >= 0 ? 'gap gap--ahead' : 'gap gap--behind'} aria-live="polite">
            {diff >= 0 ? `${diff.toFixed(1)} pts ahead of Austin` : `${Math.abs(diff).toFixed(1)} pts behind`}
          </span>
        </div>
        <div className="meter" aria-hidden="true">
          <div className="meter__fill" style={{ width: `${Math.min(100, target > 0 ? (total / target) * 100 : 0)}%` }} />
        </div>
        {complete ? (
          <Link to="/play/lock-in" className="btn btn--primary btn--block" style={{ marginTop: 20 }}>
            Lock in my lineup
          </Link>
        ) : (
          <button type="button" className="btn btn--primary btn--block" style={{ marginTop: 20 }} disabled>
            Fill all {meta.slots.length} slots to lock in
          </button>
        )}
      </div>
    </section>
  );
}

const PAGE = 25;
const norm = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

function WaiverWire({
  players,
  slots,
  lineup,
  filter,
  setFilter,
  searchRef,
  onAdd,
  onRemove,
  updatedAt,
}: {
  players: PoolPlayer[];
  slots: GameData['meta']['slots'];
  lineup: Lineup;
  filter: string;
  setFilter: (f: string) => void;
  searchRef: React.RefObject<HTMLInputElement | null>;
  onAdd: (p: PoolPlayer) => void;
  onRemove: (id: number) => void;
  updatedAt: string;
}) {
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(PAGE);
  const q = useDeferredValue(norm(query.trim()));

  // Chips: every position with a dedicated slot, in lineup order.
  const positions = useMemo(
    () => ['All', ...new Set(slots.filter((s) => s.accepts.length === 1).map((s) => s.accepts[0]))],
    [slots],
  );
  const shown = useMemo(
    () => players.filter((p) => (filter === 'All' || p.pos === filter) && (!q || norm(p.name).includes(q))),
    [players, filter, q],
  );

  return (
    <section className="panel wire" aria-labelledby="wire-title">
      <div className="panel__headrow">
        <h2 className="panel__title" id="wire-title">
          Waiver wire
        </h2>
        <label className="search">
          <span>Search</span>
          <input
            ref={searchRef}
            type="search"
            placeholder="Player name"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setLimit(PAGE);
            }}
          />
        </label>
      </div>
      <div className="chips" role="group" aria-label="Filter by position">
        {positions.map((pos) => (
          <button
            key={pos}
            type="button"
            className="chip"
            aria-pressed={filter === pos}
            onClick={() => {
              setFilter(pos);
              setLimit(PAGE);
            }}
          >
            {pos}
          </button>
        ))}
      </div>
      <div className="table-scroll" tabIndex={0} role="region" aria-label="Free agents">
        <table className="wire__table">
          <thead>
            <tr>
              <th scope="col">Player</th>
              <th scope="col">Pos</th>
              <th scope="col" className="hide-sm">
                Team
              </th>
              <th scope="col" className="num">
                Proj
              </th>
              <th scope="col" className="num hide-sm">
                Rostered
              </th>
              <th scope="col">
                <span className="visually-hidden">Action</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {shown.slice(0, limit).map((p) => {
              const inLineup = lineup.includes(p.id);
              const open = slotFor(slots, lineup, p.pos) !== -1;
              return (
                <tr key={p.id} className={inLineup ? 'is-picked' : undefined}>
                  <td className="wire__name">
                    {p.name}
                    {p.injury && (
                      <abbr className="inj" title={INJURY_LABELS[p.injury] ?? p.injury}>
                        {p.injury}
                      </abbr>
                    )}
                    <small className="wire__sub">
                      {p.team ?? 'FA'} · {Math.round(p.ownedPct)}% rostered
                    </small>
                  </td>
                  <td className="wire__pos">{p.pos}</td>
                  <td className="muted hide-sm">{p.team ?? 'FA'}</td>
                  <td className="num strong">{fmtPts(p.projPts)}</td>
                  <td className="num muted hide-sm">{Math.round(p.ownedPct)}%</td>
                  <td>
                    {inLineup ? (
                      <button type="button" className="add-btn is-added" aria-label={`Remove ${p.name}`} onClick={() => onRemove(p.id)}>
                        Added
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="add-btn"
                        aria-label={open ? `Add ${p.name}` : `No open ${p.pos} slot`}
                        disabled={!open}
                        onClick={() => onAdd(p)}
                      >
                        {open ? 'Add' : 'Full'}
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {shown.length === 0 && <div className="state">No free agents match that search.</div>}
      </div>
      <div className="panel__foot wire__foot">
        <span>
          Showing {Math.min(limit, shown.length)} of {shown.length}. Data last updated {formatUpdated(updatedAt)}.
        </span>
        {shown.length > limit && (
          <button type="button" className="btn btn--ghost" onClick={() => setLimit((l) => l + PAGE)}>
            Show more
          </button>
        )}
      </div>
    </section>
  );
}

function RankPanel({
  league,
  total,
  filled,
  slotCount,
  week,
}: {
  league: NonNullable<GameData['league']>;
  total: number;
  filled: number;
  slotCount: number;
  week: number;
}) {
  const items: BarItem[] = [
    ...league.teams.map((t) => ({
      id: t.teamId,
      label: t.isAustin ? `${t.name} (Austin)` : t.name,
      value: t.projTotal,
      kind: t.isAustin ? ('austin' as const) : ('other' as const),
    })),
    { id: 'you', label: filled === slotCount ? 'Your lineup' : 'You (so far)', value: total, kind: 'you' },
  ];
  const rank = rankAmong(total, league.teams.map((t) => t.projTotal));
  const done = filled === slotCount;

  return (
    <section className="panel panel__body" aria-labelledby="rank-title">
      <div className="rank-head">
        <h2 className="panel__title" id="rank-title">
          Where your team would rank
        </h2>
        <span className="rank-line" aria-live="polite">
          You'd rank {rank} of {items.length}
          {done ? '' : ` so far · ${filled} of ${slotCount} slots filled`}
        </span>
      </div>
      <p className="small muted" style={{ margin: '4px 0 16px' }}>
        Projected points this week: every {LEAGUE_NAME} team, plus your lineup as you build it.
      </p>
      <LeagueBars items={items} caption={`Projected points, week ${week}`} youLabel="Your lineup" />
    </section>
  );
}

function LockedState({ week }: { week: number }) {
  return (
    <div className="container page-intro">
      <div className="kicker">Week {week}</div>
      <h1 className="display page-title">Lineups are locked</h1>
      <p>Kickoff has passed, so no more entries this week. See how the field is doing against Austin.</p>
      <Link to="/results" className="btn btn--primary">
        See the leaderboard
      </Link>
    </div>
  );
}
