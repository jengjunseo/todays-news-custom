import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:3000",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "galaxy-like",
      use: { ...devices["Galaxy S9+"], viewport: { width: 412, height: 915 } },
    },
    {
      name: "small-android",
      use: { ...devices["Galaxy S9+"], viewport: { width: 360, height: 800 } },
    },
  ],
  webServer: {
    command: "pnpm dev",
    url: "http://127.0.0.1:3000",
    reuseExistingServer: true,
    env: { ...process.env, DEMO_MODE: "true" },
  },
});
