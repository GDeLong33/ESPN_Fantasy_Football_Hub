/** URL for a file under public/, respecting the GitHub Pages base path. */
export function assetUrl(path: string): string {
  if (/^(https?:)?\/\//.test(path)) return path;
  return import.meta.env.BASE_URL + path.replace(/^\//, '');
}

export type Loaded<T> = { data: T | null; sample: boolean };

async function tryFetch(path: string, as: 'json' | 'text'): Promise<unknown | undefined> {
  const res = await fetch(assetUrl(path), { cache: 'no-cache' });
  if (res.status === 404) return undefined;
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  const type = res.headers.get('content-type') ?? '';
  // The Vite dev server answers missing files with index.html, so treat HTML as "not found".
  if (type.includes('text/html')) return undefined;
  return as === 'json' ? res.json() : res.text();
}

/**
 * Load public/data/<name>. Falls back to public/data/sample/<name> when the live
 * file has not been generated yet, and reports which one was used.
 * Resolves with data: null when neither exists.
 */
export async function loadData<T>(name: string): Promise<Loaded<T>> {
  const live = await tryFetch(`data/${name}`, 'json');
  if (live !== undefined) return { data: live as T, sample: false };
  const sample = await tryFetch(`data/sample/${name}`, 'json');
  if (sample !== undefined) return { data: sample as T, sample: true };
  return { data: null, sample: false };
}

export async function loadText(path: string): Promise<string | null> {
  const text = await tryFetch(path, 'text');
  return text === undefined ? null : (text as string);
}

export function formatUpdated(iso: string | null | undefined): string {
  if (!iso) return 'unknown';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'unknown';
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}
