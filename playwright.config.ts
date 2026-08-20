import { defineConfig, devices } from '@playwright/test'

// Puerto 3000 = pnpm dev (vite). Puerto 8888 = npm run staging:local (netlify dev).
// Playwright arranca pnpm dev si el server no está corriendo ya.
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000'
const SUPABASE_URL = process.env.PLAYWRIGHT_SUPABASE_URL || 'http://127.0.0.1:54321'
const ANON_KEY = process.env.PLAYWRIGHT_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'

export { BASE_URL, SUPABASE_URL, ANON_KEY }

export default defineConfig({
  testDir: './tests/visual',
  outputDir: './artifacts/visual/results',
  reporter: [
    ['html', { outputFolder: './artifacts/visual/report', open: 'never' }],
    ['list'],
  ],
  webServer: {
    command: 'pnpm dev',
    url: BASE_URL,
    reuseExistingServer: true,
    timeout: 30_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
  use: {
    baseURL: BASE_URL,
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    trace: 'on-first-retry',
    locale: 'es-PY',
    timezoneId: 'America/Asuncion',
  },
  projects: [
    {
      name: 'chromium-desktop',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 900 },
      },
    },
    {
      name: 'chromium-mobile',
      use: {
        ...devices['iPhone SE'],
        browserName: 'chromium',
      },
    },
    {
      name: 'chromium-reduced',
      use: {
        ...devices['Desktop Chrome'],
        browserName: 'chromium',
        viewport: { width: 600, height: 900 },
      },
    },
  ],
  timeout: 30_000,
  retries: 1,
})
