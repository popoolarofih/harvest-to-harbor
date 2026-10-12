import { defineConfig } from '@playwright/test';

// Browser journeys run against the production build, in the locally installed Chrome (no browser download).
const PORT = 3200;
export default defineConfig({
  testDir: 'e2e',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: { baseURL: `http://localhost:${PORT}`, channel: 'chrome', viewport: { width: 1280, height: 800 } },
  webServer: { command: `npm run build && npx next start -p ${PORT}`, url: `http://localhost:${PORT}`, timeout: 300_000, reuseExistingServer: !process.env.CI },
});
