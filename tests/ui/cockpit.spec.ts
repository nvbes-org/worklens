import { test, expect } from '@playwright/test';
import { seed } from './fixture';

test('connect PR, exact checks, impacted components and declared agent', async ({page})=>{
  const failures:string[]=[];page.on('pageerror',error=>failures.push(error.message));
  await seed(page);
  await expect(page.getByRole('heading',{name:'Workspace overview'})).toBeVisible();
  await page.getByRole('link',{name:'Pull requests',exact:true}).click();
  await page.getByRole('button',{name:/Connect local delivery/}).click();
  await expect(page.getByRole('heading',{name:'Connected local work'})).toBeVisible();
  await expect(page.getByText('1 matching worktree(s)',{exact:true})).toBeVisible();
  await expect(page.getByText('Rust tests',{exact:true})).toBeVisible();
  await expect(page.getByText('abc123',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Analyze entire PR',exact:true}).click();
  await expect(page.getByText('core · cargo',{exact:true})).toBeVisible();
  await expect(page.getByText(/Example agent: Connect the cockpit/)).toBeVisible();
  expect(failures).toEqual([]);
});

test('Git diff and history are usable', async ({page})=>{
  await seed(page);await page.getByRole('link',{name:'Git & worktrees',exact:true}).click();
  await page.getByRole('button',{name:'Working diff'}).click();
  await expect(page.getByText('-before\n+after',{exact:true})).toBeVisible();
  await page.getByRole('tab',{name:'History',exact:true}).click();
  await expect(page.getByText('Connect local work',{exact:true})).toBeVisible();
  await page.getByRole('tab',{name:'Worktrees',exact:true}).click();
  await expect(page.getByRole('button',{name:'Inspect'})).toBeVisible();
});

test('graph runs its layout worker, filters and shows provenance', async ({page})=>{
  await seed(page);await page.getByRole('link',{name:'Architecture',exact:true}).click();
  await expect(page.locator('.react-flow__node')).toHaveCount(2);
  await page.getByRole('textbox',{name:'Filter components'}).fill('core');
  await expect(page.locator('.react-flow__node')).toHaveCount(1);
  await page.locator('.react-flow__node').click();
  await expect(page.getByRole('heading',{name:'core',exact:true})).toBeVisible();
  await expect(page.getByText('libs/core/Cargo.toml',{exact:true})).toBeVisible();
});

test('explicit trust, documentation sanitization and context preview', async ({page})=>{
  await seed(page);await page.getByRole('link',{name:'Settings',exact:true}).click();
  await page.getByRole('button',{name:'Trust this repository'}).click();
  await expect(page.getByRole('button',{name:'Revoke execution trust'})).toBeVisible();
  await page.getByRole('link',{name:'Docs & context',exact:true}).click();
  await page.getByRole('button',{name:'README.md',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Fixture',exact:true})).toBeVisible();
  expect(await page.evaluate(()=>Object.hasOwn(window,'pwned'))).toBe(false);
  await page.getByRole('button',{name:'Export selected context'}).click();
  await expect(page.getByRole('heading',{name:'Context preview'})).toBeVisible();
});

test('agent state remains waiting when presence is unknown and screenshot', async ({page})=>{
  await seed(page);
  await page.screenshot({path:'test-results/worklens-overview.png',fullPage:true});
  await page.getByRole('link',{name:'Agents',exact:true}).click();
  await expect(page.getByText('waiting',{exact:true})).toBeVisible();
  await expect(page.getByText(/Presence unknown/)).toBeVisible();
});

test('GitHub connection progresses through device flow', async ({page})=>{
  await seed(page);await page.getByRole('link',{name:'Settings',exact:true}).click();
  await page.getByLabel('GitHub App client ID').fill('Iv1.fixture');
  await page.getByRole('button',{name:'Connect GitHub',exact:true}).click();
  await expect(page.getByText('ABCD-EFGH',{exact:true})).toBeVisible();
  await expect(page.getByText('Connected',{exact:true})).toBeVisible();
});

test('trusted task graph and commit graph use a real layout worker', async ({page}) => {
  await seed(page);
  await page.getByRole('link',{name:'Settings',exact:true}).click();
  await page.getByRole('button',{name:'Trust this repository'}).click();
  await page.getByRole('link',{name:'Architecture',exact:true}).click();
  await page.locator('.react-flow__node').filter({hasText:'web'}).click();
  await page.getByRole('button',{name:'build',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Task dependencies'})).toBeVisible();
  await expect(page.locator('.react-flow__node').filter({hasText:'web:build'})).toBeVisible();
  await page.getByRole('link',{name:'Git & worktrees',exact:true}).click();
  await page.getByRole('tab',{name:'History',exact:true}).click();
  await page.getByText('Commit graph — current page, child → parent',{exact:true}).click();
  await expect(page.locator('.react-flow__node')).toHaveCount(1);
});

test('measure local overview rendering with no GitHub connection', async ({page}) => {
  const start = performance.now();
  await seed(page);
  await expect(page.getByRole('heading',{name:'Workspace overview'})).toBeVisible();
  const milliseconds = Math.round(performance.now()-start);
  console.log(`Fixture overview ready: ${milliseconds} ms (browser, not native launch)`);
  await expect(page.getByText(/Connect GitHub in Settings to add pull requests/)).toBeVisible();
});
