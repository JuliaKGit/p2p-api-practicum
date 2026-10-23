import dotenv from 'dotenv';
import { defineConfig } from '@playwright/test';

dotenv.config();

const baseURL = process.env.API_BASE_URL ?? 'http://localhost:8000';

export default defineConfig({
  testDir: 'tests/api',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL,
  },
  webServer: {
    command: 'npm start',
    url: `${baseURL}/health`,
    reuseExistingServer: !process.env.CI,
  },
  projects: [
    {
      name: 'api-setup',
      testMatch: /reset\.setup\.ts/,
    },
    {
      name: 'api',
      dependencies: ['api-setup'],
    },
  ],
});
