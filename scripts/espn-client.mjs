// Minimal client for ESPN's undocumented fantasy API. Server-side only.

const HOST = 'https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl';

export function createClient({ season, leagueId, espnS2, swid }) {
  const headers = { Accept: 'application/json', 'User-Agent': 'wswbc-hub-sync/1.0' };
  // Cookies are only needed for private leagues.
  if (espnS2 && swid) headers.Cookie = `espn_s2=${espnS2}; SWID=${swid}`;

  async function get(path, { views = [], params = {}, filter } = {}) {
    const url = new URL(`${HOST}/seasons/${season}${path}`);
    for (const v of views) url.searchParams.append('view', v);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
    const h = { ...headers };
    if (filter) h['X-Fantasy-Filter'] = JSON.stringify(filter);
    const label = `${path || '/'} [${views.join(',')}]`;

    for (let attempt = 1; ; attempt++) {
      let res;
      try {
        res = await fetch(url, { headers: h, signal: AbortSignal.timeout(30_000) });
      } catch (err) {
        if (attempt < 3) {
          console.warn(`  ${label}: network error (${err.message}), retrying`);
          await new Promise((r) => setTimeout(r, 2000 * attempt));
          continue;
        }
        throw new Error(`${label}: network error: ${err.message}`);
      }
      if (res.status >= 500 && attempt < 3) {
        console.warn(`  ${label}: HTTP ${res.status}, retrying`);
        await new Promise((r) => setTimeout(r, 2000 * attempt));
        continue;
      }
      if (res.status === 401 || res.status === 403) {
        throw new Error(
          `${label}: HTTP ${res.status}. The league looks private: set ESPN_S2 and ESPN_SWID (see docs/SETUP.md).`,
        );
      }
      if (!res.ok) throw new Error(`${label}: HTTP ${res.status} ${res.statusText}`);
      const type = res.headers.get('content-type') ?? '';
      if (!type.includes('json')) throw new Error(`${label}: expected JSON, got "${type}"`);
      return res.json();
    }
  }

  return {
    league: (opts) => get(`/segments/0/leagues/${leagueId}`, opts),
    season: (opts) => get('', opts),
  };
}
