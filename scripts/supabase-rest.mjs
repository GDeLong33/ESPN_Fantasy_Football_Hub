// Tiny Supabase REST helper for the GitHub Action scripts (no dependencies).
// Uses the service role / secret key, which must never reach the browser.

export function supabaseFromEnv() {
  const url = process.env.SUPABASE_URL?.trim().replace(/\/+$/, '');
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) return null;

  const headers = { apikey: key, 'Content-Type': 'application/json' };
  // Legacy service_role keys are JWTs and go in Authorization too; new sb_secret_ keys don't.
  if (!key.startsWith('sb_')) headers.Authorization = `Bearer ${key}`;

  async function request(method, path, body, extra = {}) {
    const res = await fetch(`${url}/rest/v1/${path}`, {
      method,
      headers: { ...headers, ...extra },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`Supabase ${method} ${path}: HTTP ${res.status} ${text.slice(0, 300)}`);
    return text ? JSON.parse(text) : null;
  }

  return {
    rpc: (fn, args) => request('POST', `rpc/${fn}`, args),
    select: (path) => request('GET', path),
    upsert: (table, rows, onConflict) =>
      request('POST', `${table}?on_conflict=${onConflict}`, rows, { Prefer: 'resolution=merge-duplicates,return=minimal' }),
  };
}
