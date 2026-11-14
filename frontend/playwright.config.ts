import { defineConfig, devices } from '@playwright/test';

const FRONTEND_URL = 'http://localhost:5173';
const API_HEALTH_URL = 'http://127.0.0.1:8000/api/health';
const isCI = Boolean(process.env.CI);

/**
 * Pruebas de navegador de extremo a extremo. Levanta (o reutiliza en local) la API y
 * el servidor de Vite. Requiere `make install` y `make install-browsers`.
 */
export default defineConfig({
  testDir: './e2e',
  outputDir: './test-results',
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  use: {
    baseURL: FRONTEND_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: [
    {
      command: '.venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000',
      cwd: '../backend',
      url: API_HEALTH_URL,
      env: { TERRALAB_ENVIRONMENT: 'development' },
      reuseExistingServer: !isCI,
      timeout: 30_000,
    },
    {
      command: 'npm run dev',
      url: FRONTEND_URL,
      reuseExistingServer: !isCI,
      timeout: 60_000,
    },
  ],
});
