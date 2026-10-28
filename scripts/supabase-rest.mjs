// Tiny Supabase REST helper for the GitHub Action scripts (no dependencies).
// Uses the service role / secret key, which must never reach the browser.

export function supabaseFromEnv() {
  const rawUrl = process.env.SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!rawUrl || !key) return null;
  // Keep only https://<project>.supabase.co, even if a path like /rest/v1/ was pasted with it.
  const url = new URL(rawUrl).origin;

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
    if (!res.ok) {
      let hint = '';
      if (res.status === 401 || res.status === 403) {
        hint = '\n  Hint: SUPABASE_SERVICE_ROLE_KEY looks wrong. It must be the Secret / service_role key, not the publishable / anon key.';
      } else if (res.status === 404 || /PGRST202|Could not find the function/.test(text)) {
        hint = '\n  Hint: the database setup has not been run. Paste supabase/migrations/*.sql into the Supabase SQL editor and click Run.';
      }
      throw new Error(`Supabase ${method} ${path}: HTTP ${res.status} ${text.slice(0, 300)}${hint}`);
    }
    return text ? JSON.parse(text) : null;
  }

  return {
    rpc: (fn, args) => request('POST', `rpc/${fn}`, args),
    select: (path) => request('GET', path),
    remove: (path) => request('DELETE', path, undefined, { Prefer: 'return=minimal' }),
    upsert: (table, rows, onConflict) =>
      request('POST', `${table}?on_conflict=${onConflict}`, rows, { Prefer: 'resolution=merge-duplicates,return=minimal' }),
  };
}
