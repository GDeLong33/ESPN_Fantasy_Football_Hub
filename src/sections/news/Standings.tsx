import { DataState } from '../../components/DataState';
import { formatUpdated } from '../../lib/data';
import { useData } from '../../lib/useAsync';

/** public/data/standings.json, written by scripts/fetch-espn.mjs. Teams are in standings order. */
export type StandingsFile = {
  updatedAt: string;
  season: number;
  week: number;
  teams: {
    teamId: number;
    name: string;
    owner: string;
    wins: number;
    losses: number;
    ties: number;
    pointsFor: number;
    isAustin?: boolean;
  }[];
};

export function Standings() {
  const state = useData<StandingsFile>('standings.json');
  return (
    <section className="panel" aria-labelledby="standings-title">
      <h2 className="panel__head" id="standings-title" style={{ margin: 0 }}>
        Standings
      </h2>
      <DataState state={state} loading="Loading standings…">
        {({ data, sample }) =>
          !data || data.teams.length === 0 ? (
            <div className="state">Standings will appear once the first ESPN sync runs.</div>
          ) : (
            <>
              <ol className="standings">
                {data.teams.map((t, i) => (
                  <li key={t.teamId} className={t.isAustin ? 'is-austin' : undefined}>
                    <span className="standings__rank">{i + 1}</span>
                    <span className="standings__name">
                      {t.name}
                      {t.owner && <small>{t.owner}</small>}
                    </span>
                    <span className="standings__record">
                      {t.wins}-{t.losses}
                      {t.ties > 0 ? `-${t.ties}` : ''}
                    </span>
                  </li>
                ))}
              </ol>
              <div className="panel__foot">
                {sample ? 'Sample data. ' : ''}Data last updated {formatUpdated(data.updatedAt)}
              </div>
            </>
          )
        }
      </DataState>
    </section>
  );
}
