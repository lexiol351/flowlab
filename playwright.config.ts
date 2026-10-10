import { existsSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { defineConfig, devices } from '@playwright/test';

/** Locate a Playwright-bundled Chromium binary, if one was installed. */
function findBundledChromium(): boolean {
  const dir = join(homedir(), '.cache', 'ms-playwright');
  if (!existsSync(dir)) return false;
  for (const entry of readdirSync(dir)) {
    if (
      existsSync(join(dir, entry, 'chrome-headless-shell-linux64', 'chrome-headless-shell')) ||
      existsSync(join(dir, entry, 'chrome-linux', 'chrome'))
    ) {
      return true;
    }
  }
  return false;
}

// Local dev VMs may not have Playwright's bundled Chromium (its CDN download
// can be blocked); fall back to the system Chromium when the bundle is absent.
// CI installs the bundled build via `npx playwright install --with-deps chromium`.
const SYSTEM_CHROME = '/opt/meta-chromium/chrome';
const chromeExecutablePath =
  process.env.CHROME_EXECUTABLE_PATH ??
  (findBundledChromium() || !existsSync(SYSTEM_CHROME) ? undefined : SYSTEM_CHROME);

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://127.0.0.1:4173/flowlab/',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    launchOptions: {
      ...(chromeExecutablePath ? { executablePath: chromeExecutablePath } : {}),
      // The sandbox routes external traffic through an egress proxy; the app
      // under test is served on localhost, so bypass the proxy entirely.
      args: ['--no-proxy-server'],
    },
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  // E2E runs against the real production build (the same bits GitHub Pages serves).
  webServer: {
    command: 'npm run build && npx vite preview --port 4173 --strictPort --host 127.0.0.1',
    url: 'http://127.0.0.1:4173/flowlab/',
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
