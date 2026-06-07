// Transactional email (SHOULD). Sends via Resend's REST API (no SDK dep).
// No-op when RESEND_API_KEY is unset, so the app runs without email configured.
//
// Env: RESEND_API_KEY, EMAIL_FROM (e.g. "REBUILD <noreply@app.rebuild.tn>"),
//      APP_URL (absolute base for links, e.g. https://app.rebuild.tn).

import "server-only"

export function emailEnabled(): boolean {
  return !!process.env.RESEND_API_KEY && !!process.env.EMAIL_FROM
}

export function appUrl(path = ""): string {
  const base = process.env.APP_URL?.replace(/\/$/, "") || "http://localhost:3000"
  return `${base}${path}`
}

interface SendInput {
  to: string
  subject: string
  html: string
}

// Best-effort send. Returns true if accepted by the provider, false otherwise.
export async function sendEmail({ to, subject, html }: SendInput): Promise<boolean> {
  if (!emailEnabled()) return false
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from: process.env.EMAIL_FROM, to, subject, html }),
    })
    return res.ok
  } catch {
    return false
  }
}

// Minimal branded wrapper so emails look consistent.
export function layout(title: string, body: string): string {
  return `<div style="font-family:system-ui,sans-serif;max-width:520px;margin:0 auto;padding:24px">
    <h2 style="margin:0 0 16px">${title}</h2>
    <div style="font-size:14px;line-height:1.6;color:#333">${body}</div>
    <hr style="margin:24px 0;border:none;border-top:1px solid #eee"/>
    <p style="font-size:12px;color:#999">REBUILD Engineering OS</p>
  </div>`
}
