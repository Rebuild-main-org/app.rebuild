// Test stub for the `server-only` package. The real package throws when loaded
// outside a React Server Component (its default export is a hard error), which
// breaks Vitest's node environment. Aliasing it here to an empty module lets us
// unit-test server libs (lib/tenant.ts, etc.) without pulling in the Next.js
// RSC runtime. See vitest.config.ts.
export {}
