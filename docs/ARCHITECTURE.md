# REBUILD Engineering OS — Architecture, workflows & pages

> Document de référence interne. **Prose en français, identifiants/code en anglais.**
> Couvre : l'architecture globale, le modèle de données, la sécurité/RBAC, les
> intégrations, l'IA serveur, le CLI `rebuild216`, les workflows métier, puis le
> détail de **chaque page** et de chaque groupe de routes API.
>
> Plateforme : **Next.js 16** (App Router, React 19, RSC) · **Tailwind v4** +
> shadcn/ui · **Supabase** (Postgres + Auth, accès service-role) · **Vercel**
> (prod : `https://app.rebuild.tn`). Org GitHub par défaut : `Rebuild-main-org`.

---

## 1. Vue d'ensemble

REBUILD Engineering OS est la plateforme interne d'agence : elle réunit la
gestion de projet (workspaces → projets → tickets/sprints/milestones), le suivi
Git/CI réel via GitHub, un IDE web, le CRM (leads → devis → factures), le
support (helpdesk + SLA), la messagerie « Discord » (chat + appels LiveKit), les
analytics/DORA, et une couche IA (revue de code, triage, scaffold, copilote)
pilotable aussi en autonomie via le CLI **`rebuild216`** + son serveur **MCP**.

### Principes structurants

- **RSC d'abord.** Les pages sont des Server Components `async` qui lisent les
  données côté serveur ; l'interactivité est isolée dans des composants
  `"use client"`.
- **Service-role + autorisation applicative.** La couche données (`lib/data.ts`)
  utilise le client Supabase **service-role** qui *bypass la RLS*. L'autorisation
  n'est donc **pas** déléguée à la base : elle est portée par le code
  (`lib/auth.ts`, `lib/permissions.ts`, gardes dans les routes/pages).
- **Une seule source de vérité d'identité.** `getSessionUser()`
  (`lib/auth/session.ts`) lit l'utilisateur signé depuis les cookies Supabase et
  son rôle depuis `profiles`.
- **Intégrations réelles, dégradation propre.** GitHub/Stripe/LiveKit/Anthropic
  s'activent selon les variables d'environnement ; en leur absence le code
  *no-op* ou retombe sur les données Supabase, sans planter.

### Couches

| Couche | Emplacement | Rôle |
|---|---|---|
| Rendu / UI | `app/**/page.tsx`, `components/**` | RSC + îlots clients, shadcn/ui |
| Auth & RBAC | `lib/auth/*`, `lib/auth.ts`, `lib/permissions.ts`, `middleware.ts` | session, rôles, sections, garde anti-IDOR |
| Lecture données | `lib/queries.ts`, `lib/data.ts` (SEL + `sb()`) | sélecteurs Supabase, alias camelCase |
| Écriture données | `lib/mutations.ts`, routes `app/api/**` | mutations + allocation `shortId` |
| Intégrations | `lib/github.ts`, `lib/stripe.ts`, `lib/discord.ts`, `lib/vercel.ts`, `lib/email.ts`, `lib/slack.ts` | services externes |
| IA | `lib/ai.ts`, `lib/ai-usage.ts`, `prompts/**` | features modèle + gouvernance coût |
| CLI/Agent | `cli/rebuild216.mjs`, `cli/mcp-rebuild.mjs`, `cli/agent/**`, `agent_contracts/**` | livraison autonome & chat |

---

## 2. Modèle de données

Types canoniques dans [`lib/types.ts`](../lib/types.ts) ; les alias colonne
snake_case → camelCase sont dans `SEL` ([`lib/data.ts`](../lib/data.ts)).

**Hiérarchie principale :** `Workspace` (= client/espace) → `Project`
(`shortCode` sert de préfixe de ticket, ex. `ACME`) → `Ticket`. Un projet peut
appartenir à un `ProjectGroup`. Les tickets se relient via `TicketLink`
(`BLOCKS` / `RELATES` / `DUPLICATES`), s'organisent en `Sprint` et `Milestone`,
portent des `TimeEntry`, `Comment`, `TicketAttachment`, `CustomFieldValue`.

**Énumérations clés :**

