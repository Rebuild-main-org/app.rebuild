// Auth middleware: refreshes the Supabase session cookie on every request and
// redirects unauthenticated users to /login. Public paths (login, OAuth
// callback, the client portal, auth/webhook APIs, static assets) are exempt.

import { NextResponse, type NextRequest } from "next/server"
import { createServerClient } from "@supabase/ssr"
import { rateLimitResponse } from "@/lib/ratelimit"

const PUBLIC_PREFIXES = [
  "/login",
  "/auth", // OAuth / magic-link callback
  "/client", // tokenised client portal
  "/api/auth",
  "/api/webhooks",
  "/api/health",
  "/api/cron",
  "/api/cli", // CLI uses Bearer-token auth, not cookies
  "/cli", // static CLI distribution (install.sh + sources)
  "/api/metrics", // Prometheus scrape — guarded by METRICS_TOKEN (Bearer), not cookies
]

function isPublic(pathname: string): boolean {
  return PUBLIC_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(p + "/")
  )
}

export async function middleware(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  // If Supabase isn't configured, send users to /login (which explains setup)
  // rather than silently exposing the app.
  const response = NextResponse.next({ request })
  if (!url || !anon) {
    const { pathname } = request.nextUrl
    if (isPublic(pathname)) return response
    if (pathname.startsWith("/api/"))
      return NextResponse.json({ error: "Supabase not configured" }, { status: 503 })
    return NextResponse.redirect(new URL("/login", request.url))
  }

  const supabase = createServerClient(url, anon, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (toSet) => {
        for (const { name, value } of toSet) request.cookies.set(name, value)
        for (const { name, value, options } of toSet)
          response.cookies.set(name, value, options)
      },
    },
  })

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl
  if (!user && !isPublic(pathname)) {
    // API routes get a JSON 401; pages get redirected to the login screen.
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    const redirect = new URL("/login", request.url)
    redirect.searchParams.set("next", pathname)
    return NextResponse.redirect(redirect)
  }
  // Already signed in and hitting /login → go to the dashboard.
  if (user && pathname === "/login") {
    return NextResponse.redirect(new URL("/dashboard", request.url))
  }

  // Global anti-abuse: cap authenticated write requests per user (the AI routes
  // keep their own stricter limit). Brute-forcing /login is handled by GoTrue.
  if (
    user &&
    pathname.startsWith("/api/") &&
    ["POST", "PATCH", "PUT", "DELETE"].includes(request.method)
  ) {
    const limited = rateLimitResponse(`api:${user.id}`, 120, 60_000)
    if (limited) return limited
  }

  return response
}

export const config = {
  matcher: [
    // Everything except Next internals and static files.
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
}
