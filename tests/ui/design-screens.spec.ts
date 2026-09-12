import { expect, test } from '@playwright/test';
import { seed } from './fixture';

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 1000, height: 700 },
]) {
  test(`design surfaces fit a ${viewport.width}px desktop window`, async ({ page }, info) => {
    await page.setViewportSize(viewport);
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await seed(page);
    for (const view of ['Overview', 'Architecture', 'Git']) {
      await page
        .getByRole('navigation', { name: 'Main navigation' })
        .getByRole('link', { name: view, exact: true })
        .click();
      if (view === 'Architecture') {
        await expect(page.locator('.react-flow__node')).toHaveCount(2);
        await page.locator('.react-flow__node').filter({ hasText: 'core' }).click();
      }
      if (view === 'Git') {
        await page.getByRole('button', { name: /lib.rs.*libs\/core/ }).click();
        await expect(page.locator('.diff-lines')).toContainText('+after');
      }
      expect(
        await page.locator('.main-screen').evaluate((element) => element.scrollWidth <= element.clientWidth),
      ).toBe(true);
      await page.screenshot({ path: info.outputPath(`${view.toLowerCase()}.png`) });
    }
    await page.getByRole('link', { name: 'Settings', exact: true }).click();
    await expect.poll(async () => (await page.locator('.main-screen').boundingBox())?.x).toBe(viewport.width);
    expect(
      await page
        .locator('.settings-surface')
        .evaluate((element) => element.scrollWidth <= element.clientWidth),
    ).toBe(true);
    await page.screenshot({ path: info.outputPath('settings.png') });
    expect(errors).toEqual([]);
  });
}
