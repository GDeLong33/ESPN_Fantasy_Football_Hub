import { Link } from 'react-router-dom';
import { DataState } from '../../components/DataState';
import { useData } from '../../lib/useAsync';
import type { ResultsFile } from './types';

export function TallyCard() {
  const state = useData<ResultsFile>('results.json');
  return (
    <section className="panel tally-card" aria-labelledby="tally-title">
      <h2 className="label" id="tally-title" style={{ margin: 0 }}>
        Austin vs the field
      </h2>
      <DataState state={state} loading="Loading tally…">
        {({ data, sample }) =>
          !data || data.weeks.length === 0 ? (
            <p className="small muted" style={{ margin: '8px 0 0' }}>
              No weeks scored yet. The tally starts after the first week is final.
            </p>
          ) : (
            <>
              <div className="display tally-card__score">
                {data.tally.austin} to {data.tally.field}
              </div>
              <div className="small muted" style={{ marginTop: 6 }}>
                Austin {data.tally.austin}, field {data.tally.field}.{sample ? ' Sample data.' : ''}
              </div>
            </>
          )
        }
      </DataState>
      <Link to="/results" className="text-link">
        See the tally
      </Link>
    </section>
  );
}
