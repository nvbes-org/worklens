import { expect, test, type Page } from '@playwright/test';
import type { WorkContextPage } from '@worklens/contracts';
import { seed } from './fixture';

async function linkedWork(page: Page) {
  await seed(page);
  await page.getByRole('link', {name:'Pull requests',exact:true}).click();
  await page.getByRole('button',{name:/Connect local delivery/}).click();
  await page.getByRole('button',{name:'Create work item',exact:true}).click();
  await page.getByLabel('Objective',{exact:true}).fill('Review evidence');
  await page.getByRole('button',{name:'Save work item',exact:true}).click();
  await page.getByRole('button',{name:'Choose context',exact:true}).click();
}

test('linked PR evidence requires explicit selection and displays its SHA before export',async({page})=>{
  await linkedWork(page);
  const checkbox=page.getByLabel('PR evidence: https://github.com/example/fixture/pull/7',{exact:true});
  await expect(checkbox).not.toBeChecked();
  await page.getByLabel('Saved objective, criteria and state',{exact:true}).check();
  await page.getByRole('button',{name:'Preview work context',exact:true}).click();
  await expect(page.getByRole('region',{name:'PR evidence on this page'})).toHaveCount(0);
  await checkbox.check();
  await expect(page.getByRole('region',{name:'Work context preview'})).toHaveCount(0);
  await page.getByRole('button',{name:'Preview work context',exact:true}).click();
  const summary=page.getByRole('region',{name:'PR evidence on this page'});
  await expect(summary).toContainText('SHA: '+ 'b'.repeat(40));
  await expect(summary).toContainText('not_configured');
  await page.getByLabel('Work context format',{exact:true}).selectOption('json');
  const packet=JSON.parse(await page.getByRole('region',{name:'Work context preview'}).innerText());
  expect(packet.items.map((i:{kind:string})=>i.kind)).toEqual(['summary','pr_evidence','pr_validations']);
  await expect(page.getByLabel('Declared work state',{exact:true})).toHaveValue('todo');
});

test('unavailable PR evidence leaves selected local context usable',async({page})=>{
  await linkedWork(page);
  await page.evaluate(()=>{
    const original=window.__WORKLENS_TRANSPORT__;
    if(!original)throw new Error('Missing transport');
    window.__WORKLENS_TRANSPORT__=async request=>{
      const response=await original(request);
      if(request.operation==='work_context'){
        const packet=response.data as unknown as WorkContextPage;
        packet.items=packet.items.filter(i=>i.kind!=='pr_validations');
        const evidence=packet.items.find(i=>i.kind==='pr_evidence');
        if(evidence){evidence.data=null;evidence.sources[0]={...evidence.sources[0],status:'unavailable',detail:'PR changed while collecting validations; evidence discarded.'};}
        packet.total=packet.items.length;
      }
      return response;
    };
  });
  await page.getByLabel('Saved objective, criteria and state',{exact:true}).check();
  await page.getByLabel('PR evidence: https://github.com/example/fixture/pull/7',{exact:true}).check();
  await page.getByRole('button',{name:'Preview work context',exact:true}).click();
  await expect(page.getByRole('region',{name:'PR evidence on this page'})).toContainText('evidence discarded');
  await page.getByLabel('Work context format',{exact:true}).selectOption('json');
  await expect(page.getByRole('region',{name:'Work context preview'})).toContainText('Review evidence');
});
