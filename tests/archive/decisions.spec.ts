import { expect, test, type Page } from '@playwright/test';
import { seed } from './fixture';

async function openWork(page: Page) {
  await seed(page);
  await page.getByRole('link', { name: 'Work items', exact: true }).click();
  await page.getByRole('button', { name: 'Create work item', exact: true }).click();
  await page.getByLabel('Work title', { exact: true }).fill('Decision task');
  await page.getByLabel('Objective', { exact: true }).fill('Record explicit decisions');
  await page.getByRole('button', { name: 'Save work item', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Human–agent decisions' })).toBeVisible();
}
async function request(page: Page, question: string) {
  await page.getByLabel('Decision question', { exact: true }).fill(question);
  await page.getByLabel('Decision scope and evidence').fill('Only the described local scope.');
  await page.getByLabel('Decision option 1', { exact: true }).fill('Accept');
  await page.getByLabel('Decision option 2', { exact: true }).fill('Reject');
  await page.getByRole('button', { name: 'Request decision', exact: true }).click();
  await expect(page.getByRole('heading', { name: question, exact: true })).toBeVisible();
}

test('explicit answer and cancellation preserve history without changing work state', async ({ page }) => {
  await openWork(page);
  await request(page, 'Accept scope?');
  await expect(page.getByLabel('Answer: Accept scope?', { exact: true })).toHaveValue('');
  await page.getByRole('button', { name: 'Record answer', exact: true }).click();
  await expect(page.getByLabel('Answer: Accept scope?', { exact: true })).toBeVisible();
  await page.getByLabel('Answer: Accept scope?', { exact: true }).selectOption('Accept');
  await page.getByLabel('Reason: Accept scope?', { exact: true }).fill('Accepted only for this scope');
  await expect(page.getByRole('button', { name: 'Save changes', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Request decision', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Record answer', exact: true }).click();
  await expect(page.getByText(/Answer: Accept · Accepted only/)).toBeVisible();
  await expect(page.getByLabel('Declared work state', { exact: true })).toHaveValue('todo');
  await expect(page.getByRole('button', { name: 'Record answer', exact: true })).toHaveCount(0);
  await request(page, 'Second scope?');
  await page.getByLabel('Reason: Second scope?', { exact: true }).fill('Superseded by another request');
  await page.getByRole('button', { name: 'Cancel request', exact: true }).click();
  await expect(page.getByText(/Request cancelled · Superseded/)).toBeVisible();
  await expect(page.getByText(/decision_cancel · revision 5/)).toBeVisible();
  await expect(page.getByLabel('Declared work state', { exact: true })).toHaveValue('todo');
});

test('decision conflict retains the answer draft and blocks unrelated writes', async ({ page }) => {
  await openWork(page);
  await request(page, 'Conflict scope?');
  await page.evaluate(() => {
    const original = window.__WORKLENS_TRANSPORT__;
    if (!original) throw new Error('Missing test transport');
    window.__WORKLENS_TRANSPORT__ = async (request) => request.operation === 'work_decision_answer'
      ? { version: 1, data: null, error: 'Revision conflict: reload the work item' } : original(request);
  });
  await page.getByLabel('Answer: Conflict scope?', { exact: true }).selectOption('Reject');
  await page.getByLabel('Reason: Conflict scope?', { exact: true }).fill('My unsaved rationale');
  await page.getByRole('button', { name: 'Record answer', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Revision conflict');
  await expect(page.getByLabel('Reason: Conflict scope?', { exact: true })).toHaveValue('My unsaved rationale');
  await expect(page.getByLabel('Answer: Conflict scope?', { exact: true })).toHaveValue('Reject');
  await expect(page.getByRole('button', { name: 'Add note', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Add link', exact: true })).toBeDisabled();
});
