// Cookie-bound Supabase client for Server Components and Route Handlers.
// Uses the publishable/anon key; RLS applies to whatever the signed-in user
// (carried in the auth cookies) is allowed to see.

import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

export function supabaseConfigured(): boolean {
  return !!(URL && ANON)
}

export async function createClient() {
  if (!URL || !ANON) {
    throw new Error(
      "Supabase is not configured — set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY"
    )
  }
  const store = await cookies()
  return createServerClient(URL, ANON, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (toSet) => {
        try {
          for (const { name, value, options } of toSet) {
            store.set(name, value, options)
          }
        } catch {
          // called from a Server Component render — cookie writes are handled
          // by the middleware refresh instead; safe to ignore here.
        }
      },
    },
  })
}
