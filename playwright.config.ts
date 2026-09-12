import { defineConfig } from '@playwright/test';

const port = Number(process.env.WORKLENS_TEST_PORT ?? 1421);
export default defineConfig({
  testDir: './tests/ui',
  fullyParallel: true,
  workers: 2,
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    viewport: { width: 1440, height: 900 },
    trace: 'retain-on-failure',
  },
  webServer: {
    command: `pnpm exec vite --config apps/desktop/vite.config.mts --mode test --host 127.0.0.1 --port ${port}`,
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
