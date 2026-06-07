// Slack integration (COULD). Posts a message to an incoming webhook. No-op when
// SLACK_WEBHOOK_URL is unset. Best-effort: never throws into the caller.

import "server-only"

export function slackEnabled(): boolean {
  return !!process.env.SLACK_WEBHOOK_URL
}

export async function notifySlack(text: string): Promise<boolean> {
  if (!slackEnabled()) return false
  try {
    const res = await fetch(process.env.SLACK_WEBHOOK_URL as string, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    })
    return res.ok
  } catch {
    return false
  }
}
