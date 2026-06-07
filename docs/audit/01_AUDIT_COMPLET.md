# 01 — Audit complet · REBUILD Engineering OS

> Audit factuel basé sur l'exploration du code (69 routes API, 31 pages, 22 modules `lib/`, 13 fichiers SQL, 3 suites de tests). Aucune hypothèse — chaque point est ancré dans un fichier réel.

## 0. Stack & architecture

| Couche | Choix |
|---|---|
| Framework | Next.js 16 (App Router, Turbopack), React 19, TypeScript |
| UI | Tailwind v4, shadcn/ui (radix-ui), lucide-react, sonner |
| Données | Supabase / PostgreSQL — `@supabase/ssr` (cookie auth) + service-role admin (`lib/supabase/admin.ts`) |
| Auth | Supabase Auth (email/password, magic link, Google OAuth) + table `profiles` (rôle) |
| Autorisation | RBAC centralisé `lib/auth.ts` + garde objet `lib/auth/guard.ts` (`requireWorkspace/Project/Ticket/...`) |
| IA | `@anthropic-ai/sdk`, `claude-opus-4-8`, adaptive thinking, structured outputs (`lib/ai.ts`) — **aucun fallback mock** |
| Git | `@octokit/rest` (`lib/github.ts`) + webhook HMAC |
| Temps réel | SSE + bus in-process (`lib/events.ts`) + pont Supabase Realtime (`lib/realtime-bridge.ts`) |
| Paiement | Stripe REST (`lib/stripe.ts`) + webhook signé |
| Email | Resend REST (`lib/email.ts`) | Slack webhook (`lib/slack.ts`) |
| Stockage | Supabase Storage (`lib/storage.ts`) avec repli base64 |
| Tests | Vitest (20 tests : RBAC, rate-limit, uploads) |
| Déploiement | Vercel (production live), env via dashboard |

**Modèle de données (PostgreSQL)** : `users`/`profiles`, `workspaces`, `workspace_members`, `projects`, `sprints`, `milestones`, `tickets` (+ `ticket_links`, `ticket_watchers`, `ticket_attachments`, `time_entries`, `custom_fields`, `ticket_field_values`), `comments`, `activities`, `git_commits`, `pull_requests` (+ `pr_reviews`, `pr_comments`), `deployments`, `branches`, `repo_files`, `notifications`, `messages`, `audit_logs`, `user_preferences`, `finance_docs`, `transactions`, `documents`, `meetings`, `leads`, `test_cases`/`test_runs`, `support_tickets`, `sprint_snapshots`.

---

## 1. Fonctionnalités TERMINÉES (implémentées + build-green)

### Authentification & comptes
- Login email/mot de passe, **magic link**, **OAuth Google**, logout (`/api/auth/logout`).
- **Inscription** avec confirmation email (trigger `handle_new_user`).
- **Mot de passe oublié / reset** (`/(auth)/reset`, `resetPasswordForEmail`).
- Middleware d'auth (redirection /login, 401 API, chemins publics).
- Réconciliation identité invité ↔ Auth au login (`reconcileInvitedUser`).

### RBAC & permissions
- 10 rôles (ADMIN, LEAD, PM, ENGINEER, QA, DESIGNER, SALES, FINANCE, SUPPORT, CLIENT).
- Matrice d'actions `can()` + tiers `roleAtLeast()`.
- **Autorisation au niveau objet** sur toutes les routes workspace-scoped (anti-IDOR) via `lib/auth/guard.ts`.

### Workspaces / projets / tickets
- CRUD workspaces, membres (invitation par email + email Resend), projets.
- Tickets : board Kanban (drag&drop, WIP, **recherche, filtres assigné/type/priorité, vues sauvegardées, bulk-edit, scroll par colonne**), backlog, list, timeline, dashboard.
- **Sous-tâches**, **liens** (blocks/relates/duplicates), **watchers**, **pièces jointes**, **commentaires éditables + @mentions**, **activité**.
- **Numérotation atomique** des tickets (`next_ticket_number` RPC + contrainte unique).
- **Sprints** : backlog, affectation, **vélocité**, **burndown** (snapshots), **ETA forecast** déterministe.
- **Time tracking** (saisie `1h30`/`90`, total, historique).
- **Champs personnalisés** (TEXT/NUMBER/SELECT/DATE) par projet.

### Git / CI / IDE
- Branches, commits, PR, **review ligne + approbations**, **merge gate (CI + approbation)**, déploiements.
- **Octokit réel** (commits/PR/branches/merge) quand `GITHUB_TOKEN` présent ; **miroir PR** Supabase pour cohérence review/merge.
- Webhook GitHub **HMAC-vérifié**.
- IDE web (Monaco, arbre fichiers, diff, commit) — `xterm` présent.

