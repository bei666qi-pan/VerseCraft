import { defineConfig, devices } from "@playwright/test";

const defaultWebServerCommand =
  process.env.AI_PROVIDER === "mock" ? "pnpm exec next start -p 666" : "pnpm dev";

// Skip Playwright's webServer when a dev server is already running locally.
// Set PLAYWRIGHT_NO_WEB_SERVER=1 to disable, or PLAYWRIGHT_WEB_SERVER_COMMAND to override.
const skipWebServer = process.env.PLAYWRIGHT_NO_WEB_SERVER === "1";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 1,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://[::1]:666",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        ...(process.env.PLAYWRIGHT_BROWSER_CHANNEL ? { channel: process.env.PLAYWRIGHT_BROWSER_CHANNEL } : {}),
      },
    },
  ],
  ...(skipWebServer
    ? {}
    : {
        webServer: {
          command: process.env.PLAYWRIGHT_WEB_SERVER_COMMAND ?? defaultWebServerCommand,
          url: process.env.PLAYWRIGHT_BASE_URL ?? "http://[::1]:666",
          reuseExistingServer: !process.env.CI,
          timeout: 180_000,
          env: { ...process.env },
        },
      }),
});
