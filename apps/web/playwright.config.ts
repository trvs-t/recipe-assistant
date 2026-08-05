import { defineConfig, devices } from '@playwright/test';

const demoBaseUrl: string = 'http://127.0.0.1:4173';
const recoveryBaseUrl: string = 'http://127.0.0.1:4174';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [
    ['list'],
    ['html', { open: 'never' }],
  ],
  use: {
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'demo-chromium',
      testMatch: /demo\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        baseURL: demoBaseUrl,
      },
    },
    {
      name: 'recovery-chromium',
      testMatch: /recovery\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        baseURL: recoveryBaseUrl,
      },
    },
    ...(process.env.LOCAL_E2E === 'true'
      ? [{
          name: 'local-supabase',
          testMatch: /local-durable\.spec\.ts/,
          use: {
            ...devices['Desktop Chrome'],
            baseURL: 'http://127.0.0.1:4175',
          },
        }]
      : []),
  ],
  webServer: [
    {
      command: 'pnpm exec vite --host 127.0.0.1 --port 4173 --strictPort',
      url: demoBaseUrl,
      reuseExistingServer: !process.env.CI,
      env: {
        VITE_SUPABASE_URL: '',
        VITE_SUPABASE_ANON_KEY: '',
      },
    },
    {
      command: 'pnpm exec vite --host 127.0.0.1 --port 4174 --strictPort',
      url: recoveryBaseUrl,
      reuseExistingServer: !process.env.CI,
      env: {
        VITE_SUPABASE_URL: 'https://supabase.test',
        VITE_SUPABASE_ANON_KEY: 'e2e-anon-key',
      },
    },
    ...(process.env.LOCAL_E2E === 'true'
      ? [{
          command: 'pnpm exec vite --host 127.0.0.1 --port 4175 --strictPort',
          url: 'http://127.0.0.1:4175',
          reuseExistingServer: false,
        }]
      : []),
  ],
});
