import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: '.',
  testMatch: '*.spec.ts',
  timeout: 60_000,
  use: {
    baseURL: 'http://localhost:3000',
    headless: true,
    viewport: { width: 800, height: 300 },
  },
  webServer: {
    command: 'bun run tests/e2e/server.ts',
    port: 3000,
    cwd: process.cwd(),
    reuseExistingServer: !process.env.CI,
  },
  projects: [
    {
      name: 'chromium',
      use: { browserName: 'chromium' },
    },
  ],
})
