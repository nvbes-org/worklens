import { expect, test, type Page } from '@playwright/test';
import { seed } from './fixture';

async function openWork(page: Page) {
  await seed(page);
  await page.getByRole('link', { name: 'Work items', exact: true }).click();
  await page.getByRole('button', { name: 'Create work item', exact: true }).click();
  await page.getByLabel('Work title', { exact: true }).fill('Context task');
  await page.getByLabel('Objective', { exact: true }).fill('Selected context only');
  await page.getByRole('button', { name: 'Save work item', exact: true }).click();
  await page.getByLabel('Local note', { exact: true }).fill('PRIVATE_NOTE_NOT_SELECTED');
  await page.getByRole('button', { name: 'Add note', exact: true }).click();
  await expect(page.getByText(/note · revision 2/)).toBeVisible();
  await page.getByRole('button', { name: 'Choose context', exact: true }).click();
}

test('work export includes only selected saved data and renders source text inertly', async ({ page }) => {
  await openWork(page);
  const preview=page.getByRole('region', { name: 'Work context preview' });
  await expect(page.getByRole('button', { name: 'Preview work context', exact: true })).toBeDisabled();
  await page.getByLabel('Saved objective, criteria and state', { exact: true }).check();
  await page.getByRole('button', { name: 'Preview work context', exact: true }).click();
  await expect(preview).toContainText('Selected context only');
  await expect(preview).not.toContainText('PRIVATE_NOTE_NOT_SELECTED');
  await page.getByLabel('README.md', { exact: true }).check();
  await expect(preview).toHaveCount(0);
  await page.getByRole('button', { name: 'Preview work context', exact: true }).click();
  await expect(preview).toContainText('window.pwned=true');
  expect(await page.evaluate(() => 'pwned' in window)).toBe(false);
  await page.getByLabel('Work context format', { exact: true }).selectOption('json');
  const exported=JSON.parse(await preview.innerText());
  expect(exported.workRevision).toBe(2);
  expect(exported.items.map((item:{kind:string})=>item.kind)).toEqual(['summary','document']);
  await page.context().grantPermissions(['clipboard-read','clipboard-write']);
  await page.getByRole('button', { name: 'Copy context page', exact: true }).click();
  await expect(page.getByText('Context page copied.', { exact: true })).toBeVisible();
  expect(JSON.parse(await page.evaluate(() => navigator.clipboard.readText()))).toEqual(exported);
  await page.getByLabel('Objective', { exact: true }).fill('Unsaved objective');
  await expect(page.getByRole('button', { name: 'Preview work context', exact: true })).toBeDisabled();
  await expect(preview).not.toContainText('Unsaved objective');
});

test('context pagination stays explicit and expired snapshots remove the stale preview', async ({ page }) => {
  await openWork(page);
  await page.evaluate(() => {
    const original=window.__WORKLENS_TRANSPORT__;
    if(!original)throw new Error('Missing test transport');
    window.__WORKLENS_TRANSPORT__=async request=>original(request.operation==='work_context'
      ? {...request,params:{...request.params as Record<string,unknown>,limit:1} as typeof request.params}:request);
  });
  await page.getByLabel('Saved objective, criteria and state', { exact: true }).check();
  await page.getByLabel('README.md', { exact: true }).check();
  await page.getByRole('button', { name: 'Preview work context', exact: true }).click();
  await expect(page.getByText(/More context available; this page is not the full export/)).toBeVisible();
  await page.getByRole('button', { name: 'Next context page', exact: true }).click();
  await expect(page.getByText(/offset 1 · Final page/)).toBeVisible();
  await page.getByRole('button', { name: 'Previous context page', exact: true }).click();
  await expect(page.getByText(/offset 0/)).toBeVisible();
  // The previous-page request uses 30 records, so collect a fresh first page again.
  await page.getByRole('button', { name: 'Preview work context', exact: true }).click();
  await page.evaluate(() => {
    const original=window.__WORKLENS_TRANSPORT__;
    if(!original)throw new Error('Missing test transport');
    window.__WORKLENS_TRANSPORT__=async request=>request.operation==='work_context_page'
      ? {version:1,data:null,error:'Context snapshot unavailable: expired'}:original(request);
  });
  await page.getByRole('button', { name: 'Next context page', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('snapshot unavailable');
  await expect(page.getByRole('region', { name: 'Work context preview' })).toHaveCount(0);
});
