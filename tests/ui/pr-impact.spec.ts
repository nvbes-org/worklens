import { expect, test } from '@playwright/test';
import type { PrImpact } from '@worklens/contracts';
import { seed } from './fixture';

test('full impact includes later file pages and survives detail pagination', async ({ page }) => {
  await seed(page);
  await page.getByRole('link', { name: 'Pull requests', exact: true }).click();
  await page.getByRole('button', { name: /Connect local delivery/ }).click();
  await page.getByRole('button', { name: 'Analyze entire PR', exact: true }).click();
  const impact = page.getByRole('region', { name: 'Full PR impact', exact: true });
  await expect(impact).toContainText('101 / 101 files · 2 page(s)');
  await expect(impact).toContainText('Complete file collection');
  await impact.getByText('web · nx', { exact: true }).click();
  await expect(impact.getByText('apps/web/page-two.ts', { exact: true }).first()).toBeVisible();
  await page.getByRole('button', { name: 'Next details', exact: true }).click();
  await expect(impact).toContainText('101 / 101 files');
  await expect(impact).toContainText('Local graph is dirty');
});

test('partial and unverified collections never appear complete', async ({ page }) => {
  await seed(page);
  await page.evaluate(() => {
    const original = window.__WORKLENS_TRANSPORT__;
    if (!original) throw new Error('Missing fixture transport');
    window.__WORKLENS_TRANSPORT__ = async (request) => {
      const response = await original(request);
      if (request.operation === 'pr_impact') {
        const data = response.data as unknown as PrImpact;
        data.collection.provenance.status = 'partial';
        data.collection.revisionVerified = false;
        data.collection.files = [];
        data.collection.warnings = ['PR revision changed; mixed file data discarded.'];
        data.impact = { direct: [], dependants: [], unmatched: [], transversal: [] };
      }
      return response;
    };
  });
  await page.getByRole('link', { name: 'Pull requests', exact: true }).click();
  await page.getByRole('button', { name: /Connect local delivery/ }).click();
  await page.getByRole('button', { name: 'Analyze entire PR', exact: true }).click();
  const impact = page.getByRole('region', { name: 'Full PR impact', exact: true });
  await expect(impact).toContainText('Partial file collection');
  await expect(impact).toContainText('Revision unverified — impact withheld');
  await expect(impact).not.toContainText('Complete file collection');
  await expect(impact).not.toContainText('Directly concerned components');
});

test('a linked work item can analyze its PR without changing work state', async ({ page }) => {
  await seed(page);
  await page.getByRole('link', { name: 'Pull requests', exact: true }).click();
  await page.getByRole('button', { name: /Connect local delivery/ }).click();
  await page.getByRole('button', { name: 'Create work item', exact: true }).click();
  await page.getByLabel('Objective', { exact: true }).fill('Review full impact');
  await page.getByRole('button', { name: 'Save work item', exact: true }).click();
  await page.getByRole('button', { name: 'Analyze entire PR', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Full PR impact', exact: true })).toContainText(
    '101 / 101 files',
  );
  await expect(page.getByLabel('Declared work state', { exact: true })).toHaveValue('todo');
});
