import { defineConfig, devices } from "@playwright/test";
import { PORT } from "./env";

// One server for the whole run (see global-setup.ts); tests share its data, so they run one at a time.
export default defineConfig({
  testDir: "./tests",
  globalSetup: "./global-setup.ts",
  workers: 1,
  fullyParallel: false,
  timeout: 120_000,
  expect: { timeout: 15_000 },
  retries: process.env.CI ? 1 : 0,
  forbidOnly: Boolean(process.env.CI),
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : [["list"]],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    locale: "fi-FI",
    timezoneId: "Europe/Helsinki",
    trace: "retain-on-failure",
    screenshot: "only-on-failure"
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 900 },
        // E2E_CHANNEL=msedge (or chrome) uses an installed browser instead of Playwright's Chromium.
        channel: process.env.E2E_CHANNEL || undefined,
        // Software WebGL so the three.js views render on machines without a GPU (CI).
        launchOptions: { args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] }
      }
    }
  ]
});
