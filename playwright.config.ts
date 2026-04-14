import { defineConfig } from '@playwright/test';

const useExistingServer = process.env.E2E_USE_EXISTING_SERVER === '1';
const e2eBaseUrl = process.env.E2E_BASE_URL || 'http://127.0.0.1:5273';

export default defineConfig({
    testDir: './tests/e2e',
    fullyParallel: false,
    globalSetup: './tests/e2e/support/global-e2e-setup.ts',
    globalTeardown: './tests/e2e/support/global-e2e-teardown.ts',
    timeout: 60_000,
    expect: {
        timeout: 10_000
    },
    use: {
        baseURL: e2eBaseUrl,
        headless: true,
        trace: 'on-first-retry',
        launchOptions: {
            args: ['--enable-webgl', '--ignore-gpu-blocklist', '--use-angle=swiftshader']
        }
    },
    webServer: useExistingServer
        ? undefined
        : {
            command: 'npm run dev:e2e',
            url: 'http://127.0.0.1:3101/healthz',
            timeout: 180_000,
            reuseExistingServer: true
        }
});
