import { defineConfig, devices } from "@playwright/test"

// E2E config. Run with: npx playwright install && npm run e2e
// BASE_URL defaults to the local dev server; set it to a deployed URL to smoke
// test production.
const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3000"

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  retries: process.env.CI ? 1 : 0,
  use: { baseURL, trace: "on-first-retry" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  // Spin up the app for local runs (skip if E2E_BASE_URL points elsewhere).
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : { command: "npm run start", url: baseURL, reuseExistingServer: !process.env.CI, timeout: 120_000 },
})
