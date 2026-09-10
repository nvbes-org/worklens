import { expect, test } from '@playwright/test';
import { seed } from './fixture';

test('create from PR, link worktree and agent, confirm a candidate, add note and find related work', async ({ page }) => {
  await seed(page);
  await page.getByRole('link',{name:'Pull requests',exact:true}).click();
  await page.getByRole('button',{name:/Connect local delivery/}).click();
  await page.getByRole('button',{name:'Create work item',exact:true}).click();
  await page.getByLabel('Objective',{exact:true}).fill('Understand and verify this change');
  await page.getByLabel('Result criteria',{exact:true}).fill('PR, tree and agent linked');
  await page.getByRole('button',{name:'Save work item',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Linked sources'})).toBeVisible();
  await expect(page.getByText('pr · https://github.com/example/fixture/pull/7 · confirmed',{exact:true})).toBeVisible();
  await page.getByLabel('Source type',{exact:true}).selectOption('worktree');
  await page.getByLabel('Source reference',{exact:true}).selectOption('/fixture');
  await page.getByLabel('Link reason',{exact:true}).fill('Working directory for this task');
  await page.getByRole('button',{name:'Add link',exact:true}).click();
  await expect(page.getByText('worktree · /fixture · confirmed',{exact:true})).toBeVisible();
  await page.getByLabel('Source type',{exact:true}).selectOption('agent');
  await page.getByLabel('Source reference',{exact:true}).selectOption('agent:fixture');
  await page.getByLabel('Association',{exact:true}).selectOption('candidate');
  await page.getByLabel('Link reason',{exact:true}).fill('Possible related agent');
  await page.getByRole('button',{name:'Add link',exact:true}).click();
  await page.getByRole('button',{name:'Confirm link',exact:true}).click();
  await expect(page.getByText('agent · agent:fixture · confirmed',{exact:true})).toBeVisible();
  await page.getByLabel('Local note',{exact:true}).fill('Reviewed locally; no GitHub comment');
  await page.getByRole('button',{name:'Add note',exact:true}).click();
  await expect(page.getByText(/"text": "Reviewed locally/)).toBeVisible();
  await page.getByLabel('Declared work state',{exact:true}).selectOption('completed');
  await page.getByRole('button',{name:'Save changes',exact:true}).click();
  await expect(page.getByLabel('Declared work state',{exact:true})).toHaveValue('completed');
  await page.getByRole('link',{name:'Agents',exact:true}).click();
  await expect(page.getByText('waiting',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Related work items',exact:true}).click();
  await page.getByRole('button',{name:/Connect local delivery/}).click();
  await expect(page.getByLabel('Declared work state',{exact:true})).toHaveValue('completed');
});

test('revision conflict preserves the attempted edit and asks for reload', async ({ page }) => {
  await seed(page);
  await page.getByRole('link',{name:'Work items',exact:true}).click();
  await page.getByRole('button',{name:'Create work item',exact:true}).click();
  await page.getByLabel('Work title',{exact:true}).fill('Concurrent task');
  await page.getByLabel('Objective',{exact:true}).fill('Keep edits safe');
  await page.getByRole('button',{name:'Save work item',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Linked sources'})).toBeVisible();
  await page.evaluate(() => {
    const original=window.__WORKLENS_TRANSPORT__!;
    window.__WORKLENS_TRANSPORT__=async request=>request.operation==='work_update'
      ? {version:1,data:null,error:'Revision conflict: reload the work item before applying your change'}:original(request);
  });
  await page.getByLabel('Objective',{exact:true}).fill('My unsaved edit');
  await page.getByRole('button',{name:'Save changes',exact:true}).click();
  await expect(page.getByRole('alert')).toContainText('Revision conflict');
  await expect(page.getByLabel('Objective',{exact:true})).toHaveValue('My unsaved edit');
});
