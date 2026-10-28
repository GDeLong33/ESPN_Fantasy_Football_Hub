import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// Only the public anon / publishable key is ever used in the browser.
const rawUrl = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim();
const key = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim();

/** Keep only https://<project>.supabase.co, even if a path like /rest/v1/ was pasted with it. */
function projectOrigin(value: string | undefined) {
  try {
    return value ? new URL(value).origin : null;
  } catch {
    return null;
  }
}

const url = projectOrigin(rawUrl);

/** null until the Supabase variables are configured for the build. */
export const supabase: SupabaseClient | null =
  url && key ? createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }) : null;
