"use client"

import { useEffect, useLayoutEffect, useRef } from "react"

export interface RealtimeEvent {
  type: string
  rooms: string[]
  payload?: unknown
  actorId?: string
  at: string
}

// Subscribes to the SSE stream for the given rooms and invokes `onEvent` for
// each message. Reconnection is handled by the browser's EventSource.
export function useRealtime(
  rooms: string[],
  onEvent: (event: RealtimeEvent) => void
) {
  const handler = useRef(onEvent)
  useLayoutEffect(() => {
    handler.current = onEvent
  })
  const roomsKey = rooms.slice().sort().join(",")

  useEffect(() => {
    if (!roomsKey) return
    const url = `/api/events?rooms=${encodeURIComponent(roomsKey)}`
    const source = new EventSource(url)

    source.onmessage = (e) => {
      try {
        handler.current(JSON.parse(e.data) as RealtimeEvent)
      } catch {
        // ignore malformed frames
      }
    }
    // EventSource auto-reconnects; suppress noisy console errors on reconnect.
    source.onerror = () => {}

    return () => source.close()
  }, [roomsKey])
}
