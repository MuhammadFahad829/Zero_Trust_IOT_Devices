const { test, expect } = require('@playwright/test');

test('homepage has no critical a11y violations', async ({ page }) => {
  await page.goto('http://localhost:3000');
  // inject axe from installed package
  await page.addScriptTag({ path: require.resolve('axe-core/axe.min.js') });
  const result = await page.evaluate(async () => await axe.run());
  // Fail if any violations with impact 'critical' or 'serious'
  const bad = result.violations.filter(v => v.impact === 'critical' || v.impact === 'serious');
  if (bad.length > 0) {
    console.log('Accessibility violations:', JSON.stringify(bad, null, 2));
  }
  expect(bad.length).toBe(0);
});
