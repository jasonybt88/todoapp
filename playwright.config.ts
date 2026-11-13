import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  testMatch: "**/*.spec.ts",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: "list",
  use: {
    baseURL: "http://localhost:3000",
    timezoneId: "Asia/Singapore",
    trace: "retain-on-failure",
    ...devices["Desktop Chrome"],
    launchOptions: {
      args: ["--enable-features=WebAuthentication"],
    },
  },
  webServer: {
    command: "npm run dev -- --hostname 127.0.0.1",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      AUTH_SECRET: "playwright-test-secret-must-be-at-least-32-bytes",
      RP_NAME: "Todo App",
      RP_ID: "localhost",
      RP_ORIGIN: "http://localhost:3000",
      DATABASE_PATH: ".data/playwright.sqlite",
    },
  },
});
