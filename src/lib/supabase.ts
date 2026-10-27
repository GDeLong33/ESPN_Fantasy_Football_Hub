import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// Only the public anon / publishable key is ever used in the browser.
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/** null until the Supabase variables are configured for the build. */
export const supabase: SupabaseClient | null =
  url && key ? createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }) : null;
