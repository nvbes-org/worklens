import { expect, type Page, test } from '@playwright/test';
import type { Graph } from '@worklens/contracts';
import { seed } from './fixture';

async function blockedNx(page: Page, failTrust = false) {
  await seed(page);
  await page.evaluate(
    ({ failTrust }) => {
      const transport = window.__WORKLENS_TRANSPORT__;
      let trusted = false;
      const state = Object.assign(window, { nxTrustCalls: 0, nxForcedRefreshes: 0 });
      window.__WORKLENS_TRANSPORT__ = async (request) => {
        if (!transport) throw new Error('Missing fixture transport');
        if (request.operation === 'trust') {
          state.nxTrustCalls += 1;
          if (failTrust) return { version: 1, data: null, error: 'Could not save repository trust' };
          trusted = true;
        }
        const response = await transport(request);
        if (request.operation === 'graph') {
          const refresh = Boolean(
            request.params &&
              typeof request.params === 'object' &&
              'refresh' in request.params &&
              request.params.refresh,
          );
          if (trusted && refresh) state.nxForcedRefreshes += 1;
          const graph = response.data as unknown as Graph;
          graph.sources = [
            {
              source: 'nx',
              collectedAt: new Date().toISOString(),
              revision: null,
              status: trusted && refresh ? 'available' : 'unavailable',
              detail: trusted && refresh ? null : 'Trust this repository to execute its local Nx plugins.',
            },
          ];
        }
        return response;
      };
    },
    { failTrust },
  );
  await page
    .getByRole('navigation', { name: 'Main navigation' })
    .getByRole('link', { name: 'Architecture' })
    .click();
  await page.getByRole('button', { name: 'Refresh graph', exact: true }).click();
}

test('Nx trust is explained above the graph and enabled only by an explicit click', async ({ page }) => {
  await blockedNx(page);
  const notice = page.getByRole('region', { name: 'Nx repository trust' });
  await expect(notice).toBeVisible();
  await expect(notice).toContainText('execute code from this repository');
  const noticeBox = await notice.boundingBox();
  const canvasBox = await page.locator('.architecture-canvas').boundingBox();
  if (!noticeBox || !canvasBox) throw new Error('Notice or graph is missing');
  expect(noticeBox.y).toBeLessThan(canvasBox.y);
  expect(await page.evaluate(() => Reflect.get(window, 'nxTrustCalls'))).toBe(0);
  await page.getByRole('button', { name: 'Trust repository and enable Nx' }).click();
  await expect(notice).toHaveCount(0);
  expect(await page.evaluate(() => Reflect.get(window, 'nxTrustCalls'))).toBe(1);
  expect(await page.evaluate(() => Reflect.get(window, 'nxForcedRefreshes'))).toBe(1);
});

test('failed trust stays visible and does not start Nx collection', async ({ page }) => {
  await blockedNx(page, true);
  await page.getByRole('button', { name: 'Trust repository and enable Nx' }).click();
  await expect(page.getByRole('alert')).toContainText('Could not save repository trust');
  await expect(page.getByRole('button', { name: 'Trust repository and enable Nx' })).toBeEnabled();
  expect(await page.evaluate(() => Reflect.get(window, 'nxForcedRefreshes'))).toBe(0);
});

test('projects without Nx do not show the Nx trust prompt', async ({ page }) => {
  await seed(page);
  await page
    .getByRole('navigation', { name: 'Main navigation' })
    .getByRole('link', { name: 'Architecture' })
    .click();
  await expect(page.locator('.react-flow__node')).toHaveCount(2);
  await expect(page.getByRole('region', { name: 'Nx repository trust' })).toHaveCount(0);
});
