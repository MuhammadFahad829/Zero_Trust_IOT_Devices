const { test, expect } = require('@playwright/test');

test.describe('Devices page smoke', () => {
  test('shows skeleton then device list', async ({ page }) => {
    // Adjust the URL if your dev server serves at a different port
    await page.goto('http://localhost:3000');

    // Navigate to devices tab
    await page.click('button:has-text("Manage All Devices")');

    // Expect skeletons to be visible initially
    const skeleton = page.locator('.skeleton-row, .skeleton-card');
    await expect(skeleton.first()).toBeVisible({ timeout: 5000 });

    // Wait for device rows (either virtualized list or card grid)
    const deviceRow = page.locator('[data-testid="device-row"], .DeviceCard, .grid .DeviceCard');

    // Allow some time for WS or REST seeding in CI; fail if no devices appear
    await expect(deviceRow.first()).toBeVisible({ timeout: 15000 });

    // Basic interaction: click first device's Select button if present
    const selectBtn = page.locator('button[aria-label^="Select"]').first();
    if (await selectBtn.count() > 0) {
      await selectBtn.click();
    }

    // Smoke: ensure traffic metric exists in header
    await expect(page.locator('text=Live Traffic')).toBeVisible();
  });
});
