import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? `http://localhost:${process.env.PORT ?? "3000"}`,
    trace: "on-first-retry",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: {
    command: process.env.PORT ? `PORT=${process.env.PORT} pnpm dev` : "pnpm dev",
    url: process.env.PLAYWRIGHT_BASE_URL ?? `http://localhost:${process.env.PORT ?? "3000"}`,
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
