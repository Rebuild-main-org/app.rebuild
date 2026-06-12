// Capture the 4 report figures from the running app with Playwright.
//
//   node scripts/capture-figures.mjs
//
// Env (with defaults):
//   BASE_URL       http://localhost:3000
//   TEST_EMAIL     demo-admin@rebuild.local
//   TEST_PASSWORD  (required)
//   WS_ID          ws_acme        (seed workspace)
//   PROJ_ID        p_acme_web     (seed project)
//
// Output: report/figures/{kanban,git-cicd,crm}.png plus two realtime candidates
// (realtime-chat.png, realtime-analytics.png) — the operator picks the best one
// for realtime.png. Viewport 1440x900 @2x, forced LIGHT theme. Each capture is
// isolated: one failure doesn't abort the others; a summary prints at the end.

import { chromium } from "playwright"
import { mkdirSync } from "node:fs"
import path from "node:path"

const BASE_URL = (process.env.BASE_URL || "http://localhost:3000").replace(/\/$/, "")
const EMAIL = process.env.TEST_EMAIL || "demo-admin@rebuild.local"
const PASSWORD = process.env.TEST_PASSWORD || ""
const WS = process.env.WS_ID || "ws_acme"
const PROJ = process.env.PROJ_ID || "p_acme_web"
const OUT = path.resolve("report/figures")

if (!PASSWORD) {
  console.error("TEST_PASSWORD is required (the seeded test user's password).")
  process.exit(1)
}
mkdirSync(OUT, { recursive: true })

// Wait for a page to be visually settled: DOM ready + a key element + a fixed
// pause for data hydration and GSAP intro animations. NOT networkidle — the app
// holds an SSE connection (/api/events) open, so networkidle never fires.
async function settle(page, { selector = "main", pause = 2200 } = {}) {
  await page.waitForLoadState("domcontentloaded")
  try {
    await page.waitForSelector(selector, { state: "visible", timeout: 15000 })
  } catch {
    /* fall through — capture whatever rendered */
  }
  await page.waitForTimeout(pause)
}

const figures = [
  {
    file: "kanban.png",
    url: `/workspace/${WS}/projects/${PROJ}/board`,
    fullPage: false,
  },
  {
    file: "git-cicd.png",
    url: `/workspace/${WS}/git`,
    fullPage: false,
  },
  {
    file: "crm.png",
    url: `/crm`,
    fullPage: false,
  },
  // Two candidates for the "realtime" figure — pick the most telling afterwards.
  {
    file: "realtime-chat.png",
    url: `/workspace/${WS}/chat`,
    fullPage: false,
  },
  {
    file: "realtime-analytics.png",
    url: `/analytics`,
    fullPage: true,
  },
]

const results = []

const browser = await chromium.launch()
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 2,
  colorScheme: "light",
})
// Force next-themes to LIGHT (its default storage key is "theme").
await context.addInitScript(() => {
  try {
    localStorage.setItem("theme", "light")
  } catch {
    /* ignore */
  }
})

const page = await context.newPage()

// --- Login (client-side supabase.auth.signInWithPassword) -------------------
try {
  await page.goto(`${BASE_URL}/login`, { waitUntil: "domcontentloaded" })
  await page.waitForSelector("#email", { timeout: 20000 })
  await page.fill("#email", EMAIL)
  await page.fill("#password", PASSWORD)
  await page.click('button[type="submit"]')
  await page.waitForURL("**/dashboard**", { timeout: 30000 })
  await settle(page, { pause: 1500 })
  console.log("✓ logged in")
} catch (e) {
  console.error("✗ login failed:", e.message)
  await page.screenshot({ path: path.join(OUT, "_login-debug.png") }).catch(() => {})
  await browser.close()
  process.exit(2)
}

// --- Capture each figure ----------------------------------------------------
for (const fig of figures) {
  try {
    await page.goto(`${BASE_URL}${fig.url}`, { waitUntil: "domcontentloaded" })
    await settle(page)
    const dest = path.join(OUT, fig.file)
    await page.screenshot({ path: dest, fullPage: !!fig.fullPage })
    results.push({ file: fig.file, url: fig.url, ok: true })
    console.log(`✓ ${fig.file}  ←  ${fig.url}`)
  } catch (e) {
    results.push({ file: fig.file, url: fig.url, ok: false, error: e.message })
    console.error(`✗ ${fig.file}  ←  ${fig.url}  :: ${e.message}`)
  }
}

await browser.close()

console.log("\n=== summary ===")
for (const r of results) console.log(`${r.ok ? "OK " : "FAIL"}  ${r.file}  (${r.url})${r.ok ? "" : " — " + r.error}`)
const failed = results.filter((r) => !r.ok)
process.exit(failed.length ? 3 : 0)
