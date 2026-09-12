import { expect, test } from '@playwright/test';
import { seed } from './fixture';

test('Overview displays repository activity and components, and navigates to Architecture', async ({
  page,
}) => {
  const failures: string[] = [];
  page.on('pageerror', (error) => failures.push(error.message));
  await seed(page);

  // Overview title and metrics
  await expect(page.getByRole('heading', { name: 'fixture', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Needs attention' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Apps & packages' })).toBeVisible();

  // Worktree details
  await expect(page.locator('.view-heading').getByText('feature/cockpit', { exact: true })).toBeVisible();
  await expect(page.getByText('1 changed file', { exact: true })).toBeVisible();

  // Local components details
  await expect(page.getByText('web', { exact: true })).toBeVisible();
  await expect(page.getByText('core', { exact: true })).toBeVisible();

  // Navigate to Architecture
  await page.getByRole('link', { name: 'Architecture', exact: true }).click();
  await expect(page.locator('.react-flow__node')).toHaveCount(2);

  // Filter components
  await page.getByRole('textbox', { name: 'Filter components' }).fill('core');
  await expect(page.locator('.react-flow__node')).toHaveCount(1);
  await page.locator('.react-flow__node').click();
  await expect(page.getByRole('heading', { name: 'core', exact: true })).toBeVisible();
  await expect(page.getByText('libs/core/Cargo.toml', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(page.locator('.react-flow__node')).not.toHaveClass(/selected/);
  await page.locator('.react-flow__node').press('Enter');
  await expect(page.getByRole('heading', { name: 'core', exact: true })).toBeVisible();

  expect(failures).toEqual([]);
});

test('Settings displays repository trust and diagnostics', async ({ page }) => {
  await seed(page);
  await page.getByRole('link', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: 'Projects', exact: true }).click();
  await page.getByRole('button', { name: 'Trust this repository' }).click();
  await expect(page.getByRole('button', { name: 'Revoke execution trust' })).toBeVisible();
});
