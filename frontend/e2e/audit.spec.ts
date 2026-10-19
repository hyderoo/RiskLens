import { test, expect } from '@playwright/test';
const routes = ['/', '/transactions', '/analytics', '/scoring', '/model', '/explain', '/exposure', '/monitoring', '/cases', '/reports', '/methodology'];
// Start the API and frontend with the full scored warehouse before running.
for (const width of [320, 390, 768, 1024, 1280, 1440]) {
  for (const theme of ['light', 'dark']) {
    test(`all pages fit ${width}px ${theme}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.addInitScript((t) => localStorage.setItem('theme', t), theme);
      const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
      for (const route of routes) {
        await page.goto(route);
        await expect(page.locator('h1')).toBeVisible();
        await page.waitForLoadState('networkidle');
        await expect(page.locator('[data-slot="skeleton"]')).toHaveCount(0, {timeout:90000});
        await expect(page.locator('[role="status"][aria-label="Loading"]')).toHaveCount(0, { timeout: 90000 });
        await expect(page.locator('[role="alert"]').filter({ hasText: /\S/ })).toHaveCount(0);
        await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
        if (route === '/') {
          const metrics = page.locator('.kpi-value'); await expect(metrics).toHaveCount(6);
          for (const metric of await metrics.all()) expect(await metric.evaluate(e => e.scrollWidth <= e.clientWidth + 1)).toBe(true);
        }
      }
      expect(errors).toEqual([]);
    });
  }
}
test('mobile menu supports Escape and returns focus', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); await page.goto('/');
  const menu = page.getByRole('button', { name: 'Open navigation' }); await menu.click();
  await expect(page.getByRole('dialog')).toBeVisible(); await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0); await expect(menu).toBeFocused();
});
test('invalid IDs do not leave stale transaction results', async ({ page }) => {
  await page.goto('/transactions'); await expect(page.locator('tbody tr').first()).toBeVisible();
  await page.getByRole('textbox', { name: 'Transaction ID', exact: true }).fill('1.5');
  await expect(page.getByRole('alert').filter({hasText:/\S/})).toContainText('numbers only'); await expect(page.locator('tbody tr')).toHaveCount(0);
});
