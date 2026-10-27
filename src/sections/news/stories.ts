import { marked } from 'marked';
import { assetUrl, loadData, loadText } from '../../lib/data';
import { parseFrontmatter } from '../../lib/frontmatter';
import { HOUSE_AUTHOR } from '../../site';

/** public/data/news/index.json. Stories are listed newest first; the first one is the lead. */
export type NewsIndex = { updatedAt?: string | null; stories: { slug: string }[] };

export type Story = {
  slug: string;
  title: string;
  tag: string;
  summary: string;
  date?: string;
  image?: string;
  author: string;
  body: string;
};

const SLUG = /^[a-z0-9][a-z0-9-]*$/;

function imageUrl(image?: string) {
  if (!image) return undefined;
  return /^(https?:)?\/\//.test(image) || image.startsWith('/') ? assetUrl(image) : assetUrl(`data/news/${image}`);
}

export async function loadStory(slug: string): Promise<Story | null> {
  if (!SLUG.test(slug)) return null;
  const source = await loadText(`data/news/${slug}.md`);
  if (source === null) return null;
  const { meta, body } = parseFrontmatter(source);
  return {
    slug,
    title: meta.title || slug,
    tag: meta.tag || 'League news',
    summary: meta.summary || '',
    date: meta.date || undefined,
    image: imageUrl(meta.image),
    author: meta.author || HOUSE_AUTHOR,
    body,
  };
}

export async function loadStories(): Promise<{ stories: Story[]; updatedAt?: string | null }> {
  const { data } = await loadData<NewsIndex>('news/index.json');
  if (!data || !Array.isArray(data.stories)) return { stories: [] };
  const loaded = await Promise.all(data.stories.map((s) => loadStory(s.slug)));
  loaded.forEach((s, i) => {
    if (!s) console.warn(`news: story "${data.stories[i].slug}" is listed in index.json but its .md file is missing`);
  });
  return { stories: loaded.filter((s): s is Story => s !== null), updatedAt: data.updatedAt };
}

/** Story bodies are written by the site owner and committed to the repo. */
export function renderMarkdown(body: string): string {
  return marked.parse(body, { async: false }) as string;
}

/** The desks that will publish here, used for placeholder cards until stories exist. */
export const DESKS = ['Power rankings', 'Trade desk', 'Waiver report', 'Week recap', 'Mailbag', 'Hot takes'];
