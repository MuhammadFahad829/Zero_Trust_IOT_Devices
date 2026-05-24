const { test, expect } = require('@playwright/test');

test('homepage shows project title', async ({ page }) => {
  await page.goto('http://localhost:3000');
  await expect(page).toHaveTitle(/ZeroTrust|ZeroTrust IoT/i);
});
