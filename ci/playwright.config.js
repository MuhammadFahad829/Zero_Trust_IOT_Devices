const { devices } = require('@playwright/test');

/** @type {import('@playwright/test').PlaywrightTestConfig} */
module.exports = {
  timeout: 30 * 1000,
  use: {
    headless: true,
  },
  webServer: {
    command: 'npx serve -s frontend/build -l 3000',
    port: 3000,
    reuseExistingServer: false,
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } }
  ]
};
/** @type {import('@playwright/test').PlaywrightTestConfig} */
module.exports = {
  testDir: '../../frontend/e2e/tests',
  timeout: 30 * 1000,
  expect: { timeout: 5000 },
  fullyParallel: false,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://127.0.0.1:5000',
    headless: true,
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
  ],
};
