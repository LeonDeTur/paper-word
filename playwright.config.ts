import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 45_000,
  use: {
    baseURL: "http://127.0.0.1:3012",
    channel: "chrome",
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
