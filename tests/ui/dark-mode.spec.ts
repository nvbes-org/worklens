import { expect, test } from '@playwright/test';
import { seed } from './fixture';

test('Dark mode activates automatically and renders correctly across all views', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await seed(page);

  // Check document theme attributes
  await expect(page.locator('html')).toHaveClass(/dark/);
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

  // 1. Overview Page in dark mode
  const tableHeader = page.locator('.project-table th').first();
  await expect(tableHeader).toBeVisible();

  // Header should not be bright white (#fafafa) in dark mode
  const thBg = await tableHeader.evaluate((el) => window.getComputedStyle(el).backgroundColor);
  expect(thBg).not.toBe('rgb(250, 250, 250)');

  // Verify attention item text is legible and visible
  const attentionTitle = page.locator('.attention-row .font-medium').first();
  await expect(attentionTitle).toBeVisible();

  // 2. Settings Page -> Appearance toggle (System -> Light -> Dark)
  await page.getByRole('link', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: 'Appearance', exact: true }).click();
  const appearanceSelect = page.getByRole('combobox', { name: 'Appearance' });
  await expect(appearanceSelect).toBeVisible();

  await appearanceSelect.selectOption('light');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await expect(page.locator('html')).not.toHaveClass(/dark/);

  // Toggle explicitly to Dark mode
  await appearanceSelect.selectOption('dark');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.locator('html')).toHaveClass(/dark/);

  await page.getByRole('button', { name: 'Back to project' }).click();

  // 3. Architecture Page in dark mode
  const nav = page.getByRole('navigation', { name: 'Main navigation' });
  await nav.getByRole('link', { name: 'Architecture', exact: true }).click();
  const canvas = page.locator('.architecture-canvas');
  await expect(canvas).toBeVisible();

  // 4. Git Page in dark mode
  await nav.getByRole('link', { name: 'Git', exact: true }).click();
  const gitWorkspace = page.locator('.git-workspace');
  await expect(gitWorkspace).toBeVisible();

  // 5. Cloud Page in dark mode
  await nav.getByRole('link', { name: 'Cloud', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Cloud & Infrastructure' })).toBeVisible();
  await expect(page.getByText('Temps réel actif')).toBeVisible();

  // 6. Processes Page in dark mode
  await nav.getByRole('link', { name: 'Processes', exact: true }).click();
  await expect(page.getByRole('button', { name: /Active Processes/ })).toBeVisible();

  // 7. Engines Page in dark mode
  await nav.getByRole('link', { name: 'Engines', exact: true }).click();
  await expect(page.getByText('All Engines')).toBeVisible();

  // 8. Workspaces Page in dark mode
  await nav.getByRole('link', { name: 'Workspaces', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Multi-Repo Workspaces', exact: true })).toBeVisible();
});
