import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests",
  testMatch: "**/*.e2e.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  use: {
    baseURL: process.env.LIVE_URL || "http://127.0.0.1:5279",
    headless: true,
    viewport: { width: 1440, height: 1000 },
    launchOptions: process.env.CI
      ? {}
      : {
          executablePath:
            "C:/Program Files/Google/Chrome/Application/chrome.exe",
        },
    trace: "retain-on-failure",
  },
  reporter: [["list"], ["html", { open: "never" }]],
  webServer: process.env.LIVE_URL
    ? undefined
    : {
        command: "node scripts/serve.mjs",
        url: "http://127.0.0.1:5279",
        reuseExistingServer: !process.env.CI,
      },
});
