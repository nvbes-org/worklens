import { expect, test } from '@playwright/test';
import { seed } from './fixture';

test.describe('Managed Window System', () => {
  test.beforeEach(async ({ page }) => {
    await seed(page);
    await page.goto('/');
  });

  test('creates, detaches, re-attaches, and duplicates managed windows', async ({ page }) => {
    // 1. Open Instance Dock and create a new window
    const instanceDockTrigger = page.getByTestId('instance-dock-trigger');
    await expect(instanceDockTrigger).toBeVisible();
    await instanceDockTrigger.click();

    const newWindowBtn = page.getByTestId('btn-new-window');
    await expect(newWindowBtn).toBeVisible();
    await newWindowBtn.click();

    // Verify floating window is rendered
    const floatingWindow = page.locator('[data-window-floating="true"]');
    await expect(floatingWindow).toBeVisible();

    // 2. Test Always-On-Top toggle
    const pinBtn = floatingWindow.getByTestId('btn-toggle-always-on-top');
    await expect(floatingWindow).toHaveAttribute('data-always-on-top', 'false');
    await pinBtn.click();
    await expect(floatingWindow).toHaveAttribute('data-always-on-top', 'true');
    await expect(floatingWindow.getByTestId('badge-always-on-top')).toBeVisible();

    // Toggle off
    await pinBtn.click();
    await expect(floatingWindow).toHaveAttribute('data-always-on-top', 'false');

    // 3. Test Detach and Reattach (Docking)
    const toggleDockBtn = floatingWindow.getByTestId('btn-toggle-dock');
    // Currently floating -> Dock it into main interface
    await toggleDockBtn.click();

    const dockedWindow = page.locator('[data-window-docked="true"]');
    await expect(dockedWindow).toBeVisible();
    await expect(floatingWindow).toHaveCount(0);

    // Re-detach it back to floating
    const detachBtn = dockedWindow.getByTestId('btn-toggle-dock');
    await detachBtn.click();
    await expect(page.locator('[data-window-floating="true"]')).toBeVisible();

    // 4. Test Duplication
    const duplicateBtn = page
      .locator('[data-window-floating="true"]')
      .first()
      .getByTestId('btn-duplicate-window');
    await duplicateBtn.click();

    // We now have 2 floating windows
    await expect(page.locator('[data-window-floating="true"]')).toHaveCount(2);
  });

  test('closes visually but keeps instance active in background (RAM)', async ({ page }) => {
    // 1. Create a new window
    await page.getByTestId('instance-dock-trigger').click();
    await page.getByTestId('btn-new-window').click();

    const win = page.locator('[data-window-floating="true"]');
    await expect(win).toBeVisible();

    // 2. Hide window in background
    const hideBtn = win.getByTestId('btn-inner-hide');
    await hideBtn.click();

    // Window is no longer rendered visually on screen
    await expect(page.locator('[data-window-floating="true"]')).toHaveCount(0);

    // 3. Instance dock displays 1 hidden background instance
    await page.getByTestId('instance-dock-trigger').click();
    await expect(page.getByTestId('badge-hidden-count')).toHaveText('1');

    // 4. Restore window from instance dock
    const restoreBtn = page.locator('[data-testid^="btn-restore-"]').first();
    await expect(restoreBtn).toBeVisible();
    await restoreBtn.click();

    // Window is restored and visible
    await expect(page.locator('[data-window-floating="true"]')).toBeVisible();
  });

  test('freezes instance, swaps memory to hard disk, and restores state from disk', async ({ page }) => {
    // 1. Create a new window
    await page.getByTestId('instance-dock-trigger').click();
    await page.getByTestId('btn-new-window').click();

    const win = page.locator('[data-window-floating="true"]');
    await expect(win).toBeVisible();

    // 2. Type secret working data into the editor
    const editor = win.getByTestId('input-instance-text');
    await editor.fill('Données sensibles sauvegardées sur le disque dur...');

    // 3. Freeze instance to disk
    const freezeBtn = win.getByTestId('btn-inner-freeze');
    await freezeBtn.click();

    // Visual window is unmounted and RAM freed
    await expect(page.locator('[data-window-floating="true"]')).toHaveCount(0);

    // 4. Check instance dock shows frozen badge
    await page.getByTestId('instance-dock-trigger').click();
    await expect(page.getByTestId('badge-frozen-count')).toHaveText('1');

    // Verify localStorage contains the swapped disk payload
    const diskEntries = await page.evaluate(() => {
      const keys = Object.keys(localStorage).filter((k) => k.startsWith('worklens:window-disk-swap:'));
      return keys.map((k) => localStorage.getItem(k));
    });
    expect(diskEntries.length).toBeGreaterThan(0);
    expect(diskEntries[0]).toContain('Données sensibles sauvegardées sur le disque dur...');

    // 5. Restore frozen window from disk
    const restoreBtn = page.locator('[data-testid^="btn-restore-"]').first();
    await restoreBtn.click();

    // 6. Verify restored window has exact same persisted data
    const restoredWin = page.locator('[data-window-floating="true"]');
    await expect(restoredWin).toBeVisible();
    await expect(restoredWin.getByTestId('input-instance-text')).toHaveValue(
      'Données sensibles sauvegardées sur le disque dur...',
    );
  });

  test('terminates session and completely cleans up memory and disk', async ({ page }) => {
    // 1. Create window
    await page.getByTestId('instance-dock-trigger').click();
    await page.getByTestId('btn-new-window').click();

    const win = page.locator('[data-window-floating="true"]');
    await expect(win).toBeVisible();

    // 2. Terminate session via close menu
    await win.getByTestId('btn-close-menu-trigger').click();
    await page.getByTestId('option-close-terminate').click();

    // Window destroyed
    await expect(page.locator('[data-window-floating="true"]')).toHaveCount(0);

    // Dock shows 0 instances
    await page.getByTestId('instance-dock-trigger').click();
    await expect(page.getByText('Aucune instance de fenêtre active.')).toBeVisible();
  });

  test('detaches window to native OS window and re-attaches across windows via BroadcastChannel', async ({
    context,
    page,
  }) => {
    // 1. Create a new window in main app
    await page.getByTestId('instance-dock-trigger').click();
    await page.getByTestId('btn-new-window').click();

    const win = page.locator('[data-window-floating="true"]');
    await expect(win).toBeVisible();

    // 2. Detach to native OS window
    const detachNativeBtn = win.getByTestId('btn-detach-native');
    await expect(detachNativeBtn).toBeVisible();
    await detachNativeBtn.click();

    // In main app, the in-page floating node is hidden since it was detached
    await expect(page.locator('[data-window-floating="true"]')).toHaveCount(0);

    // Retrieve the saved detached instance ID from localStorage
    const detachedId = await page.evaluate(() => {
      const key = Object.keys(localStorage).find((k) => k.startsWith('worklens:detached:'));
      return key ? key.replace('worklens:detached:', '') : null;
    });
    expect(detachedId).toBeTruthy();

    // 3. Open the detached native OS window in a second page (simulating Tauri WebviewWindow)
    const nativePage = await context.newPage();
    await nativePage.goto(`/?detachedWindowId=${encodeURIComponent(detachedId ?? '')}`);

    // Verify native chrome and OS badge rendered
    const nativeWin = nativePage.getByTestId(`native-window-view-${detachedId}`);
    await expect(nativeWin).toBeVisible();
    await expect(nativePage.getByText('Natif OS')).toBeVisible();

    // 4. Test Always-On-Top in native window
    const pinBtn = nativePage.getByTestId('native-btn-toggle-always-on-top');
    await pinBtn.click();
    await expect(nativePage.getByTestId('native-badge-always-on-top')).toBeVisible();

    // 5. Test Re-attach from native window back into main application
    const reattachBtn = nativePage.getByTestId('native-btn-reattach');
    await reattachBtn.click();

    // Verify main page receives the broadcast and docks the window into the main workspace
    await expect(page.locator('[data-window-docked="true"]')).toBeVisible({ timeout: 5000 });

    await nativePage.close();
  });

  test('moves terminal tabs and buttons into the window header (docked and native detached)', async ({
    context,
    page,
  }) => {
    // 1. Open fixture repository to enter workspace
    await page.getByRole('button', { name: 'fixture /fixture' }).click();

    // 2. Open AuroraTerm from toolbar
    const terminalTrigger = page.getByTestId('toolbar-btn-terminal');
    await expect(terminalTrigger).toBeVisible();
    await terminalTrigger.click();

    // 2. Verify window is docked and has terminal tabs and buttons in the window header
    const dockedWin = page.locator('[data-window-docked="true"]');
    await expect(dockedWin).toBeVisible();

    const header = dockedWin.getByTestId('window-header');
    await expect(header).toBeVisible();

    // Header contains the terminal tabs ("page du terminal")
    const headerTabs = header.getByTestId('terminal-header-tabs');
    await expect(headerTabs).toBeVisible();
    await expect(headerTabs.getByRole('tab')).toHaveCount(1);
    await expect(headerTabs.getByText('zsh')).toBeVisible();

    // Header contains the terminal action buttons
    const headerActions = header.getByTestId('terminal-header-actions');
    await expect(headerActions).toBeVisible();
    await expect(headerActions.getByTestId('terminal-btn-split-right')).toBeVisible();
    await expect(headerActions.getByTestId('terminal-btn-toolbelt')).toBeVisible();

    // 3. Click new tab button in the header
    const newTabBtn = header.getByTestId('terminal-btn-new-tab');
    await expect(newTabBtn).toBeVisible();
    await newTabBtn.click();

    // Now there are 2 tabs in the header
    await expect(headerTabs.getByRole('tab')).toHaveCount(2);

    // 4. Detach to native OS window
    const detachNativeBtn = header.getByTestId('btn-detach-native');
    await expect(detachNativeBtn).toBeVisible();
    await detachNativeBtn.click();

    // Retrieve detached instance ID
    const detachedId = await page.evaluate(() => {
      const key = Object.keys(localStorage).find((k) => k.startsWith('worklens:detached:'));
      return key ? key.replace('worklens:detached:', '') : null;
    });
    expect(detachedId).toBeTruthy();

    // 5. Open in native window view
    const nativePage = await context.newPage();
    await nativePage.goto(`/?detachedWindowId=${encodeURIComponent(detachedId ?? '')}`);

    const nativeWin = nativePage.getByTestId(`native-window-view-${detachedId}`);
    await expect(nativeWin).toBeVisible();

    const nativeHeader = nativePage.getByTestId('native-window-header');
    await expect(nativeHeader).toBeVisible();

    // Native header contains tabs and action buttons directly
    const nativeHeaderTabs = nativeHeader.getByTestId('terminal-header-tabs');
    await expect(nativeHeaderTabs).toBeVisible();
    await expect(nativeHeaderTabs.getByRole('tab')).toHaveCount(2);

    const nativeHeaderActions = nativeHeader.getByTestId('terminal-header-actions');
    await expect(nativeHeaderActions).toBeVisible();
    await expect(nativeHeaderActions.getByTestId('terminal-btn-split-right')).toBeVisible();

    // Split pane via header action button
    await nativeHeaderActions.getByTestId('terminal-btn-split-right').click();
    await expect(nativeWin.locator('.aurora-pane')).toHaveCount(2);

    await nativePage.close();
  });
});
