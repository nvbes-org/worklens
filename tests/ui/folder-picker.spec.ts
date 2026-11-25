import { expect, type Page, test } from '@playwright/test';
import { seed } from './fixture';

async function picker(page: Page, selection: string | null, failure: string | null = null) {
  await seed(page);
  await page.reload();
  await page.evaluate(
    ({ selection, failure }) => {
      const transport = window.__WORKLENS_TRANSPORT__;
      const state = Object.assign(window, {
        isTauri: true,
        repositoryOpenCalls: [] as (string | null)[],
        dialogCalls: 0,
        __TAURI_INTERNALS__: {
          invoke: async (command: string) => {
            if (command !== 'plugin:dialog|open') throw new Error(`Unexpected command: ${command}`);
            state.dialogCalls += 1;
            if (failure) throw new Error(failure);
            return selection;
          },
        },
      });
      window.__WORKLENS_TRANSPORT__ = async (request) => {
        if (request.operation === 'open') state.repositoryOpenCalls.push(request.repository);
        if (!transport) throw new Error('Missing fixture transport');
        return transport(request);
      };
    },
    { selection, failure },
  );
}

for (const typedPath of ['', '/typed-but-not-submitted']) {
  test(`cancelling folder picker is silent with ${typedPath ? 'a typed path' : 'an empty path'}`, async ({
    page,
  }) => {
    await picker(page, null);
    await page.getByRole('textbox', { name: 'Repository path', exact: true }).fill(typedPath);
    await page.getByRole('button', { name: 'Browse folders' }).click();
    await expect.poll(() => page.evaluate(() => Reflect.get(window, 'dialogCalls'))).toBe(1);
    expect(await page.evaluate(() => Reflect.get(window, 'repositoryOpenCalls'))).toEqual([]);
    await expect(page.getByRole('alert')).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'See the whole picture.' })).toBeVisible();
  });
}

test('folder selection opens only the selected repository', async ({ page }) => {
  await picker(page, '/fixture');
  await page.getByRole('textbox', { name: 'Repository path', exact: true }).fill('/unsubmitted');
  await page.getByRole('button', { name: 'Browse folders' }).click();
  await expect(page.getByRole('heading', { name: 'fixture', exact: true })).toBeVisible();
  expect(await page.evaluate(() => Reflect.get(window, 'repositoryOpenCalls'))).toEqual(['/fixture']);
});

test('genuine folder picker failures remain visible', async ({ page }) => {
  await picker(page, null, 'No such file or directory (os error 2)');
  await page.getByRole('button', { name: 'Browse folders' }).click();
  await expect(page.getByRole('alert')).toContainText('No such file or directory');
});

test('repository connection failure appears once and clears after recovery', async ({ page }) => {
  await picker(page, '/fixture');
  await page.evaluate(() => {
    const transport = window.__WORKLENS_TRANSPORT__;
    let failed = false;
    window.__WORKLENS_TRANSPORT__ = async (request) => {
      if (!failed && request.operation === 'open') {
        failed = true;
        return { version: 1, data: null, error: 'Connection refused (os error 61)' };
      }
      if (!transport) throw new Error('Missing transport');
      return transport(request);
    };
  });
  await page.getByRole('button', { name: 'Browse folders' }).click();
  await expect(page.getByRole('alert')).toHaveCount(1);
  await expect(page.getByRole('alert')).toContainText('Connection refused');
  await page.getByRole('button', { name: 'Browse folders' }).click();
  await expect(page.getByRole('heading', { name: 'fixture', exact: true })).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('recent workspaces with long names truncate and show tooltip on hover', async ({ page }) => {
  await page.addInitScript(() => {
    Reflect.set(window, '__RECENT_OVERRIDE__', [
      { name: 'nvbes', path: '/Users/shayn/Development/nvbes' },
      { name: 'nvbes', path: '/Users/shayn/.codex/worktrees/1146/nvbes' },
      {
        name: 'frontend_experience_audit_suite_very_long_project_name_exceeding_max_width',
        path: '/Users/shayn/.gemini/antigravity/worktrees/nvbes/frontend_experience_audit_suite',
      },
      {
        name: 'trust-risk-service-v0',
        path: '/Users/shayn/.config/superpowers/worktrees/nvbes/trust-risk-service-v0',
      },
      { name: 'worklens', path: '/Users/shayn/Development/worklens' },
    ]);
  });
  await picker(page, null);
  await expect(page.getByRole('heading', { name: 'See the whole picture.' })).toBeVisible();
  await expect(page.getByText('Recent workspaces')).toBeVisible();

  const row = page.getByRole('button', { name: /frontend_experience_audit_suite/ });
  await expect(row).toBeVisible();
  await row.hover();
  const tooltip = page.getByRole('tooltip');
  await expect(tooltip).toBeVisible();
  await expect(tooltip).toContainText(
    'frontend_experience_audit_suite_very_long_project_name_exceeding_max_width',
  );
});

test('live file watching reacts to file change event and displays live tracking status', async ({ page }) => {
  await seed(page);
  await page
    .getByRole('navigation', { name: 'Main navigation' })
    .getByRole('link', { name: 'Git', exact: true })
    .click();
  await expect(page.getByRole('heading', { name: 'Your working tree' })).toBeVisible();
  await expect(page.getByText('Live tracking')).toBeVisible();

  await page.evaluate(() => {
    window.dispatchEvent(
      new CustomEvent('worklens:file-change', {
        detail: [
          {
            path: '/fixture/src/new-feature.rs',
            relativePath: 'src/new-feature.rs',
            kind: 'created',
            timestamp: new Date().toISOString(),
          },
        ],
      }),
    );
  });

  const badge = page.getByText('Live tracking');
  await expect(badge).toBeVisible();
  await expect(badge).toHaveAttribute('title', /src\/new-feature\.rs/);
});
