import { defineConfig, devices } from '@playwright/test';

/**
 * E2E contra a aplicação de verdade: API + web + Postgres. O banco precisa ter "test" ou "e2e" no
 * nome porque o global-setup APAGA e recria os dados fictícios (mesma trava dos testes de integração).
 */
export const DATABASE_URL =
  process.env['E2E_DATABASE_URL'] ??
  process.env['TEST_DATABASE_URL'] ??
  'postgres://crm:crm@localhost:5432/crm_test';
const nomeDoBanco = DATABASE_URL.split('?')[0]?.split('/').pop() ?? '';
if (!/test|e2e/.test(nomeDoBanco))
  throw new Error(
    `Recusado: o banco do e2e deve ter "test" ou "e2e" no nome (atual: "${nomeDoBanco}")`,
  );

const PORTA_API = 3100;
const PORTA_WEB = 5174;

export default defineConfig({
  testDir: './tests',
  globalSetup: './global-setup.ts',
  // um worker só: os testes compartilham o mesmo banco
  workers: 1,
  fullyParallel: false,
  retries: process.env['CI'] ? 1 : 0,
  timeout: 30_000,
  expect: { timeout: 7_000 },
  reporter: process.env['CI'] ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://127.0.0.1:${PORTA_WEB}`,
    locale: 'pt-BR',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // permite usar um Chromium já instalado (ex.: PLAYWRIGHT_CHROMIUM_PATH=/caminho/chrome)
        launchOptions: process.env['PLAYWRIGHT_CHROMIUM_PATH']
          ? { executablePath: process.env['PLAYWRIGHT_CHROMIUM_PATH'] }
          : {},
      },
    },
  ],
  webServer: [
    {
      command: 'npm run dev -w @crm/api',
      cwd: '..',
      url: `http://127.0.0.1:${PORTA_API}/api/health`,
      reuseExistingServer: !process.env['CI'],
      timeout: 60_000,
      env: { DATABASE_URL, PORT: String(PORTA_API), NODE_ENV: 'development' },
    },
    {
      command: `npm run dev -w @crm/web -- --host 127.0.0.1 --port ${PORTA_WEB} --strictPort`,
      cwd: '..',
      url: `http://127.0.0.1:${PORTA_WEB}`,
      reuseExistingServer: !process.env['CI'],
      timeout: 60_000,
      env: { API_URL: `http://127.0.0.1:${PORTA_API}` },
    },
  ],
});
