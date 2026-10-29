import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI
    ? [
        ["github"],
        ["html", { open: "never" }],
        ["junit", { outputFile: "test-results/e2e.xml" }],
      ]
    : [["list"], ["html", { open: "never" }]],
  timeout: 45_000,
  use: {
    baseURL: "http://127.0.0.1:3012",
    ...(process.env.PLAYWRIGHT_CHANNEL
      ? { channel: process.env.PLAYWRIGHT_CHANNEL }
      : {}),
    headless: true,
    trace: "retain-on-failure",
  },
  webServer: {
    command: "npx tsx tests/browser-server.ts",
    url: "http://127.0.0.1:3012/api/config",
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
