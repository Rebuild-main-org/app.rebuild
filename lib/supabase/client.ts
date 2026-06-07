"use client"

// Browser Supabase client (publishable/anon key) for auth flows in the UI.

import { createBrowserClient } from "@supabase/ssr"

export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anon) {
    throw new Error("Supabase public env vars are not set")
  }
  return createBrowserClient(url, anon)
}
