// Cross-instance realtime bridge (MUST-HAVE #6).
//
// The local SSE bus (lib/events.ts) only reaches subscribers on THIS instance.
// In a multi-instance / multi-container deploy, an event emitted on instance A
// must also reach SSE clients connected to instance B. This bridge relays
// events over a Supabase Realtime broadcast channel.
//
// Enable with REALTIME_BRIDGE=supabase (requires the Supabase admin env). Call
// ensureRealtimeBridge() once where SSE connections are accepted. When the env
// is unset the app runs single-instance on the in-process bus (unchanged).
//
// Note: this fits long-running Node servers / containers. True serverless
// (per-request functions) cannot hold the connection — there, subscribe the
// browser directly to Supabase Realtime instead of our SSE endpoint.

import "server-only"
import type { RealtimeChannel } from "@supabase/supabase-js"
import { supabaseAdmin, adminConfigured } from "@/lib/supabase/admin"
import { emitLocal, setBridgePublisher, type RealtimeEvent } from "@/lib/events"

export function bridgeEnabled(): boolean {
  return process.env.REALTIME_BRIDGE === "supabase" && adminConfigured()
}

const g = globalThis as unknown as { __rebuildBridge?: RealtimeChannel | "init" }

export function ensureRealtimeBridge() {
  if (!bridgeEnabled() || g.__rebuildBridge) return
  g.__rebuildBridge = "init" // guard against re-entry while subscribing

  const channel = supabaseAdmin().channel("rebuild-events", {
    config: { broadcast: { self: false } },
  })

  channel
    .on("broadcast", { event: "evt" }, ({ payload }) => {
      // Relay events from OTHER instances into our local SSE subscribers.
      emitLocal(payload as RealtimeEvent)
    })
    .subscribe((status) => {
      if (status === "SUBSCRIBED") {
        g.__rebuildBridge = channel
        // Install the publisher so emit() fans out cross-instance.
        setBridgePublisher((event) => {
          channel.send({ type: "broadcast", event: "evt", payload: event })
        })
      }
    })
}
