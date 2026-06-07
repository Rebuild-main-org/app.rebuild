# Multi-tenancy & GDPR (FUTURE)

## GDPR — implemented

- **Right of access**: `GET /api/profile/export` returns a JSON export of all data tied to the signed-in user (profile, preferences, tickets reported/assigned, comments, time entries, memberships). Exposed as **Profile → Privacy → Download my data**.
- **Right to erasure** (recommended next step): add `DELETE /api/admin/users/:id` that anonymises rather than hard-deletes — set `users.name = 'Deleted user'`, null the email, and keep foreign keys intact so history (commits, audit) stays consistent. Hard-deleting cascades and corrupts audit trails.

## Multi-tenancy — recommended approach (not yet applied)

The platform is currently **single-tenant** (one organisation). Going multi-tenant is a schema-wide change best done as one planned migration, not piecemeal:

1. **Add `organizations` + `org_id`**: create an `organizations` table; add a nullable `org_id` to every top-level table (`workspaces`, `users`, `leads`, `finance_docs`, …). Backfill existing rows to a default org, then set `NOT NULL`.
2. **Scope the session**: resolve the caller's `org_id` once in `getSessionUser()` and thread it through `lib/auth/guard.ts` — every `requireWorkspace`/`requireAuth` also asserts `row.org_id === user.orgId`.
3. **Enforce at the DB**: because the app uses the service-role client (RLS bypassed), the org check must live in the guard. If you switch reads to the user-cookie client, add RLS policies `using (org_id = auth.jwt() ->> 'org_id')` for defence-in-depth.
4. **Storage & search**: prefix Storage paths with `org_id`; add `org_id` to `globalSearch` filters.
5. **Billing**: scope Stripe customers/subscriptions per org.

This is deferred deliberately: applying it half-way (some tables scoped, some not) is worse than staying single-tenant. Do it as a dedicated migration with the backfill above.

## AI agents (FUTURE) — live endpoints

The AI agent layer is built on `lib/ai.ts` (Claude `claude-opus-4-8`, adaptive thinking, JSON-schema structured outputs):

| Capability | Endpoint | Notes |
|---|---|---|
| Ticket triage (type/priority/assignee) | `POST /api/ai/triage` | roster + open-load aware |
| Daily standup | `POST /api/ai/standup` | 24h commits + ticket states |
| Changelog from merged PRs | `POST /api/ai/changelog` | grouped release notes |
| Quote from a CRM lead | `POST /api/crm/leads/:id/quote` | saves a DRAFT quote |
| Delivery ETA forecast | `GET /api/projects/:id/forecast` | deterministic, velocity-based |

A **daily cron** can call `/api/ai/standup` per active workspace and post the digest to Slack (`lib/slack.ts`), and `/api/sprints/:id/snapshot` to accumulate burndown.
