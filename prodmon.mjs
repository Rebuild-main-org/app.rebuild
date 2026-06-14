import { chromium } from "playwright"
const BASE = "https://app.rebuild.tn"
const DEADLINE = Date.now() + 12 * 60 * 1000 // give up after 12 min
const browser = await chromium.launch()

async function checkOnce() {
  // Fresh context each time so Vercel skew-protection can't pin us to the old deploy.
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const p = await ctx.newPage()
  try {
    await p.goto(BASE + "/login", { waitUntil: "domcontentloaded" })
    await p.waitForSelector("#email", { state: "visible" })
    await p.waitForTimeout(2000)
    await p.type("#email", "admin@rebuild.tn", { delay: 12 })
    await p.type("#password", "Rebuild!2026", { delay: 12 })
    await p.click("button[type=submit]")
    await p.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 25000 })
    await p.waitForTimeout(1200)
    const cls = await p.evaluate(() => document.querySelector("aside > div:first-child")?.className ?? "")
    return cls.includes("shrink-0") && cls.includes("md:px-6")
  } catch {
    return false
  } finally {
    await ctx.close()
  }
}

let live = false
let n = 0
while (Date.now() < DEADLINE) {
  n++
  live = await checkOnce()
  console.log(`[check ${n}] ${new Date().toISOString()} newCodeLive=${live}`)
  if (live) break
  await new Promise((r) => setTimeout(r, 40000)) // 40s between checks
}
await browser.close()
console.log(live ? "✅ DEPLOY LIVE on app.rebuild.tn (shrink-0 logo header present)" : "⏱️ TIMED OUT — new code not detected within 12 min")
