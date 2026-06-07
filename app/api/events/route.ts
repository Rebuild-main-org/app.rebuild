import { randomUUID } from "crypto"

import { getSessionUser } from "@/lib/auth/session"
import {
  type RealtimeEvent,
  emit,
  join,
  leave,
  presenceFor,
  subscribe,
} from "@/lib/events"
import { ensureRealtimeBridge } from "@/lib/realtime-bridge"

export const dynamic = "force-dynamic"

// GET /api/events?rooms=ws:x,project:y,user:z — Server-Sent Events stream.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const rooms = (searchParams.get("rooms") ?? "")
    .split(",")
    .map((r) => r.trim())
    .filter(Boolean)
  const user = await getSessionUser()
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 })
  ensureRealtimeBridge()
  const connId = `conn_${randomUUID().slice(0, 8)}`
  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    start(controller) {
      const write = (event: RealtimeEvent) => {
        try {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(event)}\n\n`)
          )
        } catch {
          // controller already closed
        }
      }

      const { unsubscribe } = subscribe(rooms, write)

      // Initial handshake + presence snapshot for room views.
      write({ type: "connected", rooms, at: new Date().toISOString() })
      for (const room of rooms) {
        if (
          room.startsWith("ws:") ||
          room.startsWith("project:") ||
          room.startsWith("ide:")
        ) {
          write({
            type: "presence",
            rooms: [room],
            payload: { room, users: presenceFor(room) },
            at: new Date().toISOString(),
          })
        }
      }
      join(rooms, { userId: user.id, name: user.name, connId, avatarUrl: user.avatarUrl })

      // Keepalive comment every 25s so proxies don't drop the connection.
      const ping = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`: ping\n\n`))
        } catch {
          // ignore
        }
      }, 25_000)

      const close = () => {
        clearInterval(ping)
        leave(rooms, connId)
        unsubscribe()
        try {
          controller.close()
        } catch {
          // already closed
        }
      }

      request.signal.addEventListener("abort", close)
    },
  })

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  })
}

// POST /api/events — broadcast an ephemeral event (e.g. IDE cursor position).
export async function POST(request: Request) {
  const user = await getSessionUser()
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 })
  const { rooms, type, payload } = (await request.json()) as {
    rooms: string[]
    type: string
    payload?: unknown
  }
  if (!rooms?.length || !type) {
    return Response.json({ error: "rooms and type required" }, { status: 400 })
  }
  // Only ephemeral collaboration events are allowed over this path.
  if (!["cursor", "typing"].includes(type)) {
    return Response.json({ error: "unsupported event type" }, { status: 400 })
  }
  emit(rooms, type, payload, user.id)
  return Response.json({ ok: true })
}