### IA (Claude)
- Copilot chat contextuel, **review de code** (structured), génération de **docs**, **résumés** projet/sprint.
- **Triage** ticket (type/priorité/assigné), **standup** quotidien, **changelog** depuis PR, **devis depuis lead CRM**, **scaffold projets+backlog depuis architecture.md**.

### CRM / Finance / Client
- Pipeline CRM (drag stages), **conversion lead→workspace complète** (projet initial, membre client, devis rattaché).
- Devis/factures/transactions, KPIs, **Stripe Checkout** + webhook PAID, **export PDF** (HTML imprimable).
- **Portail client** à **token signé HMAC** : progression, validation jalons, factures, chat.

### Collaboration / notifs / docs
- Chat workspace temps réel (SSE), présence.
- Notifications in-app + **email** (mentions/invites/PR/assign) + **Slack**.
- Documents (upload Storage/base64), **calendrier + meetings + export ICS**.

### QA / Support / Analytics / Admin
- QA : test cases + runs (Pass/Fail/Blocked/Skipped), dernier statut.
- Support : file + **SLA auto** par priorité, statuts.
- Analytics + **métriques DORA** (deploy freq, lead time, CFR, MTTR).
- Admin : finance, gestion users/rôles (propagée profiles+users), **page d'audit**.
- **Recherche globale ⌘K** (membership-scoped), **healthcheck** `/api/health`, **GDPR export** self.

---

## 2. Fonctionnalités PARTIELLES

| Fonctionnalité | État | Manque |
|---|---|---|
| Temps réel | SSE + bus in-process + pont Supabase | Sur Vercel serverless, SSE ne persiste pas → nécessite `REALTIME_BRIDGE=supabase` (sinon events perdus) |
| IDE | Monaco + diff + commit | Pas de LSP, terminal `xterm` non branché à un vrai shell, pas de multi-fichiers réel |
| Burndown | Table + endpoint capture + UI | **Nécessite un cron** quotidien (`POST /api/sprints/:id/snapshot`) — sinon vide |
| Stockage fichiers | Storage si `STORAGE_BUCKET`, sinon **base64 en DB** | Repli base64 non scalable ; pas d'antivirus/scan |
| i18n | Préférence `language` (en/fr/ar) stockée | **Aucune traduction câblée** — UI 100% en anglais |
| Notifications email | Resend best-effort | Pas de digest, pas de templates riches, pas de préférences fines |
| Multi-client portal | Token signé + résolution par `client_email` | Pas d'upload côté client, pas d'auth client dédiée |
| RLS Postgres | Policies présentes | **Mortes** (service-role bypass) — defense-in-depth absente |

---

## 3. Fonctionnalités CASSÉES / risques fonctionnels

| Élément | Problème | Réf |
|---|---|---|
| Intégrité inter-projets (audit G) | `sprint_id`/`milestone_id`/`epic_id`/`parent_id` non contraints au même projet | `schema.sql` |
| `requires_approval` (audit H) | Colonne existe mais **jamais consultée** — merge exige toujours une approbation | `merge/route.ts` |
| Ordre des migrations (audit J) | `documents.data_url NOT NULL` jusqu'à `storage.sql` → insert échoue si `STORAGE_BUCKET` posé avant la migration | `schema.sql`/`storage.sql` |
| RLS finance (audit L) | Policy `is_admin()` seule alors que RBAC = ADMIN+FINANCE | `schema.sql` |
| Bootstrap admin codé en dur | `azizghed10@gmail.com` → ADMIN dans le trigger | `auth.sql` |
| Suppression user | `auth.admin.deleteUser` supprime `profiles` mais laisse la ligne `users` (orpheline) | `admin/users/[id]` |

> Aucun crash bloquant en prod : build vert, healthcheck OK (`auth/ai/database configured/up`).

---

## 4. Problèmes transverses (détaillés dans 07/08/09)

- **Sécurité** : pas de MFA/2FA, rate-limit uniquement sur l'IA, pas de CSP stricte, RLS inactive, secrets corrects mais service-role à protéger.
- **Performance** : aucune pagination (listes chargées en entier), pas de cache, requêtes N+1 possibles (ex. `milestoneProgress` par milestone), pas de CDN d'assets custom.
- **Maintenabilité** : 20 tests unitaires seulement (pas d'e2e, pas de tests routes/guard d'intégration), pas de Docker/CI, pas de monitoring (Sentry), codemod SQL multi-fichiers à exécuter manuellement.
- **UX/UI** : pas de responsive mobile audité, pas d'états vides riches partout, pas de SEO (app interne), i18n non câblé.

---

## 5. Verdict

Produit **fonctionnellement très riche** (parité Jira/GitHub/CRM/Finance partielle très avancée), **déployé et build-green**, avec une **base de sécurité d'autorisation solide**. Les lacunes sont surtout **non-fonctionnelles** (tests, monitoring, perf/pagination, RLS, multi-tenant) et quelques **incohérences logiques mineures** (G/H/J/L). Voir 02 pour la matrice des manques et 03–05 pour les roadmaps.
