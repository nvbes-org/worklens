import { expect, test } from '@playwright/test';
import type { Graph } from '@worklens/contracts';
import { seed } from './fixture';

test('cross-tool modules merge while filters, evidence and Nx targets retain their identities', async ({
  page,
}) => {
  await seed(page);
  await page.getByRole('link', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: 'Projects', exact: true }).click();
  await page.getByRole('button', { name: 'Trust this repository' }).click();
  await expect(page.getByRole('button', { name: 'Revoke execution trust' })).toBeVisible();
  await page.evaluate(() => {
    const transport = window.__WORKLENS_TRANSPORT__;
    window.__WORKLENS_TRANSPORT__ = async (request) => {
      if (!transport) throw new Error('Missing transport');
      const response = await transport(request);
      if (request.operation === 'tasks') Reflect.set(window, 'componentTaskParams', request.params);
      if (request.operation === 'graph') {
        const graph = response.data as unknown as Graph;
        const web = graph.nodes[0];
        const core = graph.nodes[1];
        graph.nodes.push(
          {
            ...web,
            id: 'cargo:web',
            name: 'rust-web',
            ecosystem: 'cargo',
            manifest: 'apps/web/Cargo.toml',
            targets: ['check'],
          },
          { ...web, id: 'pnpm:web', name: '@fixture/web', ecosystem: 'pnpm', targets: [] },
          { ...core, id: 'nx:core', ecosystem: 'nx', manifest: 'libs/core/project.json', targets: ['test'] },
        );
        // Exercise legacy backend responses without engine grouping metadata.
        Reflect.deleteProperty(graph, 'components');
        graph.edges.push(
          {
            source: 'cargo:web',
            target: 'cargo:core',
            kind: 'project_dependency',
            evidence: 'observed',
            origin: 'Cargo metadata',
          },
          {
            source: 'nx:web',
            target: 'cargo:web',
            kind: 'contains',
            evidence: 'declared',
            origin: 'same manifest',
          },
        );
      }
      return response;
    };
  });
  await page.getByRole('button', { name: 'Back to project' }).click();
  await page.getByRole('link', { name: 'Architecture', exact: true }).click();
  await page.getByRole('button', { name: 'Refresh graph', exact: true }).click();
  await expect(page.getByText('2 modules · 1 links', { exact: true })).toBeVisible();
  await expect(page.locator('.react-flow__node')).toHaveCount(2);
  await expect(page.getByRole('complementary', { name: 'Component inspector' })).toHaveCount(0);
  await expect(page.locator('.react-flow__node.component-service')).toHaveCount(1);
  await expect(page.locator('.react-flow__node.component-lib')).toHaveCount(1);
  await expect(page.locator('.react-flow__edge')).toHaveCount(1);
  await expect(page.getByText('same component', { exact: true })).toHaveCount(0);
  await page.locator('.react-flow__edge').click({ force: true });
  await expect(page.getByRole('status')).toContainText('Cargo metadata');
  await expect(page.getByRole('status')).toContainText('fixture project.json');
  await page.getByRole('combobox', { name: 'Ecosystem' }).selectOption('cargo');
  await expect(page.locator('.react-flow__node')).toHaveCount(2);
  await page.getByRole('combobox', { name: 'Ecosystem' }).selectOption('pnpm');
  await expect(page.locator('.react-flow__node')).toHaveCount(1);
  await page.getByRole('combobox', { name: 'Ecosystem' }).selectOption('all');
  await page.getByRole('textbox', { name: 'Filter components' }).fill('rust-web');
  await expect(page.locator('.react-flow__node')).toHaveCount(1);
  await page.locator('.react-flow__node').click();
  const inspector = page.getByRole('complementary', { name: 'Component inspector' });
  await expect(inspector.getByText('apps/web/Cargo.toml', { exact: true })).toBeVisible();
  await expect(inspector.getByText('apps/web/package.json', { exact: true })).toHaveCount(2);
  await inspector.getByText('Available targets', { exact: true }).click();
  await expect(inspector.getByRole('button', { name: 'cargo · check', exact: true })).toBeDisabled();
  await inspector.getByRole('button', { name: 'nx · build', exact: true }).click();
  expect(await page.evaluate(() => Reflect.get(window, 'componentTaskParams'))).toMatchObject({
    project: 'web',
    target: 'build',
  });
  await page.getByRole('textbox', { name: 'Filter components' }).fill('');
  await inspector.getByRole('button', { name: 'core', exact: true }).click();
  await expect(inspector.getByRole('heading', { name: 'core', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'List view' }).click();
  await expect(page.locator('.architecture-canvas .divide-y > button')).toHaveCount(2);
});
