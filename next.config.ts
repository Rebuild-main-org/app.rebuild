import type { NextConfig } from "next"

// Security headers (MUST-HAVE #2). Applied to every response. A strict CSP with
// nonces is intentionally omitted to avoid breaking Next's inline runtime; add
// it behind a nonce middleware when ready.
// Content-Security-Policy in REPORT-ONLY mode first (Sprint 3): it never blocks,
// only reports violations, so we can tighten toward enforcement safely. Monaco
// (IDE) needs blob workers and 'unsafe-eval'; Tailwind needs inline styles.
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self' https: wss:",
  "worker-src 'self' blob:",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ")

const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  { key: "Content-Security-Policy-Report-Only", value: csp },
]

const nextConfig: NextConfig = {
  // NOTE: `output: "standalone"` is intentionally omitted — Vercel packages
  // functions itself. (Historical bug: package.json declaring `"type":"module"`
  // made Node load Next's CommonJS-compiled `route.js`/`page.js` as ESM, so
  // Vercel's `___next_launcher.cjs` `require()` threw ERR_REQUIRE_ESM and 500'd
  // every route after login. Fixed by dropping `"type":"module"` from
  // package.json.) Add standalone back only for a Docker build, behind a flag.
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }]
  },
}

export default nextConfig
