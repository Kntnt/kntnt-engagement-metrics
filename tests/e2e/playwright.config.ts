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
    command:
      'bun --eval "Bun.serve({ port: 3000, fetch(req) { const url = new URL(req.url); const file = url.pathname === \\"/\\" ? Bun.file(\\"tests/e2e/fixtures/test-page.html\\") : Bun.file(\\"packages/core/dist\\" + url.pathname); return new Response(file); } })"',
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
