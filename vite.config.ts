/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// GitHub Pages serves the site from /<repo-name>/.
const repo = process.env.GITHUB_REPOSITORY?.split('/')[1] ?? 'ESPN_Fantasy_Football_Hub';

export default defineConfig({
  base: `/${repo}/`,
  plugins: [react()],
  test: {
    include: ['src/**/*.test.ts', 'scripts/**/*.test.mjs'],
  },
});
