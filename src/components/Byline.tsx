import { HOUSE_AUTHOR } from '../site';

type Props = { author?: string; date?: string; verb?: string; compact?: boolean };

export function formatStoryDate(date?: string) {
  if (!date) return null;
  const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(date) ? `${date}T12:00:00` : date);
  if (Number.isNaN(d.getTime())) return date;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

/** Shared "Reported by Stephen A. DeLong · date" line for every hub section. */
export function Byline({ author = HOUSE_AUTHOR, date, verb = 'Reported by', compact }: Props) {
  const when = formatStoryDate(date);
  return (
    <div className="byline">
      {!compact && <>{verb} </>}
      <span className="byline__name">{author}</span>
      {when && (
        <>
          {' · '}
          <time dateTime={date}>{when}</time>
        </>
      )}
    </div>
  );
}
