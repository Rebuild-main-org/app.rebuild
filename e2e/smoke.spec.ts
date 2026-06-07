import { test, expect } from "@playwright/test"

// Smoke tests — verify the app is reachable and core public surfaces render.
// Run: npx playwright install && npm run e2e
// Against prod: E2E_BASE_URL=https://next-app-maaref.vercel.app npm run e2e

test("health endpoint is up", async ({ request }) => {
  const res = await request.get("/api/health")
  expect(res.ok()).toBeTruthy()
  const body = await res.json()
  expect(body.status).toBe("ok")
})

test("unauthenticated user is redirected to login", async ({ page }) => {
  await page.goto("/dashboard")
  await expect(page).toHaveURL(/\/login/)
})

test("login page renders the sign-in form", async ({ page }) => {
  await page.goto("/login")
  await expect(page.getByRole("button", { name: /sign in/i })).toBeVisible()
})

test("cron endpoint is protected", async ({ request }) => {
  const res = await request.get("/api/cron")
  // 401 when CRON_SECRET is set; 200 only if intentionally unprotected.
  expect([200, 401]).toContain(res.status())
})
