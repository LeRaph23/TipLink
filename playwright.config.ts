import { defineConfig, devices } from '@playwright/test';
import { existsSync, readdirSync } from 'fs';

// End-to-end tests against the local stack started by `npm run e2e:up`
// (local Supabase + next dev + demo seed). See e2e/README.md.

// Cloud containers ship a Chromium under /opt/pw-browsers that may not match
// this Playwright version's expected build; use it directly when present.
const bundledChromium = (() => {
  const dir = '/opt/pw-browsers';
  if (!existsSync(dir)) return undefined;
  const build = readdirSync(dir).find((d) => /^chromium-\d+$/.test(d));
  return build ? `${dir}/${build}/chrome-linux/chrome` : undefined;
})();

export default defineConfig({
  testDir: './e2e',
  outputDir: './.e2e/test-results',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  reporter: [['list'], ['html', { outputFolder: '.e2e/report', open: 'never' }]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000',
    locale: 'fr-FR',
    trace: 'retain-on-failure',
    screenshot: 'on',
    video: 'retain-on-failure',
    launchOptions: bundledChromium ? { executablePath: bundledChromium } : {},
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] }, testMatch: /public\.spec\.ts/ },
  ],
});
