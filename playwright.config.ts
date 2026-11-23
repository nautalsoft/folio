import { defineConfig, devices } from '@playwright/test'

const port = Number(process.env.E2E_PORT || 3399)

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  use: { baseURL: `http://localhost:${port}`, locale: 'fr-FR', timezoneId: 'Europe/Paris' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 }, ...(process.env.CHROMIUM_PATH ? { launchOptions: { executablePath: process.env.CHROMIUM_PATH } } : {}) } },
    { name: 'mobile', use: { ...devices['Pixel 7'], ...(process.env.CHROMIUM_PATH ? { launchOptions: { executablePath: process.env.CHROMIUM_PATH } } : {}) } },
  ],
  webServer: {
    command: 'node .output/server/index.mjs',
    url: `http://localhost:${port}/api/health`,
    reuseExistingServer: false,
    env: { PORT: String(port), FOLIO_SCHEDULER: 'false', FOLIO_TIMEZONE: 'Europe/Paris' },
  },
})
