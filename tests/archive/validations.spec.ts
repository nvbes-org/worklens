import { expect, test } from '@playwright/test';
import type { ValidationReport } from '@worklens/contracts';
import { seed } from './fixture';

test('declare an expectation, compare against exact commit and preserve task state', async ({ page }) => {
  await seed(page);
  await page.getByRole('link', { name: 'Pull requests', exact: true }).click();
  await page.getByRole('button', { name: /Connect local delivery/ }).click();
  await page.getByRole('button', { name: 'Read validations', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Validation center', exact: true })).toContainText(
    'No local expectations',
  );
  await page.getByRole('button', { name: 'Create work item', exact: true }).click();
  await page.getByLabel('Objective', { exact: true }).fill('Review validation evidence');
  await page.getByRole('button', { name: 'Save work item', exact: true }).click();
  await page.getByLabel('Expected repository', { exact: true }).fill('example/fixture');
  await page.getByLabel('Exact control name', { exact: true }).fill('Rust tests');
  await expect(page.getByRole('button', { name: 'Save changes', exact: true })).toBeDisabled();
  await page.getByLabel('GitHub App ID (checks only, optional)', { exact: true }).fill('42');
  await page.getByRole('button', { name: 'Add expectation', exact: true }).click();
  await expect(
    page.getByText('example/fixture · check · Rust tests · App 42', { exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Read validations', exact: true }).click();
  const center = page.getByRole('region', { name: 'Validation center', exact: true });
  await expect(center).toContainText('Declared expectations satisfied');
  await expect(center).toContainText('example/fixture · abc123');
  await expect(page.getByLabel('Declared work state', { exact: true })).toHaveValue('todo');
  await page.getByLabel('Expected repository', { exact: true }).fill('example/fixture');
  await page.getByLabel('Exact control name', { exact: true }).fill('Missing check');
  await page.getByRole('button', { name: 'Add expectation', exact: true }).click();
  await page.getByRole('button', { name: 'Read validations', exact: true }).click();
  await expect(center).toContainText('Validation needs attention');
  await expect(center.getByRole('cell', { name: 'missing', exact: true })).toBeVisible();
});

test('unavailable validation source never appears satisfied', async ({ page }) => {
  await seed(page);
  await page.evaluate(() => {
    const original = window.__WORKLENS_TRANSPORT__;
    if (!original) throw new Error('Missing transport');
    window.__WORKLENS_TRANSPORT__ = async (request) => {
      const response = await original(request);
      if (request.operation === 'validations') {
        const data = response.data as unknown as ValidationReport;
        data.summary = 'unknown';
        data.sources[0].status = 'unavailable';
        data.sources[0].detail = 'GitHub permissions insufficient';
      }
      return response;
    };
  });
  await page.getByRole('link', { name: 'Pull requests', exact: true }).click();
  await page.getByRole('button', { name: /Connect local delivery/ }).click();
  await page.getByRole('button', { name: 'Read validations', exact: true }).click();
  const center = page.getByRole('region', { name: 'Validation center', exact: true });
  await expect(center).toContainText('Validation unknown');
  await expect(center).toContainText('GitHub permissions insufficient');
  await expect(center).not.toContainText('Declared expectations satisfied');
});
