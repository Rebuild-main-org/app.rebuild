// In-process pub/sub bus + presence tracking for realtime features.
//
// The spec runs a dedicated Socket.io server (port 3002). Here the platform is
// a single self-hosted Next.js process, so realtime is delivered over
// Server-Sent Events fed by this in-memory bus. Rooms are plain strings:
//   ws:<id> · project:<id> · ticket:<id> · user:<id>
// Swapping this for Socket.io later keeps emit() call sites unchanged.

export interface RealtimeEvent {
  type: string
  rooms: string[]
  payload?: unknown
  actorId?: string
  at: string
  originId?: string // instance that produced it (cross-instance dedupe)
}

// Unique per server instance — lets the realtime bridge ignore its own echoes.
const INSTANCE_ID =
  (globalThis as unknown as { __rebuildInstanceId?: string }).__rebuildInstanceId ??
  ((globalThis as unknown as { __rebuildInstanceId?: string }).__rebuildInstanceId =
    Math.random().toString(36).slice(2))

// Optional cross-instance publisher, installed by lib/realtime-bridge.ts when
// REALTIME_BRIDGE is configured. Lets emit() fan out beyond this process.
let bridgePublish: ((e: RealtimeEvent) => void) | null = null
export function setBridgePublisher(fn: ((e: RealtimeEvent) => void) | null) {
  bridgePublish = fn
}

interface Subscriber {
  id: string
  rooms: Set<string>
  send: (event: RealtimeEvent) => void
}

export interface Presence {
  userId: string
  name: string
  connId: string
  avatarUrl?: string
}

interface Bus {
  subscribers: Map<string, Subscriber>
  // room -> connId -> presence
  presence: Map<string, Map<string, Presence>>
  seq: number
}

const g = globalThis as unknown as { __rebuildBus?: Bus }
const bus: Bus =
  g.__rebuildBus ??
  (g.__rebuildBus = {
    subscribers: new Map(),
    presence: new Map(),
    seq: 0,
  })

export function emit(
  rooms: string | string[],
  type: string,
  payload?: unknown,
  actorId?: string
) {
  const roomList = Array.isArray(rooms) ? rooms : [rooms]
  const event: RealtimeEvent = {
    type,
    rooms: roomList,
    payload,
    actorId,
    at: new Date().toISOString(),
    originId: INSTANCE_ID,
  }
  emitLocal(event)
  bridgePublish?.(event)
}

// Fan an event out to local SSE subscribers only (no bridge re-publish). Used
// directly by the realtime bridge when relaying events from other instances.
export function emitLocal(event: RealtimeEvent) {
  if (event.originId && event.originId !== INSTANCE_ID && bridgePublish) {
    // came from another instance via the bridge — deliver locally, don't echo
  }
  for (const sub of bus.subscribers.values()) {
    if (event.rooms.some((r) => sub.rooms.has(r))) {
      sub.send(event)
    }
  }
}

export function subscribe(
  rooms: string[],
  send: (event: RealtimeEvent) => void
): { id: string; unsubscribe: () => void } {
  const id = `sub_${++bus.seq}`
  bus.subscribers.set(id, { id, rooms: new Set(rooms), send })
  return {
    id,
    unsubscribe: () => bus.subscribers.delete(id),
  }
}

// --- Presence ----------------------------------------------------------------

function presenceList(room: string): Presence[] {
  return Array.from(bus.presence.get(room)?.values() ?? [])
}

const PRESENCE_PREFIXES = ["ws:", "project:", "ide:"]

export function join(rooms: string[], who: Presence) {
  for (const room of rooms) {
    if (!PRESENCE_PREFIXES.some((p) => room.startsWith(p))) continue
    let map = bus.presence.get(room)
    if (!map) bus.presence.set(room, (map = new Map()))
    map.set(who.connId, who)
    emit(room, "presence", { room, users: dedupe(presenceList(room)) })
  }
}

export function leave(rooms: string[], connId: string) {
  for (const room of rooms) {
    const map = bus.presence.get(room)
    if (!map) continue
    if (map.delete(connId)) {
      emit(room, "presence", { room, users: dedupe(presenceList(room)) })
    }
  }
}

export function presenceFor(room: string): Presence[] {
  return dedupe(presenceList(room))
}

// Collapse multiple tabs/connections from the same user into one entry.
function dedupe(list: Presence[]): Presence[] {
  const seen = new Map<string, Presence>()
  for (const p of list) if (!seen.has(p.userId)) seen.set(p.userId, p)
  return Array.from(seen.values())
}
