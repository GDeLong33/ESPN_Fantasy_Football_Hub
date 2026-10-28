// Story files: Markdown with the frontmatter the site's news renderer reads.

export const AUTHOR = 'Stephen A. DeLong';

/** YYYY-MM-DD in US Eastern time, the league's clock. */
export function easternDate(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(now);
}

export function slugify(text) {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
    .replace(/-+$/, '');
}

/** A slug not already used: "2026-10-28-trade-desk-headline", with -2, -3... if needed. */
export function uniqueSlug(date, kind, title, taken) {
  const base = `${date}-${kind}-${slugify(title) || 'story'}`;
  let slug = base;
  for (let n = 2; taken.has(slug); n++) slug = `${base}-${n}`;
  return slug;
}

// The site's frontmatter parser reads flat `key: "value"` lines without escapes.
const fmValue = (s) => `"${String(s).replace(/"/g, "'").replace(/\s+/g, ' ').trim()}"`;

export function storyMarkdown({ title, summary, body }, { tag, date, satire }) {
  const lines = ['---', `title: ${fmValue(title)}`, `tag: ${fmValue(tag)}`, `summary: ${fmValue(summary)}`, `date: ${date}`, `author: ${fmValue(AUTHOR)}`];
  if (satire) lines.push('satire: "true"'); // marks Rumor Mill stories in the file; not shown on the site
  lines.push('---', '', body.trim(), '');
  return lines.join('\n');
}

/** Newest first; the first story is the home page lead. */
export function addToIndex(index, slug, updatedAt) {
  const stories = (index?.stories ?? []).filter((s) => s.slug !== slug);
  return { updatedAt, stories: [{ slug }, ...stories] };
}
