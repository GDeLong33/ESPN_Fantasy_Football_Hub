import { Link } from 'react-router-dom';
import { DataState } from '../../components/DataState';
import { useAsync } from '../../lib/useAsync';
import { loadDraft } from './draftStore';
import { fmtPts, loadGameData, type GameData } from './gameData';
import { lineupTotal, reconcile } from './lineup';

// Phase 4 adds the name form and the Supabase submit. For now: the lineup summary.
export function LockInPage() {
  const state = useAsync(loadGameData, []);
  return (
    <div className="container page-intro">
      <DataState state={state} loading="Loading your lineup…">
        {(data) => <Summary data={data} />}
      </DataState>
    </div>
  );
}

function Summary({ data }: { data: GameData }) {
  const { meta, byId, austin } = data;
  const lineup = reconcile(meta.slots, loadDraft(meta.season, meta.week), byId);
  const total = lineupTotal(lineup, byId);

  return (
    <>
      <div className="kicker">Week {meta.week} · Lock in</div>
      <h1 className="display page-title">Lock in your lineup</h1>
      <section className="panel summary" aria-label="Your lineup">
        <ul className="lineup__slots">
          {meta.slots.map((s, i) => {
            const p = lineup[i] != null ? byId.get(lineup[i]!) : undefined;
            return (
              <li key={i} className="lineup__slot">
                <span className="lineup__pos">{s.slot}</span>
                <span className="lineup__name">{p ? p.name : <span className="muted">Empty slot</span>}</span>
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
      <p>Submitting entries opens soon.</p>
      <Link to="/play" className="text-link">
        ← Back to the draft room
      </Link>
    </>
  );
}
