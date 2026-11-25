import { expect, test, type Page } from '@playwright/test';
import { seed } from './fixture';
import type { WorkDetail } from '@worklens/contracts';

async function openWork(page: Page, choose = true) {
  await seed(page);
  await page.getByRole('link', { name: 'Work items', exact: true }).click();
  await page.getByRole('button', { name: 'Create work item', exact: true }).click();
  await page.getByLabel('Work title', { exact: true }).fill('Context task');
  await page.getByLabel('Objective', { exact: true }).fill('Selected context only');
  await page.getByRole('button', { name: 'Save work item', exact: true }).click();
  await page.getByLabel('Local note', { exact: true }).fill('PRIVATE_NOTE_NOT_SELECTED');
  await page.getByRole('button', { name: 'Add note', exact: true }).click();
  await expect(page.getByText(/note · revision 2/)).toBeVisible();
  if (choose) await page.getByRole('button', { name: 'Choose context', exact: true }).click();
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

test('individual notes are opt-in, attributed, inert and removable from context', async ({ page }) => {
  await openWork(page);
  await page.getByLabel('Local note', { exact: true }).fill('<script>window.noteExecuted=true</script> SELECTED_NOTE');
  await page.getByRole('button', { name: 'Add note', exact: true }).click();
  await expect(page.getByText(/note · revision 3/)).toBeVisible();
  await page.getByRole('button', { name: 'Choose context', exact: true }).click();
  const picker=page.getByRole('region',{name:'Notes for context'});
  const selected=picker.locator('label').filter({hasText:'SELECTED_NOTE'}).getByRole('checkbox');
  await expect(selected).not.toBeChecked();
  await selected.check();
  await page.getByRole('button', {name:'Preview work context',exact:true}).click();
  await page.getByLabel('Work context format',{exact:true}).selectOption('json');
  const preview=page.getByRole('region',{name:'Work context preview'});
  const exported=JSON.parse(await preview.innerText());
  expect(exported.items).toHaveLength(1);
  expect(exported.items[0].kind).toBe('note');
  expect(exported.items[0].data.revision).toBe(3);
  expect(exported.items[0].data.actor).toBeTruthy();
  expect(exported.items[0].data.createdAt).toBeTruthy();
  await expect(preview).not.toContainText('PRIVATE_NOTE_NOT_SELECTED');
  expect(await page.evaluate(()=>'noteExecuted' in window)).toBe(false);
  await picker.getByRole('button',{name:/Remove selected note/}).click();
  await expect(selected).not.toBeChecked();
  await expect(preview).toHaveCount(0);
  await expect(page.getByRole('button',{name:'Preview work context',exact:true})).toBeDisabled();
});

test('note selection survives history pages', async ({ page }) => {
  await openWork(page, false);
  await page.evaluate(() => {
    const original=window.__WORKLENS_TRANSPORT__;
    if(!original)throw new Error('Missing transport');
    window.__WORKLENS_TRANSPORT__=async request=>{
      const response=await original(request);
      if(request.operation!=='work_show'||response.error)return response;
      const detail=response.data as unknown as WorkDetail;
      const params=request.params as Record<string,unknown>;
      const offset=Number(params.offset??0);
      const note=detail.events.find(e=>e.action==='note')??{eventId:'older',revision:1,action:'note',actor:'test',createdAt:'2026-09-10T10:00:00Z',details:{text:'older note'}};
      return {...response,data:{...detail,events:[{...note,eventId:offset===0?'newer':'older'}],nextOffset:offset===0?50:null} as typeof response.data};
    };
  });
  await page.getByRole('button',{name:'Choose context',exact:true}).click();
  const picker=page.getByRole('region',{name:'Notes for context'});
  await picker.getByLabel('Include note newer',{exact:true}).check();
  await picker.getByRole('button',{name:'Older note history',exact:true}).click();
  await picker.getByLabel('Include note older',{exact:true}).check();
  await expect(picker.getByText('2 notes selected across history pages:',{exact:true})).toBeVisible();
  await picker.getByRole('button',{name:'Remove selected note newer',exact:true}).click();
  await picker.getByRole('button',{name:'Newer note history',exact:true}).click();
  await expect(picker.getByLabel('Include note newer',{exact:true})).not.toBeChecked();
});

test('note picker rejects a changed work revision', async ({ page }) => {
  await openWork(page, false);
  await page.evaluate(() => {
    const original=window.__WORKLENS_TRANSPORT__;
    if(!original)throw new Error('Missing transport');
    window.__WORKLENS_TRANSPORT__=async request=>{
      const response=await original(request);
      if(request.operation!=='work_show'||response.error)return response;
      const detail=response.data as unknown as WorkDetail;
      return {...response,data:{...detail,item:{...detail.item,revision:detail.item.revision+1}} as typeof response.data};
    };
  });
  await page.getByRole('button',{name:'Choose context',exact:true}).click();
  const picker=page.getByRole('region',{name:'Notes for context'});
  await expect(picker.getByRole('alert')).toContainText('Reload the work item');
  await expect(picker.getByRole('checkbox')).toHaveCount(0);
});
