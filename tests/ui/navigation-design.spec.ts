import { expect, test } from '@playwright/test';
import { seed } from './fixture';

test('sidebar slides left, expands the main screen, and leaves the toolbar and island fixed', async ({
  page,
}) => {
  await seed(page);
  const toggle = page.getByRole('button', { name: 'Collapse sidebar' });
  const toolbarBefore = await toggle.boundingBox();
  const nav = page.getByRole('navigation', { name: 'Main navigation' });
  const navBefore = await nav.boundingBox();
  await toggle.click();
  await expect.poll(async () => (await page.locator('.main-screen').boundingBox())?.x).toBe(0);
  await expect.poll(async () => (await page.locator('.project-sidebar').boundingBox())?.x).toBe(-224);
  expect(await nav.boundingBox()).toEqual(navBefore);
  expect(await page.getByRole('button', { name: 'Expand sidebar' }).boundingBox()).toEqual(toolbarBefore);
  await page.getByRole('button', { name: 'Expand sidebar' }).click();
  await expect.poll(async () => (await page.locator('.main-screen').boundingBox())?.x).toBe(224);
  await expect(page.locator('.project-sidebar')).not.toHaveAttribute('inert');
});

test('Settings reveals a stationary background with opposite panel motion, preserves Git selection, and restores focus', async ({
  page,
}) => {
  await seed(page);
  await page
    .getByRole('navigation', { name: 'Main navigation' })
    .getByRole('link', { name: 'Git', exact: true })
    .click();
  await page.getByRole('button', { name: /lib.rs.*libs\/core/ }).click();
  await expect(page.locator('.diff-lines')).toContainText('+after');
  const settings = page.getByRole('link', { name: 'Settings', exact: true });
  // Record real animation frames rather than testing only CSS class names.
  await page.evaluate(() => {
    const samples: { sidebar: number; main: number; background: number }[] = [];
    const start = performance.now();
    Object.assign(window, { motionSamples: samples });
    function sample() {
      const sidebar = document.querySelector('.project-sidebar');
      const main = document.querySelector('.main-screen');
      const background = document.querySelector('.settings-surface');
      if (sidebar && main && background)
        samples.push({
          sidebar: sidebar.getBoundingClientRect().x,
          main: main.getBoundingClientRect().x,
          background: background.getBoundingClientRect().x,
        });
      if (performance.now() - start < 1500) requestAnimationFrame(sample);
    }
    requestAnimationFrame(sample);
  });
  await settings.click();
  await expect(page.getByRole('button', { name: 'Back to project' })).toBeFocused();
  await expect.poll(async () => (await page.locator('.main-screen').boundingBox())?.x).toBe(1440);
  await expect.poll(async () => (await page.locator('.project-sidebar').boundingBox())?.x).toBe(-224);
  const samples = await page.evaluate(
    () =>
      (window as unknown as { motionSamples: { sidebar: number; main: number; background: number }[] })
        .motionSamples,
  );
  expect(
    samples.some(
      (sample) => sample.sidebar < 0 && sample.sidebar > -224 && sample.main > 224 && sample.main < 1440,
    ),
  ).toBe(true);
  expect(samples.every((sample) => sample.background === 0)).toBe(true);
  await expect(page.locator('.main-screen')).toHaveAttribute('inert');
  await page.keyboard.press('Escape');
  await expect(page).toHaveURL(/\/git$/);
  await expect(settings).toBeFocused();
  await expect(page.locator('.diff-lines')).toContainText('+after');
});

test('Settings is reachable with collapsed sidebar and reduced motion; preferences survive reload', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await seed(page);
  await page.getByRole('button', { name: 'Collapse sidebar' }).click();
  await page.getByRole('link', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: 'Appearance', exact: true }).click();
  await page.getByRole('switch', { name: 'Compact rows' }).click();
  await expect(page.getByRole('switch', { name: 'Compact rows' })).toBeChecked();
  expect(
    await page
      .locator('.main-screen')
      .evaluate((element) => Number.parseFloat(getComputedStyle(element).transitionDuration)),
  ).toBeLessThan(0.001);
  await page.reload();
  await page.getByRole('button', { name: 'Appearance', exact: true }).click();
  await expect(page.getByRole('switch', { name: 'Compact rows' })).toBeChecked();
  await page.getByRole('button', { name: 'Back to project' }).click();
  await expect(page.getByRole('button', { name: 'Expand sidebar' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Settings', exact: true })).toBeFocused();
});

test('Git supports diff, history, branches, and worktrees without write operations', async ({ page }) => {
  await seed(page);
  await page
    .getByRole('navigation', { name: 'Main navigation' })
    .getByRole('link', { name: 'Git', exact: true })
    .click();
  await page.getByRole('button', { name: /lib.rs.*libs\/core/ }).click();
  await expect(page.locator('.diff-line.added')).toHaveText('+after');
  await expect(page.getByRole('button', { name: 'Commit', exact: true })).toBeDisabled();
  await page.getByRole('tab', { name: 'History', exact: true }).click();
  await page.getByRole('button', { name: /Connect local work/ }).click();
  await expect(page.getByText('Commit comparison', { exact: true })).toBeVisible();
  await page.getByRole('tab', { name: 'Branches', exact: true }).click();
  await expect(page.getByText('origin/main [behind 1]')).toBeVisible();
  await page.getByRole('tab', { name: 'Worktrees', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Current', exact: true })).toBeDisabled();
});

test('search and project switch errors remain actionable', async ({ page }) => {
  await seed(page);
  await page.getByRole('button', { name: /Search project/ }).click();
  await page.getByRole('textbox', { name: 'Search workspace' }).fill('core');
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('core');
  await page.keyboard.press('Escape');
  await page.evaluate(() => {
    const transport = window.__WORKLENS_TRANSPORT__;
    window.__WORKLENS_TRANSPORT__ = async (request) =>
      request.operation === 'open'
        ? { version: 1, data: null, error: 'Repository not found' }
        : transport
          ? transport(request)
          : { version: 1, data: null, error: 'No transport' };
  });
  await page.getByRole('button', { name: 'Change project' }).click();
  await page.getByRole('textbox', { name: 'Change repository path' }).fill('/missing');
  await page.getByRole('button', { name: 'Open project', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('Repository not found');
});
