export type BarKind = 'you' | 'entry' | 'austin' | 'other';
export type BarItem = { id: string | number; label: string; value: number; kind: BarKind; note?: string };

type Props = {
  items: BarItem[];
  /** Accessible name for the chart, e.g. "Projected points, week 8". */
  caption: string;
  youLabel?: string;
  entryLabel?: string;
};

/** Ranked horizontal bars: league teams plus inserted entries. Plain HTML/CSS. */
export function LeagueBars({ items, caption, youLabel = 'Your lineup', entryLabel = 'Waiver-wire entries' }: Props) {
  const sorted = items.slice().sort((a, b) => b.value - a.value);
  const max = Math.max(1, ...sorted.map((i) => i.value));
  const has = (k: BarKind) => sorted.some((i) => i.kind === k);

  return (
    <figure className="bars">
      <figcaption className="visually-hidden">{caption}</figcaption>
      <ol className="bars__list">
        {sorted.map((item) => (
          <li key={item.id} className={`bars__row bars__row--${item.kind}`}>
            <span className="bars__label">
              {item.label}
              {item.note && <small>{item.note}</small>}
            </span>
            <span className="bars__track" aria-hidden="true">
              <span className="bars__fill" style={{ width: `${(Math.max(0, item.value) / max) * 100}%` }} />
            </span>
            <span className="bars__value">{item.value.toFixed(1)}</span>
          </li>
        ))}
      </ol>
      <div className="bars__legend" aria-hidden="true">
        {has('you') && (
          <span>
            <i className="swatch swatch--you" />
            {youLabel}
          </span>
        )}
        {has('entry') && (
          <span>
            <i className="swatch swatch--entry" />
            {entryLabel}
          </span>
        )}
        <span>
          <i className="swatch swatch--austin" />
          Austin
        </span>
        <span>
          <i className="swatch swatch--other" />
          Rest of the league
        </span>
      </div>
    </figure>
  );
}

/** 1-based rank of `value` among `others` (ties go in your favour). */
export function rankAmong(value: number, others: number[]) {
  return others.filter((v) => v > value).length + 1;
}
