import { defineConfig } from '@playwright/test';

const PORT = 4173;
const BASE = '/ESPN_Fantasy_Football_Hub/';

export default defineConfig({
  testDir: 'tests',
  use: { baseURL: `http://localhost:${PORT}${BASE}` },
  webServer: {
    // Pin the base so it matches baseURL even when GITHUB_REPOSITORY differs (forks).
    command: `npx vite build --base ${BASE} && npx vite preview --port ${PORT} --strictPort --base ${BASE}`,
    port: PORT,
    // A fake Supabase address; tests intercept its requests with page.route().
    env: { VITE_SUPABASE_URL: 'https://fake.supabase.test', VITE_SUPABASE_ANON_KEY: 'test-anon-key' },
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
