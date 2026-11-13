import { defineConfig, devices } from "@playwright/test";

const port = process.env.PLAYWRIGHT_PORT ?? "3000";
const baseURL = `http://localhost:${port}`;

export default defineConfig({
  testDir: "./tests",
  testMatch: "**/*.spec.ts",
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: "list",
  use: {
    baseURL,
    timezoneId: "Asia/Singapore",
    trace: "retain-on-failure",
    ...devices["Desktop Chrome"],
    launchOptions: {
      args: ["--enable-features=WebAuthentication"],
    },
  },
  webServer: {
    command: `npm run dev -- --webpack --hostname 127.0.0.1 --port ${port}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      AUTH_SECRET: "playwright-test-secret-must-be-at-least-32-bytes",
      RP_NAME: "Todo App",
      RP_ID: "localhost",
      RP_ORIGIN: baseURL,
      DATABASE_PATH: ".data/playwright.sqlite",
    },
  },
});
