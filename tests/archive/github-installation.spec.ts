import { expect, test } from '@playwright/test';
import { seed } from './fixture';

test('installation leaves account selection to GitHub and verifies live access', async ({ page }) => {
  await seed(page);
  await page.evaluate(() => {
    const transport = window.__WORKLENS_TRANSPORT__!;
    window.__WORKLENS_TRANSPORT__ = async (request) => request.operation === 'github_auth_status'
      ? { version: 1, data: { connected: true, clientId: 'Iv23lifQ5XbUSLUf4ynB' }, error: null }
      : transport(request);
    window.open = (url) => { document.documentElement.dataset.openedUrl = String(url); return null; };
  });
  await page.getByRole('link', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: 'Install / configure GitHub access' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-opened-url',
    'https://github.com/apps/worklens-by-nvbes/installations/new');
  await page.getByRole('button', { name: 'Verify repository access' }).click();
  await expect(page.getByRole('status')).toContainText('Pull request access verified for /fixture');
});

test('cached or denied access is not reported as verified; custom apps keep their own installation', async ({ page }) => {
  await seed(page);
  await page.evaluate(() => {
    const transport = window.__WORKLENS_TRANSPORT__!;
    let calls = 0;
    window.__WORKLENS_TRANSPORT__ = async (request) => {
      if (request.operation === 'github_auth_status') {
        return { version: 1, data: { connected: true, clientId: 'Iv1.custom' }, error: null };
      }
      if (request.operation === 'prs') {
        calls++;
        return calls === 1
          ? { version: 1, data: { provenance: { status: 'stale', detail: 'Cached snapshot; access unavailable' } }, error: null }
          : { version: 1, data: null, error: 'GitHub returned 404 Not Found' };
      }
      return transport(request);
    };
  });
  await page.getByRole('link', { name: 'Settings', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Install / configure GitHub access' })).toBeDisabled();
  await page.getByRole('button', { name: 'Verify repository access' }).click();
  await expect(page.getByText(/Cached snapshot; access unavailable/)).toBeVisible();
  await expect(page.getByRole('status')).toHaveCount(0);
  await page.getByRole('button', { name: 'Verify repository access' }).click();
  await expect(page.getByText(/GitHub returned 404 Not Found/)).toBeVisible();
  await expect(page.getByRole('status')).toHaveCount(0);
});