- `ProjectStatus` : `PLANNING · ACTIVE · REVIEW · ON_HOLD · DONE · CANCELLED`
- `TicketStatus` : `BACKLOG · TODO · IN_PROGRESS · IN_REVIEW · DONE`
- `TicketType` : `TASK · BUG · FEATURE · REVIEW · EPIC · SPIKE · SUBTASK`
- `TicketPriority` : `CRITICAL · HIGH · MEDIUM · LOW` · `StoryPoints` : 1,2,3,5,8,13
- `SupportStatus` : `NEW · OPEN · PENDING · RESOLVED · CLOSED`
- `TestRunStatus` : `PASS · FAIL · BLOCKED · SKIPPED · UNTESTED`
- `DocStatus` (finance) : `DRAFT · SENT · ACCEPTED · PAID · REJECTED`

**Autres entités :** `User`, `WorkspaceMember`, `GitCommit`/`PullRequest`/
`Branch`/`Deployment` (miroir GitHub), `FinanceDoc` (devis/facture) + `Transaction`,
`Lead` (CRM), `SupportTicket`/`SupportComment`, `TestCase`/`TestRun`,
`Notification`, `Document`, `Meeting`, `AuditLog`, `SprintSnapshot`.

L'attribution du `shortId` (`<shortCode>-<n>`) est **serveur uniquement**
(`next_ticket_number`, [`lib/ticket-number.ts`](../lib/ticket-number.ts) /
`lib/mutations.ts`) — jamais inventée par un client ou un agent.

> Migrations SQL : `supabase/*.sql` (à appliquer à la main ; `all.sql` regroupe
> tout). Tables récentes : `user_ai_keys`, `cli_sessions`, `cli_tokens`,
> `section_permissions`, `ai_usage`, `project_groups`.

---

## 3. Authentification, RBAC & sécurité

### Session & middleware

- [`middleware.ts`](../middleware.ts) rafraîchit le cookie de session Supabase à
  chaque requête et redirige les non-authentifiés vers `/login`. Préfixes
  **publics** : `/login`, `/auth`, `/client`, `/api/auth`, `/api/webhooks`,
  `/api/health`, `/api/cron`, `/api/cli` (auth Bearer), `/cli` (distribution
  statique), assets.
- `getSessionUser()` renvoie `{ id, email, name, role, avatarUrl, githubUsername }`.
  Élévation *bootstrap* : `BOOTSTRAP_ADMINS` (→ ADMIN tant que le rôle stocké est
  encore le défaut ENGINEER) et `BOOTSTRAP_SUPER_ADMINS` + `admin@rebuild.tn`
  (→ SUPER_ADMIN).

### Rôles (`Role`)

`SUPER_ADMIN · ADMIN · LEAD · PM · ENGINEER · QA · DESIGNER · SALES · FINANCE ·
SUPPORT · CLIENT`.

### Deux mécanismes d'autorisation complémentaires

1. **Actions fines** — [`lib/auth.ts`](../lib/auth.ts) : `can(user, action)`
   contre une `MATRIX` (ex. `project.delete`, `pr.merge`, `billing.manage`,
   `billing.delete`, `admin.panel`, `crm.manage`, `support.resolve`,
   `notify.broadcast`…). **`SUPER_ADMIN` court-circuite tout** (`can` renvoie
   `true`). Helper `isAdmin(role)` = ADMIN ou SUPER_ADMIN.
   - *Exemple :* la suppression de devis/factures est gardée par
     `billing.delete: ["ADMIN"]` (donc ADMIN + SUPER_ADMIN, **pas** FINANCE).
