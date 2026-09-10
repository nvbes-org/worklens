import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/ui',
  fullyParallel: true,
  workers: 2,
  use: { baseURL: 'http://127.0.0.1:1420', viewport: { width:1440,height:960 }, trace: 'retain-on-failure' },
  webServer: { command: 'pnpm exec vite --config apps/desktop/vite.config.mts --mode test --host 127.0.0.1 --port 1420', url:'http://127.0.0.1:1420', reuseExistingServer:false, timeout:60_000 },
});
