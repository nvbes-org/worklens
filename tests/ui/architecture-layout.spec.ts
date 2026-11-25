import { expect, test } from '@playwright/test';
import { seed } from './fixture';

test('graph fills a large window and gives back inspector space on close', async ({ page }) => {
  await page.setViewportSize({ width: 1720, height: 1100 });
  await seed(page);
  await page.getByRole('link', { name: 'Architecture', exact: true }).click();
  await expect(page.locator('.react-flow__node')).toHaveCount(2);
  const canvas = page.locator('.architecture-canvas');
  const before = await canvas.boundingBox();
  const workspace = await page.locator('.architecture-workspace').boundingBox();
  if (!before || !workspace) throw new Error('Missing graph');
  expect(before.height).toBeGreaterThan(600);
  expect(Math.abs(before.width - workspace.width)).toBeLessThan(2);
  const legend = await page.getByLabel('Component categories').boundingBox();
  if (!legend) throw new Error('Missing legend');
  expect(legend.y - (before.y + before.height)).toBeLessThan(16);
  await expect(page.getByText('Explore a module', { exact: true })).toHaveCount(0);
  await page.locator('.react-flow__node').first().click();
  await expect(page.getByLabel('Component inspector')).toBeVisible();
  const selected = await canvas.boundingBox();
  expect(selected?.width).toBeLessThan(before.width - 200);
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(page.getByLabel('Component inspector')).toHaveCount(0);
  await expect.poll(async () => (await canvas.boundingBox())?.width).toBe(before.width);
  await page.screenshot({ path: '/tmp/worklens-architecture-expanded.png' });
  await page.setViewportSize({ width: 1024, height: 768 });
  await expect
    .poll(async () => page.locator('.main-screen').evaluate((el) => el.scrollWidth <= el.clientWidth))
    .toBe(true);
});
