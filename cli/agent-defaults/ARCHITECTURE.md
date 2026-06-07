# Architecture — the system you must respect

Defaults for a typical REBUILD web project. **The actual repo always wins** — if
what you read in the codebase differs from this, follow the codebase and update
your mental model. Use this to know *where things belong* so your changes stay
consistent.

## Shape (Next.js App Router)
- `app/` — routes. Server Components by default; `"use client"` only when a
  component needs state, effects, or browser APIs. Route handlers live in
  `app/api/**/route.ts`.
- `components/` — UI. `components/ui/` is the shadcn/ui primitive layer (don't
  fork it); feature components compose those primitives.
- `lib/` — the brains. Data access, auth, integrations, and **pure helpers** live
  here. Business rules belong in `lib/`, not in components or route handlers.

## Layering (respect the direction of dependencies)
```
Route / Server Component  →  lib/ (data, auth, mutations)  →  Supabase / GitHub / Anthropic
        UI components      →  lib/ helpers (pure)           (never the reverse)
```
- **Never** call Supabase, GitHub, or Anthropic directly from a component or a
  route handler. Go through the `lib/` function that owns that concern.
- Keep decision logic **pure and extracted** (e.g. auth gates, ticket numbering,
  merge gates) so it can be unit-tested without a DB. New non-trivial logic
  should be a pure function in `lib/` with a Vitest test.

## Data & auth
- All data flows through Supabase via the server client in `lib/`. **No mock,
  seed, or fallback data** — if a query fails, surface the error.
- Authorization is centralized: use the existing guard/RBAC helpers
  (`requireWorkspace`/`requireProject`, `can()`, role checks). **Never** inline a
  new permission check that bypasses them, and never weaken a guard to ship a
  feature.

## Conventions
- One responsibility per module; match the file's existing structure and naming.
- Server-only secrets stay server-only (never imported into client bundles).
- Realtime/notifications go through the existing event bus — don't invent a
  parallel mechanism.
- Before adding a new layer, pattern, or dependency: check whether the codebase
  already has one. Extend the existing pattern rather than introducing a rival.

## When a ticket touches architecture
- Keep the change within the established boundaries above.
- If a ticket genuinely requires a new boundary or pattern, note the decision in
  the ticket comment (what and why) so a human can review the architectural
  choice before it spreads.
