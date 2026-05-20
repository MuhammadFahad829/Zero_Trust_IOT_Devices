const { test, expect } = require('@playwright/test');

test('segmentation set limit updates device limits', async ({ page, request }) => {
  // Ensure backend has devices to operate on
  const resp = await request.get('/devices');
  const data = await resp.json();
  if (!data?.devices || data.devices.length === 0) {
    test.skip('no devices available');
  }

  // Pick a small unique limit to apply
  const newLimit = 7;

  // Open the UI and enable dev-mode
  await page.goto('/');
  await page.evaluate(() => localStorage.setItem('devHotspot', '1'));
  await page.reload();

  // Navigate to Segmentation
  await page.click('button:has-text("Segmentation")');
  await page.waitForSelector('text=Set limit for current segment (MB)');

  // Fill the segment limit input (fallback if only one present)
  const inputs = await page.$$('input[placeholder="e.g., 500"]');
  if (inputs.length === 0) throw new Error('limit input not found');
  const target = inputs.length > 1 ? inputs[1] : inputs[0];
  await target.fill(String(newLimit));

  // Click apply and wait a short moment for backend processing
  await page.click('button:has-text("Apply to segment")');
  await page.waitForTimeout(800);

  // Verify via backend API that at least one device has the new limit
  const after = await request.get('/devices');
  const afterData = await after.json();
  const updated = afterData.devices.some((d) => Number(d.mb_limit) === newLimit);
  expect(updated).toBeTruthy();
});
