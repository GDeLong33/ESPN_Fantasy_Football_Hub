export type BarItem = { id: string | number; label: string; value: number; kind: 'you' | 'austin' | 'other' };

type Props = {
  items: BarItem[];
  /** Accessible name for the chart, e.g. "Projected points, week 8". */
  caption: string;
  youLabel?: string;
};

/** Ranked horizontal bars: league teams plus one inserted entry. Plain HTML/CSS. */
export function LeagueBars({ items, caption, youLabel = 'Your lineup' }: Props) {
  const sorted = items.slice().sort((a, b) => b.value - a.value);
  const max = Math.max(1, ...sorted.map((i) => i.value));

  return (
    <figure className="bars">
      <figcaption className="visually-hidden">{caption}</figcaption>
      <ol className="bars__list">
        {sorted.map((item) => (
          <li key={item.id} className={`bars__row bars__row--${item.kind}`}>
            <span className="bars__label">{item.label}</span>
            <span className="bars__track" aria-hidden="true">
              <span className="bars__fill" style={{ width: `${(item.value / max) * 100}%` }} />
            </span>
            <span className="bars__value">{item.value.toFixed(1)}</span>
          </li>
        ))}
      </ol>
      <div className="bars__legend" aria-hidden="true">
        <span>
          <i className="swatch swatch--you" />
          {youLabel}
        </span>
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
