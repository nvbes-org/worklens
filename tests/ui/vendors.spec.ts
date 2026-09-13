import { expect, test } from '@playwright/test';
import type { Graph } from '@worklens/contracts';
import { seed } from './fixture';

test('external dependencies and opt-in vendor parsing have distinct filters and legend', async ({ page }) => {
  await seed(page);
  await page.evaluate(() => {
    const transport = window.__WORKLENS_TRANSPORT__;
    window.__WORKLENS_TRANSPORT__ = async (request) => {
      if (!transport) throw new Error('Missing transport');
      const response = await transport(request);
      if (request.operation === 'graph') {
        const graph = response.data as unknown as Graph;
        graph.nodes.push({
          id: 'npm:react',
          name: 'react',
          root: '',
          kind: 'dependency',
          ecosystem: 'npm',
          manifest: 'apps/web/package.json#dependencies',
          external: true,
          targets: [],
          features: [],
        });
        graph.edges.push({
          source: 'nx:web',
          target: 'npm:react',
          kind: 'package_dependency',
          evidence: 'declared',
          origin: 'package.json',
        });
        if (
          request.params &&
          typeof request.params === 'object' &&
          'includeVendors' in request.params &&
          request.params.includeVendors
        ) {
          graph.nodes.push({
            id: 'vendor:sample',
            name: 'vendor-sample',
            root: 'vendor/sample',
            kind: 'vendor',
            ecosystem: 'cargo',
            manifest: 'vendor/sample/Cargo.toml',
            external: true,
            targets: [],
            features: [],
          });
        }
      }
      return response;
    };
  });
  await page.getByRole('link', { name: 'Architecture', exact: true }).click();
  await page.getByRole('button', { name: 'Refresh graph', exact: true }).click();
  await expect(page.getByLabel('Component categories')).toContainText('Packages');
  await expect(page.getByLabel('Component categories')).toContainText('Dependencies / vendors');
  await expect(page.locator('.react-flow__node')).toHaveCount(2);
  await page.getByLabel('Package scope').selectOption('all');
  await expect(page.locator('.react-flow__node')).toHaveCount(3);
  await expect(page.locator('.react-flow__node.component-dependency')).toHaveCount(1);
  await page.getByLabel('Parse vendor folders').check();
  await expect(page.locator('.react-flow__node')).toHaveCount(4);
  await page.getByLabel('Package scope').selectOption('dependencies');
  await expect(page.locator('.react-flow__node')).toHaveCount(2);
  await page.getByLabel('Filter components').fill('vendor-sample');
  await expect(page.locator('.react-flow__node')).toHaveCount(1);
  await page.locator('.react-flow__node').click();
  await expect(page.getByLabel('Component inspector')).toContainText('vendor/sample/Cargo.toml');
  await page.getByLabel('Parse vendor folders').uncheck();
  await expect(page.locator('.react-flow__node')).toHaveCount(0);
});
