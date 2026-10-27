import { Link } from 'react-router-dom';
import { useData } from '../../lib/useAsync';
import type { MetaFile } from './types';

export function formatLock(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString(undefined, { weekday: 'long', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' });
}

export function PromoCard() {
  const meta = useData<MetaFile>('meta.json');
  const m = meta.status === 'ready' ? meta.value.data : null;
  const lock = m?.lockTime ? formatLock(m.lockTime) : null;

  return (
    <section className="promo" aria-labelledby="promo-title">
      <div className="promo__label">The game{m ? ` · Week ${m.week}` : ''}</div>
      <h2 className="display promo__title" id="promo-title">
        Can you beat Austin?
      </h2>
      <p>
        Build a lineup from the waiver wire and out-score the worst team in the league.
        {lock ? ` Locks ${lock}.` : ' Lineups lock at the first kickoff of the week.'}
      </p>
      <Link to="/play" className="btn btn--dark btn--block">
        Play this week
      </Link>
    </section>
  );
}