2. **Sections de navigation** — [`lib/permissions.ts`](../lib/permissions.ts) :
   `canAccessSection(role, section)` / `sectionsAllowedFor(role)` sur les sections
   `dashboard · workspaces · crm · support · analytics · reports`, avec des
   défauts surchargeables par ligne dans `section_permissions` (réglés par le
   SUPER_ADMIN depuis l'admin). Gate **à la fois** le nav et la page.

### Autres garde-fous

- **Anti-IDOR / BOLA** : `lib/auth/guard.ts` centralise les gardes objet-niveau
  (le service-role bypass la RLS, donc l'autorisation objet vit ici).
- **En-têtes de sécurité** ([`next.config.ts`](../next.config.ts)) : `X-Frame-Options:
  DENY`, `X-Content-Type-Options: nosniff`, HSTS, `Permissions-Policy`, CSP en
  **Report-Only** (Monaco a besoin de `unsafe-eval`/blob workers).
- **Rate-limit** : `lib/ratelimit.ts`. **Audit** : `audit_logs` (page `/admin/audit`).
- **Déploiement Vercel** : ne **pas** mettre `output: "standalone"` ni
  `"type":"module"` dans `package.json` (sinon `ERR_REQUIRE_ESM` sur toutes les
  routes après login — voir mémoire projet).

---

## 4. Intégrations externes

| Service | Module | Activation | Usage |
|---|---|---|---|
| **GitHub** (Octokit) | `lib/github.ts` | `GITHUB_TOKEN` | repos, branches, commits, PR, reviews, merge, releases, CI (Actions), webhooks, lecture/écriture de fichiers (Contents API → IDE web), diff pour la revue IA |
| **Supabase** | `lib/supabase/*`, `lib/data.ts` | URL + clés | Auth (cookies) + Postgres (service-role) |
| **Anthropic** | `lib/ai.ts` | `ANTHROPIC_API_KEY` *ou* clé par-utilisateur | features IA serveur |
| **Stripe** | `lib/stripe.ts` | clés Stripe | checkout des factures, webhook paiement |
| **LiveKit** | `lib/discord.ts` | `LIVEKIT_*` | jetons d'appel audio/vidéo dans Discord |
| **Email/Slack** | `lib/email.ts`, `lib/slack.ts` | env | notifications sortantes |
| **Vercel** | `lib/vercel.ts` | — | infos de déploiement par workspace |

GitHub est central : `git_commits`/`pull_requests` ne sont remplis par le webhook
push que sur les repos qui le configurent ; sinon les vues lisent **en direct**
via Octokit (matching par login GitHub de l'utilisateur).

---

## 5. IA serveur

Toutes les features passent par `trackedCreate` ([`lib/ai.ts`](../lib/ai.ts)) qui
enveloppe chaque appel modèle et enregistre l'usage. Si l'utilisateur a connecté
sa propre clé Anthropic (« Connect with Claude », table `user_ai_keys`),
`trackedCreate` instancie un client sur **sa** clé et la gouvernance saute le
plafond budgétaire.

| Feature | Fonction | Déclencheur |
|---|---|---|
| Revue de code | `codeReview()` | route `ai/review`, flux PR |
| Génération de docs | `generateDocs()` | `ai/docs` |
| Copilote / chat | `chat()` | `ai/chat` |
| Triage de ticket | `triageTicket()` | `ai/triage` |
| Devis depuis lead | `quoteFromLead()` | CRM |
| Digest standup | `standupDigest()` | `ai/standup` |
| Changelog depuis PRs | `changelogFromPRs()` | `ai/changelog` |
| Résumé | `summarize()` | `ai/summary` |
| Plan/scaffold depuis architecture | `planFromArchitecture()` | `workspaces/[id]/scaffold` |

**Gouvernance** ([`lib/ai-usage.ts`](../lib/ai-usage.ts)) : contexte
`AsyncLocalStorage` (`withAi`, `recordAiUsage`, `currentApiKey`), table
`ai_usage` (feature/model/tokens/coût/workspace/projet), plafond budgétaire
par-utilisateur, agrégats (`aiUsageSummary`, `workspaceAiSpend`,
`estimationAccuracy`).

Les prompts sont versionnés sous [`prompts/`](../prompts) (+ schémas JSON dans
`prompts/_schemas/`) ; les contrats partagés agent/serveur sous
[`agent_contracts/`](../agent_contracts) (`TICKET_CONTRACT`, `PR_CONTRACT`,
`REVIEW_RUBRIC`, `DOMAIN_GLOSSARY`).

---

## 6. CLI `rebuild216` + MCP

`cli/rebuild216.mjs` est le binaire agent : il clone le repo du workspace, écrit
le contexte (`.rebuild/*.md` via `writeContext`), construit le system prompt
(`buildSystem`) et lance Claude Code avec le serveur MCP `cli/mcp-rebuild.mjs`
branché.

**Modes** : `run` (livraison autonome) · `chat` (multi-tours interactif) ·
`ops-fix` / `ops-conflict` (build/CI/merge).

**Outils MCP exposés** : `list_tickets`, `create_ticket` (backlog complet),
`update_ticket_status`, `add_comment`, `capture_screenshots`,
`upload_screenshot`. Côté serveur, les routes `app/api/cli/**` authentifient via
`userFromBearer` ([`lib/cli-auth.ts`](../lib/cli-auth.ts)).

**Jetons (no-expire).** Deux types de Bearer acceptés :
1. **CLI token longue durée** (préfixe `rbld_`) — créé par `/api/cli/login` et
   `/api/cli/token`, stocké **haché** dans `cli_tokens`, résolu directement vers
   un user : **n'expire pas** (indispensable pour les longues livraisons, ex.
   117 tickets). `rebuild216` le stocke en priorité et fait l'auto-upgrade d'une
   ancienne session JWT via `ensurePersistentToken`.
2. **JWT Supabase** (~1 h) — chemin legacy, avec refresh-sur-401 en secours.

---

## 7. Workflows métier détaillés

### 7.1 Cycle de vie d'un ticket

`BACKLOG → TODO → IN_PROGRESS → IN_REVIEW → DONE`. La transition vers `DONE` est
gardée côté serveur (`app/api/cli/ticket/route.ts`) : refusée hors
`IN_PROGRESS`/`IN_REVIEW`, et **parsing de la Definition of Done** — les cases
`- [ ] dod:<id>` non cochées (et non `N/A`) bloquent la clôture (409). Création
et déplacement émettent des `Activity`/`Notification` et peuvent lier un
`commitRef`/`branch`.

### 7.2 Livraison autonome (`rebuild216 run`)

1. Login → CLI token persistant.
2. `setupProject` : clone du repo, `writeContext` (tickets, contrats, skills,
   doctrine dans `.rebuild/`).
3. L'agent lit le backlog (`list_tickets`), implémente ticket par ticket, commit
   localement par changement (jamais de push direct selon la doctrine),
   met à jour les statuts et commente via MCP.
4. Les coûts IA du run sont enregistrés (`/api/cli/usage`).

### 7.3 Pull request, revue & merge

Ouverture/MAJ de PR (`ghOpenOrUpdatePR`), revue IA sur le diff
(`ghCompareDiff` → `codeReview`), protection de branche optionnelle
(`ghProtectMain` : review + « Build & Test » verts), merge
(`/api/git/[wsId]/prs/[number]/merge`, stratégie squash par défaut). CI = GitHub
Actions réels (`ghWorkflowRuns`, re-run/cancel). Le webhook
`/api/webhooks/github/[wsId]` mire commits/PR/CI dans Supabase.

### 7.4 CRM : lead → devis → facture → paiement

`Lead` (stages CRM) → génération de **devis** IA (`/api/crm/leads/[id]/quote`,
`quoteFromLead`) → `FinanceDoc` `kind:QUOTE` (`DEV-AAAA-NNN`). Acceptation →
**facture** `kind:INVOICE` (`FAC-AAAA-NNN`). Paiement via Stripe
(`/api/finance/[id]/checkout` + webhook `/api/webhooks/stripe` qui passe le doc
en `PAID`). PDF : `/api/finance/[id]/pdf`. Conversion du lead en delivery /
workspace : `/api/crm/leads/[id]/convert`. **Suppression** d'un devis/facture :
`DELETE /api/admin/finance/[id]`, réservé ADMIN/SUPER_ADMIN (`billing.delete`).

### 7.5 Support & SLA

Ticket helpdesk (`SupportStatus`, `slaDueAt`), visible par son demandeur ; le
staff (`support.view`) voit tout ; seul le `SUPER_ADMIN` peut résoudre
(`support.resolve`) et diffuser des avis (`notify.broadcast`).

### 7.6 Scaffold depuis architecture

`/api/workspaces/[id]/scaffold` : `preview:true` renvoie le plan
(`planFromArchitecture`) sans rien créer ; confirmation → crée projets + backlog.
UI en deux temps dans `components/workspace/architecture-import.tsx`.

### 7.7 Cron (burndown)

`GET /api/cron` (Vercel Cron, protégé par `CRON_SECRET`) capture un point de
burndown (`captureSprintSnapshot`) pour chaque sprint `ACTIVE`.

---

## 8. Cartographie des pages

Légende : **Route** · accès · données principales · composants clés.
Toutes les pages sous `(app)` passent par [`app/(app)/layout.tsx`](../app/(app)/layout.tsx)
(garde session + `AppShell` : sidebar nav, workspaces, notifications, i18n).

### 8.1 Auth & racine

| Route | Accès | Détail |
|---|---|---|
| `/` ([page](../app/page.tsx)) | public | redirige vers `/dashboard`. |
| `/login` ([page](../app/(auth)/login/page.tsx)) | public | connexion email/mot de passe + OAuth GitHub (gate membres de l'org). |
| `/reset` ([page](../app/(auth)/reset/page.tsx)) | session recovery | définit un nouveau mot de passe après le lien de récupération. |
| `/client/[token]` ([page](../app/client/[token]/page.tsx)) | token public | **portail client** : avancement projets, milestones, devis/factures — lecture seule, hors `AppShell`. |

### 8.2 Navigation globale

| Route | Accès | Données / rôle |
|---|---|---|
| `/dashboard` ([page](../app/(app)/dashboard/page.tsx)) | section `dashboard` (tous) | `myTickets`, `workspacesForUser`, `projectsForWorkspace`, `projectProgress` ; activité Git live (`ghUserCommitsSince`, `ghUserOpenPRs`) ; panneau **REBUILD — progression** (clients, projets par niveau, avancement moyen, stack technique) + indicateurs sprint. |
| `/workspaces` ([page](../app/(app)/workspaces/page.tsx)) | section `workspaces` (tous) | liste des espaces accessibles avec compteurs (projets, membres, tickets). |
| `/crm` ([page](../app/(app)/crm/page.tsx)) | `canAccessSection(crm)` (ADMIN/LEAD/PM/SALES) | leads + pipeline ; candidats à la conversion (non-CLIENT). |
| `/support` ([page](../app/(app)/support/page.tsx)) | tous (demandeur voit le sien ; staff voit tout) | `SupportView` ; `canResolve` = `support.resolve`. |
| `/analytics` ([page](../app/(app)/analytics/page.tsx)) | `canAccessSection(analytics)` (ADMIN/LEAD/PM) | `analytics()` (global + par ingénieur + par workspace) et `doraMetrics()`. |
| `/reports` ([page](../app/(app)/reports/page.tsx)) | `canAccessSection(reports)` (ADMIN/LEAD/PM) | rapports auto hebdo / sprint / release par workspace. |
| `/discord` ([page](../app/(app)/discord/page.tsx)) | tous | messagerie temps réel : DM, groupes, threads, réactions, présence, appels LiveKit. |
| `/rebuild216` ([page](../app/(app)/rebuild216/page.tsx)) | tous | guide CLI + commandes prêtes à coller pour les projets accessibles. |
| `/how-to-use` ([page](../app/(app)/how-to-use/page.tsx)) | tous | mode d'emploi de la plateforme. |
| `/profile` ([page](../app/(app)/profile/page.tsx)) | tous | identité, avatar, **Connect with Claude** (clé Anthropic perso), MFA, export RGPD. |
| `/settings` ([page](../app/(app)/settings/page.tsx)) | tous | préférences (thème, densité, langue, accent, disponibilité…). |
| `/admin` ([page](../app/(app)/admin/page.tsx)) | `admin.panel` (ADMIN/SUPER_ADMIN) | utilisateurs & rôles, permissions de sections, **Devis & factures** (création, changement de statut, **suppression** ADMIN/SUPER_ADMIN), charges & revenus, agents/agent-docs, usage IA, diffusion d'avis (SUPER_ADMIN). |
| `/admin/audit` ([page](../app/(app)/admin/audit/page.tsx)) | `admin.panel` | 1000 dernières lignes d'`audit_logs`. |

### 8.3 Espace de travail (`/workspace/[id]`)

| Route | Détail |
|---|---|
| `/workspace/[id]` ([page](../app/(app)/workspace/[id]/page.tsx)) | redirige vers `…/overview`. |
| `…/overview` ([page](../app/(app)/workspace/[id]/overview/page.tsx)) | tableau de bord de l'espace : projets, membres + charge (`activeWorkloadByUser`), commits/PR/déploiements. |
| `…/projects` ([page](../app/(app)/workspace/[id]/projects/page.tsx)) | projets groupés (`ProjectGroup`) avec avancement ; création/réorg. |
| `…/ide` ([page](../app/(app)/workspace/[id]/ide/page.tsx)) | IDE web (Monaco) sur le repo réel : `repoFiles`, branches, tickets ; édition via Contents API. |
| `…/git` ([page](../app/(app)/workspace/[id]/git/page.tsx)) | Git & CI/CD : branches, commits, PR (revue/merge), déploiements, état CI. |
| `…/chat` ([page](../app/(app)/workspace/[id]/chat/page.tsx)) | chat d'équipe de l'espace (`TeamChat`). |
| `…/documents` ([page](../app/(app)/workspace/[id]/documents/page.tsx)) | fichiers partagés (contrats, specs, assets). |
| `…/calendar` ([page](../app/(app)/workspace/[id]/calendar/page.tsx)) | agenda : échéances tickets, sprints, milestones, réunions (ICS). |
| `…/settings` ([page](../app/(app)/workspace/[id]/settings/page.tsx)) | membres + configuration de l'espace (repo, techno, portail client…). |

### 8.4 Projet (`/workspace/[id]/projects/[pid]`)

En-tête + onglets (`ProjectTabs`) via [le layout projet](../app/(app)/workspace/[id]/projects/[pid]/layout.tsx) ;
contrôle de statut éditable si `project.update`.

| Onglet / Route | Détail |
|---|---|
| `…/board` ([page](../app/(app)/workspace/[id]/projects/[pid]/board/page.tsx)) | **Kanban** par statut (drag&drop) ; suppression de ticket si ADMIN/LEAD. |
| `…/backlog` ([page](../app/(app)/workspace/[id]/projects/[pid]/backlog/page.tsx)) | backlog + affectation aux sprints. |
| `…/list` ([page](../app/(app)/workspace/[id]/projects/[pid]/list/page.tsx)) | vue tableau dense (type, priorité, statut, assigné). |
| `…/timeline` ([page](../app/(app)/workspace/[id]/projects/[pid]/timeline/page.tsx)) | milestones + % d'avancement. |
| `…/dashboard` ([page](../app/(app)/workspace/[id]/projects/[pid]/dashboard/page.tsx)) | burndown sprint, vélocité, forecast, répartition type/priorité. |
| `…/tests` ([page](../app/(app)/workspace/[id]/projects/[pid]/tests/page.tsx)) | QA : `TestCase`/`TestRun`, bug auto sur échec. |
| `…/docs` ([page](../app/(app)/workspace/[id]/projects/[pid]/docs/page.tsx)) | éditeur de doc projet (`DocEditor`). |
| `…/documents` ([page](../app/(app)/workspace/[id]/projects/[pid]/documents/page.tsx)) | fichiers du projet. |

---

## 9. Routes API (par domaine)

- **Auth/session** : `api/auth/me`, `api/auth/logout`, `api/health`.
- **CLI (Bearer)** : `api/cli/{login,refresh,token,context,projects,repos,status,integration,usage}`, `api/cli/ticket(/create)`, `api/cli/document(/[id])`.
- **Tickets** : `api/tickets/[id]` (+ `comments`, `links`, `time`, `watchers`, `fields`, `attachments`), `api/projects/[id]/{tickets,reorder,custom-fields,test-cases,forecast}`, `api/comments/[id]`, `api/attachments/[id]`, `api/sprints/[id]/snapshot`, `api/test-cases/[id]/runs`.
- **Workspaces/projets** : `api/workspaces(/[id])` (+ `projects`, `members`, `groups`, `messages`, `meetings`, `scaffold`, `agent`, `seed-ci`, `portal-link`), `api/projects/[id]`.
- **Git/CI** : `api/git/[wsId]/{tree,files,file,commit(s),diff,move,delete,branches,actions,releases,prs,scaffold-ci,vercel,ticket-link}` et sous-routes PR (`merge`, `reviews`, `comments`, `diff`).
- **IA** : `api/ai/{review,chat,docs,triage,summary,standup,changelog}`.
- **CRM/Finance** : `api/crm/leads(/[id])(/quote|/convert)`, `api/admin/finance(/[id])`, `api/admin/transactions(/[id])`, `api/finance/[id]/{pdf,checkout}`.
- **Support** : `api/support(/[id])(/comments)`.
- **Admin** : `api/admin/{users(/[id]),permissions,agents(/[id]/files),agent-docs,notify-role}`.
- **Discord** : `api/discord/{members,groups,threads(/[threadId]),dm/[userId],notes/[userId],relationships,reactions,search,unread,call-token,admin/threads}`, `api/presence`, `api/events`.
- **Divers** : `api/profile(/anthropic|/export)`, `api/notifications`, `api/search`, `api/reports`, `api/export`, `api/import/{leads,tickets}`, `api/documents(/[id])`, `api/cron`, `api/webhooks/{github/[wsId],stripe}`, `api/client/[token]/validate`.

---

## 10. Pour aller plus loin

- Contrats partagés agent/serveur : [`agent_contracts/`](../agent_contracts).
- Doctrine & skills de l'agent CLI : [`cli/agent/`](../cli/agent).
- Prompts versionnés : [`prompts/`](../prompts).
- Migrations base : [`supabase/`](../supabase) (`all.sql` = tout).
