import { useId, useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { DataState } from '../../components/DataState';
import { supabase } from '../../lib/supabase';
import { useAsync } from '../../lib/useAsync';
import { loadDraft, loadEntered, saveEntered } from './draftStore';
import { fmtPts, loadGameData, type GameData } from './gameData';
import { lineupTotal, reconcile, toPicks, validateLineup, type Lineup } from './lineup';
import { formatLock } from './PromoCard';
import { nameProblem, submitEntry } from './submit';
import { useNow } from './useNow';

export function LockInPage() {
  const state = useAsync(loadGameData, []);
  return (
    <div className="container page-intro">
      <DataState state={state} loading="Loading your lineup…">
        {(data) => <LockIn data={data} />}
      </DataState>
    </div>
  );
}

function LockIn({ data }: { data: GameData }) {
  const { meta, byId } = data;
  const lineup = useMemo(() => reconcile(meta.slots, loadDraft(meta.season, meta.week), byId), [meta, byId]);
  const picks = toPicks(meta.slots, lineup);
  const now = useNow();
  const locked = meta.lockTime != null && now >= Date.parse(meta.lockTime);
  const [done, setDone] = useState<{ name: string; teamName: string | null } | null>(null);

  if (done) return <Success data={data} lineup={lineup} entry={done} />;

  return (
    <>
      <div className="kicker">Week {meta.week} · Lock in</div>
      <h1 className="display page-title">Lock in your lineup</h1>

      {locked ? (
        <Notice>
          Lineups are locked for week {meta.week}.{' '}
          <Link className="text-link" to="/results">
            See the leaderboard
          </Link>
        </Notice>
      ) : !picks ? (
        <Notice>
          Your lineup isn't complete yet.{' '}
          <Link className="text-link" to="/play">
            Back to the draft room
          </Link>
        </Notice>
      ) : !supabase ? (
        <Notice>Entries aren't open yet. The scoreboard is still being set up. Check back soon.</Notice>
      ) : (
        <div className="lockin">
          <EntryForm data={data} picks={picks} onDone={setDone} />
          <LineupSummary data={data} lineup={lineup} />
        </div>
      )}

      {(locked || !picks || !supabase) && <LineupSummary data={data} lineup={lineup} />}
      <Link to="/play" className="text-link">
        ← Back to the draft room
      </Link>
    </>
  );
}

function EntryForm({
  data,
  picks,
  onDone,
}: {
  data: GameData;
  picks: NonNullable<ReturnType<typeof toPicks>>;
  onDone: (entry: { name: string; teamName: string | null }) => void;
}) {
  const { meta, pool } = data;
  const id = useId();
  const previous = loadEntered(meta.season, meta.week);
  const [name, setName] = useState('');
  const [teamName, setTeamName] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);

  const nameError = touched ? nameProblem(name) : null;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setTouched(true);
    setError(null);
    if (nameProblem(name) || !confirmed || !supabase) return;
    const problems = validateLineup(meta.slots, picks, new Map(pool.players.map((p) => [p.id, p.pos])));
    if (problems.length) {
      setError(problems[0]);
      return;
    }
    setBusy(true);
    const failure = await submitEntry(supabase, { season: meta.season, week: meta.week, name, teamName, lineup: picks });
    setBusy(false);
    if (failure) {
      setError(failure);
      return;
    }
    const entry = { name: name.trim().replace(/\s+/g, ' '), teamName: teamName.trim() || null };
    saveEntered(meta.season, meta.week, entry);
    onDone(entry);
  }

  return (
    <form className="panel panel__body entry-form" onSubmit={onSubmit} noValidate>
      {previous && (
        <p className="small muted" style={{ marginTop: 0 }}>
          This browser already entered week {meta.week} as <strong>{previous.name}</strong>. Someone else can still
          enter under their own name.
        </p>
      )}
      <div className="field">
        <label htmlFor={`${id}-name`}>Your name</label>
        <input
          id={`${id}-name`}
          name="name"
          autoComplete="name"
          maxLength={40}
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => setTouched(true)}
          aria-invalid={nameError ? true : undefined}
          aria-describedby={`${id}-name-hint`}
        />
        <span id={`${id}-name-hint`} className={nameError ? 'field__error' : 'field__hint'}>
          {nameError ?? 'Shown on the leaderboard. One entry per name each week.'}
        </span>
      </div>
      <div className="field">
        <label htmlFor={`${id}-team`}>
          Team name <span className="muted">(optional)</span>
        </label>
        <input
          id={`${id}-team`}
          name="team"
          maxLength={60}
          value={teamName}
          onChange={(e) => setTeamName(e.target.value)}
        />
      </div>
      <label className="check">
        <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
        <span>I'm locking this in. It can't be changed after I submit.</span>
      </label>
      {touched && !confirmed && <p className="field__error">Tick the box to confirm.</p>}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <button type="submit" className="btn btn--primary btn--block" disabled={busy}>
        {busy ? 'Locking in…' : 'Lock it in'}
      </button>
      {meta.lockTime && (
        <p className="small muted" style={{ marginBottom: 0 }}>
          Entries close {formatLock(meta.lockTime)}.
        </p>
      )}
    </form>
  );
}

function LineupSummary({ data, lineup }: { data: GameData; lineup: Lineup }) {
  const { meta, byId, austin } = data;
  const total = lineupTotal(lineup, byId);
  return (
    <section className="panel summary" aria-label="Your lineup">
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
                      {p.pos} · {p.team ?? 'FA'}
                    </small>
                  </>
                ) : (
                  <span className="muted">Empty slot</span>
                )}
              </span>
              <span className="lineup__pts">{fmtPts(p?.projPts)}</span>
            </li>
          );
        })}
      </ul>
      <div className="panel__body lineup__totalhead">
        <strong>Projected {fmtPts(total)}</strong>
        <span className="muted">Austin {fmtPts(austin.projTotal)}</span>
      </div>
    </section>
  );
}

function Success({
  data,
  lineup,
  entry,
}: {
  data: GameData;
  lineup: Lineup;
  entry: { name: string; teamName: string | null };
}) {
  return (
    <>
      <div className="kicker">Week {data.meta.week} · Locked in</div>
      <h1 className="display page-title">You're in, {entry.name}.</h1>
      <p>
        {entry.teamName ? `${entry.teamName} is` : 'Your lineup is'} locked. Scores come in after Monday night, and
        we'll see if you beat Austin.
      </p>
      <LineupSummary data={data} lineup={lineup} />
      <div className="actions">
        <Link to="/results" className="btn btn--primary">
          See results
        </Link>
        <Link to="/" className="btn btn--ghost">
          Back to the front page
        </Link>
      </div>
    </>
  );
}

function Notice({ children }: { children: React.ReactNode }) {
  return (
    <div className="panel panel__body notice" role="status">
      {children}
    </div>
  );
}
