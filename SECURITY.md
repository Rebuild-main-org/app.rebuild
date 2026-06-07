# Security

## Secrets & key rotation

- All secrets live in `.env.local` (git-ignored via `.env*`). **Never commit them.**
- The **service-role key** (`SUPABASE_SERVICE_ROLE_KEY`) bypasses RLS — treat it as a root credential. It is only ever read server-side (`lib/supabase/admin.ts`) and is never sent to the client or logged.
- **Rotate the service-role key now** if it has ever been pasted into a chat, PR, screenshot, or log: Supabase → Settings → API → *Reset service_role secret*, then update `.env.local` and your hosting provider's env vars.
- Other sensitive vars: `ANTHROPIC_API_KEY`, `GITHUB_TOKEN`, `GITHUB_WEBHOOK_SECRET`. Rotate on the provider if leaked.

## Authorization model (anti-IDOR)

The data layer uses the service-role client (RLS bypassed), so **object-level authorization is enforced in code** via `lib/auth/guard.ts`:

- `requireWorkspace(wsId, action?)` — caller must be a member of the workspace (ADMIN bypasses), and optionally satisfy an RBAC action.
- `requireProject / requireTicket / requireComment / requireAttachment / requireDocument` — resolve the owning workspace, then run the same guard.
- `requireAuth(action?)` — for global resources (admin, CRM, reports, profile).

Every workspace-scoped API route calls one of these. RBAC roles/actions are defined in `lib/auth.ts`.

## Controls in place

- **Auth**: Supabase Auth (cookie sessions); middleware redirects unauthenticated users and 401s API calls.
- **Rate limiting**: `lib/ratelimit.ts` (in-process sliding window) on AI routes. For a multi-instance deploy, back it with Upstash Redis — call sites stay identical.
- **Upload validation**: `lib/uploads.ts` enforces a 10 MB/file cap, max 20 files/request, and a MIME allow-list on document & attachment uploads.
- **Webhooks**: GitHub webhook is HMAC-verified (`GITHUB_WEBHOOK_SECRET`).
- **Security headers**: set in `next.config.ts` (X-Frame-Options, nosniff, Referrer-Policy, Permissions-Policy, HSTS).
- **Password reset & email confirmation**: handled via Supabase Auth (`/reset`, signup email confirmation). Ensure "Confirm email" is ON in Supabase → Auth → Providers → Email.

## Known follow-ups

- `DELETE /api/tickets/:id/links?linkId=` deletes by link id without re-resolving the owning workspace (low-risk residual IDOR) — resolve link → ticket → workspace before deleting.
- Move file storage out of Postgres to Supabase Storage (see `lib/storage.ts`) for production-scale uploads.
- Add a strict CSP with per-request nonces.
