import { expect, test } from '@playwright/test';
import { seed } from './fixture';

test('metadata loads on selection, refreshes and keeps Nx unknown without trust', async ({ page }) => {
  await seed(page);
  await page.evaluate(() => {
    const transport = window.__WORKLENS_TRANSPORT__;
    Reflect.set(window, 'metadataCalls', 0);
    window.__WORKLENS_TRANSPORT__ = async (request) => {
      if (request.operation === 'component_metadata') {
        Reflect.set(window, 'metadataCalls', Number(Reflect.get(window, 'metadataCalls')) + 1);
        return {
          version: 1,
          error: null,
          data: {
            memberIds: ['nx:web'],
            collectedAt: '2026-09-12T12:00:00Z',
            firstCommitAt: '2026-01-01T12:00:00Z',
            modifiedAt: '2026-09-12T10:00:00Z',
            lastCommit: {
              sha: 'abc123',
              date: '2026-09-10T12:00:00Z',
              author: 'Example',
              subject: 'Update web',
            },
            sizeBytes: JSON.stringify(request.params).includes('cargo:core') ? 4096 : 2048,
            fileCount: 3,
            sizeScope: 'Tracked and unignored files; generated outputs excluded.',
            dirty: true,
            integrity: [
              {
                algorithm: 'sha256',
                value: 'a'.repeat(64),
                source: 'apps/web/package.json',
                scope: 'Manifest fingerprint, not package archive integrity',
              },
            ],
            nx: { affected: null, base: 'main', head: 'HEAD', reason: 'Repository trust required' },
            warnings: [],
          },
        };
      }
      if (!transport) throw new Error('Missing transport');
      return transport(request);
    };
  });
  await page.getByRole('link', { name: 'Architecture', exact: true }).click();
  await page.getByLabel('Filter components').fill('web');
  await expect(page.locator('.react-flow__node')).toHaveCount(1);
  await page.locator('.react-flow__node').click();
  await expect(page.getByLabel('Check Nx affected')).toBeDisabled();
  const details = page.getByLabel('Component metadata');
  await expect(details).toContainText('2,048 bytes · 3 files');
  expect(await page.evaluate(() => Reflect.get(window, 'metadataCalls'))).toBe(1);
  await details.getByRole('button', { name: 'Refresh details' }).click();
  await expect.poll(() => page.evaluate(() => Reflect.get(window, 'metadataCalls'))).toBe(2);
  await expect(details).toContainText('First visible Git commit');
  await expect(details).toContainText('Unavailable');
  await details.getByText('Last modifying commit', { exact: true }).click();
  await expect(details).toContainText('Update web');
  await details.getByText('Integrity · 1 sources', { exact: true }).click();
  await expect(details).toContainText('Manifest fingerprint, not package archive integrity');
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page.locator('.react-flow__node').click();
  await expect(details).toContainText('2,048 bytes · 3 files');
  expect(await page.evaluate(() => Reflect.get(window, 'metadataCalls'))).toBe(2);
  await page.getByLabel('Filter components').fill('core');
  await expect(page.locator('.react-flow__node')).toHaveCount(1);
  await expect(page.locator('.react-flow__node')).toContainText('core');
  await page.locator('.react-flow__node').click();
  await expect(details).toContainText('4,096 bytes · 3 files');
  await expect(details).not.toContainText('2,048 bytes');
  expect(await page.evaluate(() => Reflect.get(window, 'metadataCalls'))).toBe(3);
});
