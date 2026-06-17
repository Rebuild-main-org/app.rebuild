# REBUILD Engineering OS — Architecture, workflows & référence des pages

> **Document de référence interne — destiné à l'export.** Self-contained : la
> prose porte toute l'information (les liens relatifs sont un bonus).
> **Prose en français, identifiants/code en anglais.**
>
> Couvre : architecture, arborescence, variables d'environnement, modèle de
> données complet, sécurité/RBAC, intégrations, IA serveur, CLI `rebuild216`/MCP,
> workflows métier, **détail de chaque page**, **chaque route API** (méthode +
> autorisation + comportement), modules `lib/`, migrations et exploitation.

---

## Table des matières

1. [Vue d'ensemble](#1-vue-densemble)
2. [Stack & arborescence](#2-stack--arborescence)
3. [Variables d'environnement](#3-variables-denvironnement)
4. [Modèle de données](#4-modèle-de-données)
5. [Authentification, RBAC & sécurité](#5-authentification-rbac--sécurité)
6. [Intégrations externes](#6-intégrations-externes)
7. [IA serveur](#7-ia-serveur)
8. [CLI `rebuild216` + MCP](#8-cli-rebuild216--mcp)
9. [Workflows métier](#9-workflows-métier)
10. [Référence des pages](#10-référence-des-pages)
11. [Référence des routes API](#11-référence-des-routes-api)
12. [Modules `lib/`](#12-modules-lib)
13. [Migrations & exploitation](#13-migrations--exploitation)

---

## 1. Vue d'ensemble

REBUILD Engineering OS est la plateforme interne d'agence. Elle réunit :

- **Gestion de projet** : `Workspace` (client/espace) → `Project` → `Ticket`,
  avec sprints, milestones, backlog, Kanban, vélocité, burndown, forecast.
- **Git & CI/CD réels** via GitHub (Octokit) : branches, commits, PR, revues,
  merge, releases, GitHub Actions, webhooks.
- **IDE web** (Monaco) qui édite le repo réel via la Contents API.
- **CRM** : leads → devis → factures → paiement (Stripe) → conversion.
- **Support** : helpdesk avec statuts et SLA.
- **Discord** : messagerie temps réel (DM, groupes, threads, réactions,
  présence) + appels audio/vidéo (LiveKit).
- **Analytics / DORA** et **rapports** auto (hebdo / sprint / release).
- **Couche IA** : revue de code, triage, scaffold, copilote, résumés,
  changelog — pilotable en autonomie via le CLI **`rebuild216`** et son
  serveur **MCP**.

### Principes structurants

- **RSC d'abord.** Les pages sont des Server Components `async` lisant les
  données côté serveur ; l'interactivité est isolée dans des composants
  `"use client"`.
- **Service-role + autorisation applicative.** `lib/data.ts` utilise le client
  Supabase **service-role**, qui *bypass la RLS*. L'autorisation n'est donc pas
  portée par la base mais par le code (`lib/auth.ts`, `lib/permissions.ts`,
  gardes dans les pages et les routes).
- **Identité = une seule source.** `getSessionUser()` lit l'utilisateur signé
  (cookies Supabase) et son rôle depuis `profiles`.
- **Intégrations optionnelles, dégradation propre.** Chaque service externe
  s'active selon ses variables d'env ; sinon le code *no-op* ou retombe sur
  Supabase, sans planter.
- **i18n** : `en` / `fr` / `ar` (`lib/i18n.ts`). La langue **sauvegardée**
  (préférences DB) fait foi côté serveur ; le cookie `rebuild_lang` n'est qu'un
  chemin rapide de bascule.
- **Préférences appliquées au chargement.** `PreferencesApplier` applique le
  thème sauvegardé dans next-themes au montage (sinon un thème « Dark » stocké
  n'était jamais appliqué) ; le bouton thème (topbar) et le raccourci `d`
  persistent le choix en base (`persistTheme`).

---

## 2. Stack & arborescence

**Stack** : Next.js 16 (App Router, React 19, RSC, Turbopack) · TypeScript ·
Tailwind v4 + shadcn/ui · Supabase (Postgres + Auth) · déploiement Vercel
(`https://app.rebuild.tn`) · GSAP (animations) · Monaco (IDE) · Octokit ·
Stripe · LiveKit · Anthropic SDK · MCP SDK.

```
next-app/
├─ app/
│  ├─ (auth)/            login, reset                — public
│  ├─ (app)/             surface authentifiée (layout = AppShell)
│  │  ├─ dashboard, workspaces, crm, support, analytics, reports,
│  │  │  discord, rebuild216, how-to-use, profile, settings, admin
│  │  └─ workspace/[id]/ overview, projects/[pid]/*, ide, git, chat,
│  │                     documents, calendar, settings
│  ├─ client/[token]/    portail client (hors AppShell, accès par token)
│  └─ api/               ~125 route handlers (voir §11)
├─ components/           UI : layout, projects, git, discord, admin, profile…
├─ lib/                  logique métier (voir §12)
├─ prompts/              prompts IA versionnés (+ _schemas/*.json)
├─ agent_contracts/      contrats partagés agent ↔ serveur
├─ cli/                  rebuild216.mjs, mcp-rebuild.mjs, agent/ (doctrine+skills)
├─ supabase/             migrations SQL (all.sql = tout)
├─ public/cli/           distribution statique du CLI (install.sh/ps1)
└─ docs/                 ce document + docs/agents
```

---

## 3. Variables d'environnement

| Variable | Rôle | Si absente |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Auth (cookies, client navigateur) | app non fonctionnelle |
| `SUPABASE_SERVICE_ROLE_KEY` | Couche données service-role (bypass RLS) | toute page authentifiée 500 (`sb()` throw) |
| `DATABASE_URL` | Connexion Postgres directe (exécuter les `.sql`) | — |
| `ANTHROPIC_API_KEY` | Active l'IA réelle (Claude) | IA retombe sur des heuristiques déterministes |
| `AI_MODEL` | Override du modèle (défaut `claude-opus-4-8`) | défaut |
| `GITHUB_TOKEN` | Données Git/PR/CI live (Octokit) | retombe sur les tables Supabase |
| `GITHUB_WEBHOOK_SECRET` | Vérifie le webhook push/PR | webhook désactivé |
| `GITHUB_DEFAULT_ORG` | Org des repos auto-créés (`Rebuild-main-org`) | défaut |
| `SUPPORT_GITHUB_REPO` | Repo unique où les tickets de support ouvrent une issue | défaut `Rebuild-main-org/app.rebuild` |
| `GITHUB_OAUTH_CLIENT_ID` / `GITHUB_OAUTH_CLIENT_SECRET` | OAuth App pour « Connect your GitHub » (profil) → lie le compte + invite à l'org | bouton désactivé (no-op) |
| `GITHUB_CONTRIB_REPO` | Dépôt d'invitation collaborateur (fallback quand l'adhésion org échoue) | défaut `Rebuild-main-org/app.rebuild` |
| `STORAGE_BUCKET` | Bucket Supabase Storage privé (uploads) | bytes stockés en base64 dans Postgres |
| `REALTIME_BRIDGE` | `"supabase"` pour fan-out SSE multi-instances | mono-instance |
| `RESEND_API_KEY` / `EMAIL_FROM` | Email sortant (Resend) | email no-op |
| `APP_URL` | Base URL absolue (liens email/portail) | `http://localhost:3000` |
| `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` | Checkout facture + webhook PAID | paiement no-op |
| `SLACK_WEBHOOK_URL` | Notifications Slack à fort signal | no-op |
| `CLIENT_PORTAL_SECRET` | Signe les tokens du portail client | défaut = service-role key |
| `BOOTSTRAP_ADMINS` / `BOOTSTRAP_SUPER_ADMINS` | Emails élevés à ADMIN / SUPER_ADMIN à la connexion | aucun |
| `CRON_SECRET` | Protège `/api/cron` (Bearer envoyé par Vercel) | endpoint ouvert |
| `SENTRY_DSN` / `SENTRY_TRACES_SAMPLE_RATE` | Tracing erreurs (opt-in) | désactivé |
| `REBUILD_URL` | Base URL ciblée par le CLI | `http://localhost:3000` |
| `LIVEKIT_URL` / `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET` | Appels audio/vidéo Discord | appels désactivés |
| `VERCEL_TOKEN` / `VERCEL_TEAM_ID` | Infos de déploiement Vercel | section vide |
| `LANGFUSE_PUBLIC_KEY` / `LANGFUSE_SECRET_KEY` / `LANGFUSE_HOST` | Observabilité LLM (traces Langfuse) | tracing no-op, IA inchangée |
| `LANGFUSE_CAPTURE_IO` | Capter le texte prompt/réponse (redacté) dans les traces | métadonnées seules (pas d'IO) |

> **Déploiement Vercel — interdits** : ne pas mettre `output: "standalone"` ni
> `"type":"module"` dans `package.json`. Combinés, ils provoquent
> `ERR_REQUIRE_ESM` (le launcher CJS de Vercel `require()` un `page.js` traité
> comme ESM) → **toutes** les routes authentifiées 500 après login.

---

## 4. Modèle de données

Types canoniques : `lib/types.ts`. Alias colonne snake_case → camelCase : `SEL`
dans `lib/data.ts`. Accès : `lib/queries.ts` (lecture) et `lib/mutations.ts`
(écriture). L'attribution du `shortId` (`<shortCode>-<n>`) est **serveur
uniquement** (`next_ticket_number`, `lib/ticket-number.ts`).

### 4.1 Hiérarchie & entités principales

```
Workspace (client/espace)
 └─ ProjectGroup ── Project (shortCode = préfixe ticket, ex. "ACME")
                     └─ Ticket ── TicketLink, Comment, TimeEntry,
                                  TicketAttachment, CustomFieldValue
                     ├─ Sprint, Milestone, SprintSnapshot (burndown)
                     └─ TestCase / TestRun (QA)
WorkspaceMember (user ↔ workspace, rôle local)
```

- **Workspace** : `id, name, slug, githubRepo, status, clientName, clientEmail,
  startDate, technologies[]`.
- **Project** : `id, name, shortCode, status, workspaceId, description,
  startDate, endDate?, groupId?`.
- **Ticket** : `id, shortId, title, description, type, priority, status,
  projectId, assigneeId?, reporterId, labels[], epicId?, parentId?,
  milestoneId?, sprintId?, points?, dueDate?, commitRef?, branch?, createdAt,
  updatedAt, order`.
- **Sprint** : `id, name, goal, startDate, endDate, projectId, status`.
- **Milestone** : `id, title, description, dueDate, projectId, done,
  validatedByClient, clientFeedback, validatedAt`.
- **CRM** — **Lead** : `id, company, contactName, contactEmail, stage, value,
  currency, source, ownerId?, notes?, workspaceId? (rempli à la conversion),
  createdAt, updatedAt`.
- **Finance** — **FinanceDoc** : `id, kind ("QUOTE"|"INVOICE"), number
  (DEV-AAAA-NNN / FAC-AAAA-NNN), workspaceId?, clientName, issueDate, dueDate,
  status, items (LineItem[]), taxRate, currency, notes?`. **Transaction** :
  `id, kind, label, category, amount, date, workspaceId?`.
- **Support** — **SupportTicket** : `id, subject, body, requesterEmail,
  requesterId?, status, priority, workspaceId?, assigneeId?, resolvedById?,
  resolvedAt?, slaDueAt?, githubIssueNumber?, githubIssueUrl?, …` +
  **SupportComment**. (`githubIssue*` renseignés à la création via l'issue
  GitHub auto-ouverte — voir §9.5.)
- **Git (miroir GitHub)** — `GitCommit`, `PullRequest`, `Branch`, `Deployment`.
- **Divers** — `User`, `Notification`, `Document`, `Meeting`, `AuditLog`,
  `CustomField`/`CustomFieldValue`.

### 4.2 Énumérations & couleurs (META)

| Enum | Valeurs | META |
|---|---|---|
| `Role` | SUPER_ADMIN, ADMIN, LEAD, PM, ENGINEER, QA, DESIGNER, SALES, FINANCE, SUPPORT, CLIENT | `ROLE_LABELS` |
| `WorkspaceStatus` | ACTIVE, PAUSED, ARCHIVED | — |
| `ProjectStatus` | PLANNING, ACTIVE, REVIEW, ON_HOLD, DONE, CANCELLED | `PROJECT_STATUS_META` |
| `TicketStatus` | BACKLOG, TODO, IN_PROGRESS, IN_REVIEW, DONE | `STATUS_LABELS` |
| `TicketType` | TASK, BUG, FEATURE, REVIEW, EPIC, SPIKE, SUBTASK | `TYPE_META` |
| `TicketPriority` | CRITICAL, HIGH, MEDIUM, LOW | `PRIORITY_META` |
| `StoryPoints` | 1, 2, 3, 5, 8, 13 | — |
| `LinkType` | BLOCKS, RELATES, DUPLICATES | `LINK_LABELS` (+ inverse) |
| `SprintStatus` | PLANNED, ACTIVE, COMPLETED | — |
| `LeadStage` | LEAD, QUALIFIED, PROPOSAL, WON, LOST | `LEAD_STAGE_META` |
| `DocStatus` | DRAFT, SENT, ACCEPTED, PAID, REJECTED | — |
| `SupportStatus` | NEW, OPEN, PENDING, RESOLVED, CLOSED | `SUPPORT_STATUS_META` |
| `TestRunStatus` | PASS, FAIL, BLOCKED, SKIPPED, UNTESTED | `TEST_RUN_META` |
| `CustomFieldType` | TEXT, NUMBER, SELECT, DATE | — |
| `Availability` | — | `AVAILABILITY_META` |
| file status | (IDE) | `FILE_STATUS_META` |

---

## 5. Authentification, RBAC & sécurité

### 5.1 Session & middleware

`middleware.ts` rafraîchit le cookie de session Supabase à chaque requête et
redirige les non-authentifiés vers `/login`. **Préfixes publics** : `/login`,
`/auth`, `/client`, `/api/auth`, `/api/webhooks`, `/api/health`, `/api/cron`,
`/api/cli` (auth Bearer), `/cli` (distribution statique), assets.

`getSessionUser()` (`lib/auth/session.ts`) → `{ id, email, name, role,
avatarUrl?, githubUsername? }`. **Élévation bootstrap** : un email dans
`BOOTSTRAP_ADMINS` devient ADMIN *tant que* son rôle stocké est encore le défaut
ENGINEER (une affectation explicite gagne) ; `BOOTSTRAP_SUPER_ADMINS` +
`admin@rebuild.tn` deviennent SUPER_ADMIN. `resolveAppUser()` mirroite l'identité
dans la table-annuaire `users` (best-effort, pour résoudre les noms d'auteurs).

### 5.2 Deux mécanismes d'autorisation

**(a) Actions fines** — `lib/auth.ts`, `can(user, action)` contre une `MATRIX`.
**`SUPER_ADMIN` court-circuite tout** (`can` renvoie `true`). `isAdmin(role)` =
ADMIN ou SUPER_ADMIN.

| Action | Rôles autorisés (hors SUPER_ADMIN qui a tout) |
|---|---|
| `workspace.create` | **SUPER_ADMIN uniquement** (création depuis un Blueprint approuvé) |
| `workspace.delete` | ADMIN |
| `workspace.edit` | ADMIN, LEAD |
| `project.create` / `project.update` / `project.delete` | ADMIN, LEAD, PM |
| `ticket.delete` | ADMIN, LEAD, PM |
| `member.invite` | ADMIN, LEAD |
| `pr.merge` | ADMIN, LEAD |
| `pr.approve` | ADMIN, LEAD, ENGINEER |
| `copilot.use` | tout le staff (tous sauf CLIENT) |
| `admin.panel` | ADMIN |
| `billing.manage` | ADMIN, FINANCE |
| `billing.delete` | ADMIN *(devis/factures — destructif, FINANCE exclu)* |
| `code.access` | ADMIN, LEAD, ENGINEER, QA, DESIGNER |
| `crm.view` | ADMIN, LEAD, PM, SALES |
| `crm.manage` | ADMIN, LEAD, SALES |
| `qa.manage` | ADMIN, LEAD, PM, QA, ENGINEER |
| `support.view` | ADMIN, LEAD, PM, SUPPORT |
| `support.manage` | ADMIN, LEAD, SUPPORT |
| `support.resolve` | SUPER_ADMIN uniquement |
| `notify.broadcast` | SUPER_ADMIN uniquement |

**(b) Sections de navigation** — `lib/permissions.ts`. Sections : `dashboard,
workspaces, crm, support, analytics, reports`. `canAccessSection(role, section)`
et `sectionsAllowedFor(role)` gèrent **le nav et la page**. Défauts :

| Section | Défaut (SUPER_ADMIN toujours OK) |
|---|---|
| dashboard, workspaces, support | tous les rôles |
| crm | ADMIN, LEAD, PM, SALES |
| analytics, reports | ADMIN, LEAD, PM |

Les défauts sont **surchargeables par ligne** dans la table
`section_permissions` (réglés par le SUPER_ADMIN depuis `/admin`).

### 5.3 Autres garde-fous

- **Anti-IDOR / BOLA** : `lib/auth/guard.ts` centralise les gardes objet-niveau.
- **En-têtes** (`next.config.ts`) : `X-Frame-Options: DENY`,
  `X-Content-Type-Options: nosniff`, HSTS, `Permissions-Policy`, **CSP en
  Report-Only** (Monaco exige `unsafe-eval` + blob workers).
- **Rate-limit** : `lib/ratelimit.ts`. **Audit** : `audit_logs` (`/admin/audit`,
  écrit via `mutations.audit`). **MFA** : authenticator app (page Profile).
- **Portail client** : tokens signés (`lib/portal.ts`, `CLIENT_PORTAL_SECRET`).

---

## 6. Intégrations externes

| Service | Module | Activation | Capacités |
|---|---|---|---|
| **GitHub** | `lib/github.ts` (Octokit) | `GITHUB_TOKEN` | `ensureRepo`/`seedDefaultCI`, branches, commits (live, multi-branches, par auteur), PR (open/update/merge/diff/checks), revues, releases, branch protection, Actions (runs/rerun/cancel), webhooks, lecture/écriture de fichiers (IDE), `ghCompareDiff` pour la revue IA, `ghCreateIssue` (issue auto à l'ouverture d'un ticket de support, best-effort), appartenance org (gate du sign-in GitHub) |
| **Supabase** | `lib/supabase/*`, `lib/data.ts` | URL + clés | Auth (cookies, anon) + Postgres (service-role) |
| **Anthropic** | `lib/ai.ts` | `ANTHROPIC_API_KEY` *ou clé perso* | features IA (§7) |
| **Stripe** | `lib/stripe.ts` | clés Stripe | checkout facture, webhook → `PAID` |
| **LiveKit** | `lib/discord.ts` | `LIVEKIT_*` | jetons d'appel audio/vidéo |
| **Email / Slack** | `lib/email.ts`, `lib/slack.ts` | env | notifications sortantes |
| **Vercel** | `lib/vercel.ts` | `VERCEL_TOKEN` | déploiements par workspace |
| **Storage** | `lib/storage.ts` | `STORAGE_BUCKET` | uploads dans un bucket privé (sinon base64) |
| **Realtime/SSE** | `lib/events.ts`, `lib/realtime-bridge.ts` | `REALTIME_BRIDGE` | présence + events temps réel (fan-out multi-instances) |

Les `git_commits` / `pull_requests` Supabase ne sont remplis par le webhook
`/api/webhooks/github/[wsId]` que sur les repos qui le configurent ; sinon les
vues lisent **en direct** via Octokit (matching par login GitHub).

---

## 7. IA serveur

**Modèle** : runtime, contrôlé par le **SUPER_ADMIN** depuis `/admin` (« Modèle IA
(plateforme) »). `trackedCreate` résout le modèle actif à chaque appel via
`getAiModel()` (`lib/settings.ts`, table `app_settings` clé `ai_model`, cache
60 s) → sinon `AI_MODEL` env → défaut **`claude-opus-4-8`**. Changer le réglage
s'applique **immédiatement à tous**. Choix : Opus 4.8/4.7/4.6, Sonnet 4.6,
Haiku 4.5. Tous les appels passent par `trackedCreate` (`lib/ai.ts`) qui
enregistre l'usage. Si l'utilisateur a connecté
sa propre clé (« Connect with Claude », table `user_ai_keys`), `trackedCreate`
crée un client sur **sa** clé et la gouvernance **saute le plafond budgétaire**.
Sans `ANTHROPIC_API_KEY` ni clé perso, l'IA retombe sur des heuristiques
déterministes (l'app reste fonctionnelle).

| Feature | Fonction | `max_tokens` | Sortie structurée | Déclencheur |
|---|---|---|---|---|
| Revue de code | `codeReview()` | 2048 | `REVIEW_SCHEMA` (json_schema) | `POST /api/ai/review`, flux PR |
| Génération de docs | `generateDocs()` | 1500 | texte | `POST /api/ai/docs` |
| Copilote / chat | `chat()` | — | texte | `POST /api/ai/chat` (`copilot.use`) |
| Triage de ticket | `triageTicket()` | 1024 | `TRIAGE_SCHEMA` | `POST /api/ai/triage` |
| Devis depuis lead | `quoteFromLead()` | 1500 | `QUOTE_SCHEMA` | CRM `quote` |
| Plan/scaffold | `planFromArchitecture()` | 16000 | `SCAFFOLD_SCHEMA` → `ScaffoldPlan` | `scaffold` |
| Digest standup | `standupDigest()` | — | texte | `POST /api/ai/standup` |
| Changelog | `changelogFromPRs()` | — | texte | `POST /api/ai/changelog` |
| Résumé | `summarize()` | — | texte | `POST /api/ai/summary` |

**Observabilité LLM (Langfuse, optionnelle & fail-safe)** : toute
l'instrumentation vit dans les **deux points de passage existants**, jamais dans
le code des features. `withAi()` ouvre une **trace** (feature, user, workspace,
project) ; `trackedCreate()` enregistre une **generation** (modèle, tokens, coût
calculé, latence, hash de version de prompt, IO redacté optionnel) ; les appels
d'outils MCP deviennent des **spans** imbriqués (via `LANGFUSE_TRACE_ID`). Le SDK
n'est touché que dans `lib/observability/langfuse.ts` (singleton paresseux + stub
no-op) ; sans `LANGFUSE_*`, comportement IA **identique** au byte près. Un
`traceId` stable est généré dans `withAi` (même tracing désactivé) et renvoyé à
l'UI (`currentTraceId`) pour y rattacher le feedback humain. Détails :
`observability/README.md`.

**Gouvernance** (`lib/ai-usage.ts`) : contexte `AsyncLocalStorage` (`withAi`,
`recordAiUsage`, `currentApiKey`, `userAnthropicKey`, `currentTrace`,
`currentTraceId`), table `ai_usage`
(feature, model, tokens, coût, workspace_id, project_id), plafond budgétaire
par-utilisateur, agrégats `aiUsageSummary` / `workspaceAiSpend` /
`estimationAccuracy`. Prompts versionnés sous `prompts/` (+ schémas JSON dans
`prompts/_schemas/`). Contrats partagés : `agent_contracts/` (`TICKET_CONTRACT`,
`PR_CONTRACT`, `REVIEW_RUBRIC`, `DOMAIN_GLOSSARY`).

---

## 8. CLI `rebuild216` + MCP

`cli/rebuild216.mjs` est le binaire agent ; `cli/mcp-rebuild.mjs` le serveur
**MCP** (stdio) branché à Claude Code. Le CLI clone le repo du workspace, écrit
le contexte (`.rebuild/*.md` via `writeContext` : tickets, contrats, skills,
doctrine), construit le system prompt (`buildSystem`) et lance Claude Code.

### Commandes

```
rebuild216 login                 # connexion → CLI token persistant
rebuild216                       # choisir un projet, puis mode (autonome | chat)
rebuild216 <project>             # projet nommé, puis le mode
rebuild216 chat [project]        # direct chat + MCP
rebuild216 -ops                  # intégrer des branches prêtes → PR + revue IA
rebuild216 key <sk-...>          # clé Anthropic centrale (sinon `claude login`); --clear
```

### Modes
- **run** (livraison autonome) · **chat** (interactif multi-tours) ·
  **ops-fix** / **ops-conflict** (build/CI/merge).

### Outils MCP
`list_tickets`, `create_ticket` (backlog complet : type, priority, points,
labels, assignee, parent/links, comment, time), `update_ticket_status`,
`add_comment`, `capture_screenshots`, `upload_screenshot`.

### Modèle de l'agent
Le modèle Claude du moteur CLI (livraison autonome + chat) est un réglage
plateforme **contrôlé par le SUPER_ADMIN** depuis `/admin` (« Modèle IA (CLI) »,
`app_settings` clé `cli_model`, distinct du modèle serveur `ai_model`). Le serveur
le renvoie dans `/api/cli/context` (`cliModel`) ; `rebuild216` le passe en
`options.model` à l'Agent SDK. Sans réglage → défaut Claude Code.

### Jetons — sessions **no-expire**
Deux Bearer acceptés par `userFromBearer` (`lib/cli-auth.ts`) :
1. **CLI token longue durée** (préfixe `rbld_`) — créé par `/api/cli/login` et
   `/api/cli/token`, **stocké haché** (SHA-256) dans `cli_tokens`, résolu
   directement vers un user : **n'expire pas**. Indispensable pour les longues
   livraisons (ex. 117 tickets). `rebuild216` le stocke en priorité et
   auto-upgrade une ancienne session JWT (`ensurePersistentToken`).
2. **JWT Supabase** (~1 h) — chemin legacy, avec refresh-sur-401 en secours.

`cli_sessions` enregistre un *heartbeat* (« CLI connected ») à chaque appel
authentifié.

---

## 9. Workflows métier

### 9.0 Phase A — Conception (avant le workspace) → Blueprint approuvé
Un **Blueprint** (`blueprints`, `lib/blueprints.ts`) traverse 8 étapes, chacune
avec une **gate** ; un workspace ne peut être créé que depuis un Blueprint
**APPROVED** (toutes les gates vertes). Page : `/blueprints/[id]`.
1. **Intake** — `project.spec.yaml` via **assistant guidé** (8 sous-étapes :
   Projet · Cas d'usage · NFR · Données & accès · Intégrations & stack · Gates de
   qualité · Documents [uploads → bucket Supabase + lien Figma] · Récapitulatif)
   qui **génère la YAML en direct** (copier/télécharger) avec listes répétables et
   gate de complétude, OU saisie YAML brute.
2. **Validation de spec** — gate déterministe (`validateSpec`) : NFR, patterns
   d'accès, modes de défaillance… présents → `gates.validate`.
3. **Critique de spec** — `critiqueSpec()` (IA) attaque la spec, boucle
   questions/réponses (`answers`) → gate `readiness === "READY"`.
4. **Faisabilité & sizing**, 5. **Conception de solution** (SDD/ADRs/openapi/DB),
   6. **Budgets & acceptance**, 7. **Pré-requis & provisioning** — gates
   **humaines** : capture d'artefact (textarea / checklist) + validation manuelle.
8. **Plan & approbation** — `planFromArchitecture` en **preview** (plan figé,
   rien créé) → gate `plan`.
**Approbation** (`/approve`) exige toutes les gates ; **conversion**
(`/convert`, requiert `workspace.create`) crée le workspace et applique le plan
figé via `applyScaffoldPlan` → statut `CONVERTED`. La suite est la Phase B
(scaffold/livraison/PR/CI ci-dessous).

### 9.1 Cycle de vie d'un ticket
`BACKLOG → TODO → IN_PROGRESS → IN_REVIEW → DONE`. La transition vers `DONE`
est gardée serveur (`/api/cli/ticket`) : refusée hors `IN_PROGRESS`/`IN_REVIEW`,
et **parsing de la Definition of Done** — toute case `- [ ] dod:<id>` non cochée
(et non `N/A`) bloque la clôture (409). Création/déplacement émettent
`Activity`/`Notification` et peuvent lier `commitRef`/`branch`.

### 9.2 Livraison autonome (`rebuild216 run`)
1. Login → CLI token persistant. 2. `setupProject` : clone + `writeContext`.
3. L'agent lit le backlog, implémente ticket par ticket, commit localement par
changement (jamais de push direct — doctrine), met à jour les statuts et commente
via MCP. 4. Coûts IA du run enregistrés (`/api/cli/usage`).

### 9.3 PR, revue & merge
Ouverture/MAJ de PR (`ghOpenOrUpdatePR`) → revue IA du diff (`ghCompareDiff` →
`codeReview`, postée en commentaire) → protection de branche optionnelle
(`ghProtectMain` : 1 review + « Build & Test » verts) → merge
(`/api/git/[wsId]/prs/[number]/merge`, `pr.merge`, squash par défaut). CI = GitHub
Actions réels. Le webhook `/api/webhooks/github/[wsId]` mire commits/PR/CI dans
Supabase.

### 9.4 CRM : lead → devis → facture → paiement
`Lead` (LEAD→QUALIFIED→PROPOSAL→WON/LOST) → **devis** IA
(`/api/crm/leads/[id]/quote`, `quoteFromLead`) → `FinanceDoc` `QUOTE`
(`DEV-AAAA-NNN`). Acceptation → **facture** `INVOICE` (`FAC-AAAA-NNN`). Paiement
Stripe (`/api/finance/[id]/checkout` + webhook `/api/webhooks/stripe` → `PAID`).
PDF : `/api/finance/[id]/pdf`. Conversion du lead → delivery/workspace :
`/api/crm/leads/[id]/convert` (`crm.manage`). **Suppression** d'un devis/facture :
`DELETE /api/admin/finance/[id]` (`billing.delete` → ADMIN/SUPER_ADMIN).

### 9.5 Support & SLA
Le demandeur ne voit que ses tickets ; le staff (`support.view`) voit tout ;
seul le SUPER_ADMIN résout (`support.resolve`) et diffuse des avis
(`notify.broadcast`). `slaDueAt` matérialise l'échéance SLA.
**Types de rapport + templates** (`lib/support.ts`, source unique partagée
formulaire ↔ API) : à l'ouverture, l'utilisateur choisit un **type** (Bug,
Feature, Question, Performance, Billing, Other) ; chaque type **pré-remplit un
template markdown** dans le corps (sans écraser une saisie) et mappe vers des
**labels GitHub** + un tag de titre.
**Issue GitHub automatique** : à la création d'un ticket, `POST /api/support`
ouvre — **best-effort** — une issue `[Support · <Type>] <sujet>` (labels
`support` + ceux du type, corps = template rempli + type/demandeur/priorité/
workspace + lien retour vers le ticket) dans
le repo `SUPPORT_GITHUB_REPO`, et stocke `githubIssueNumber`/`githubIssueUrl`
sur le ticket (chip cliquable dans la liste). Une panne GitHub (ou `GITHUB_TOKEN`
absent) **ne bloque jamais** la création du ticket. Les lectures dégradent
proprement (`fetchSupportTickets` retombe sur la projection de base) si la
migration `support-github-issue.sql` n'est pas encore appliquée.

### 9.6 Scaffold depuis architecture
`POST /api/workspaces/[id]/scaffold` : `preview:true` → renvoie le plan
(`planFromArchitecture`) sans rien créer ; `plan` fourni → crée projets + backlog
sans appel IA ; `{content}` legacy → crée directement. UI deux temps :
`components/workspace/architecture-import.tsx`.

### 9.7 Cron (burndown)
`GET /api/cron` (Vercel Cron, protégé par `CRON_SECRET`) capture un point de
burndown (`captureSprintSnapshot`) pour chaque sprint `ACTIVE`.

---

## 10. Référence des pages

Toutes les pages `(app)` passent par `app/(app)/layout.tsx` : garde session
(redirige vers `/login`) + `AppShell` (sidebar globale, nav workspace,
notifications, présence, i18n, applicateur de préférences).

### 10.1 Auth & racine

| Route | Accès | Détail |
|---|---|---|
| `/` | public | redirige vers `/dashboard`. |
| `/login` | public | email/mot de passe + OAuth GitHub (gate : membre de l'org). `?next=` honoré. |
| `/reset` | session recovery | définit un nouveau mot de passe après le lien de récupération (`updateUser`). |
| `/client/[token]` | token signé | **portail client** (hors AppShell) : avancement projets, milestones, devis/factures — lecture seule. |

### 10.2 Navigation globale

| Route | Accès | Données / comportement |
|---|---|---|
| `/blueprints` · `/blueprints/[id]` | section `blueprints` (ADMIN/LEAD/PM/SALES) | **Phase A — Conception.** Pipeline en 8 étapes à gates produisant un Blueprint approuvé ; la **création de workspace** ne se fait que depuis un Blueprint approuvé (voir §9.0). |
| `/dashboard` | section `dashboard` | `myTickets`, `workspacesForUser`, projets + `projectProgress` ; activité Git live (`ghUserCommitsSince`, `ghUserOpenPRs`) ; panneau **REBUILD — progression** (clients, projets par niveau, avancement moyen, stack technique) + indicateurs sprint (complétés, points, assignations actives). |
| `/workspaces` | section `workspaces` | cartes des espaces accessibles : compteurs projets / membres / tickets. |
| `/crm` | `canAccessSection(crm)` | leads + pipeline ; liste des non-CLIENT pour l'étape de conversion. |
| `/support` | tous | demandeur → ses tickets ; staff → tous. `SupportView`, `canResolve = support.resolve`. |
| `/analytics` | `canAccessSection(analytics)` | `analytics()` (global + par ingénieur + par workspace) et `doraMetrics()`. |
| `/reports` | `canAccessSection(reports)` | génération de rapports hebdo / sprint / release par workspace. |
| `/discord` | tous | DM, groupes, threads, réactions, présence, appels LiveKit ; badge DM non lus. |
| `/rebuild216` | tous | guide CLI + commandes prêtes à coller pour les projets accessibles. |
| `/how-to-use` | tous | mode d'emploi de la plateforme. |
| `/profile` | tous | identité, avatar, **Connect with Claude** (clé Anthropic perso), **Connect your GitHub** (OAuth → lie le compte + **accès contribution** via `ghRequestContribution` : adhésion org si le token est owner+`admin:org`, sinon **fallback collaborateur du dépôt** `GITHUB_CONTRIB_REPO` — ne requiert que `repo`), MFA, export RGPD. |
| `/settings` | tous | préférences : thème, densité, langue, accent, disponibilité, skills/tags, DND… (thème + langue **appliqués au chargement** et persistés en base — voir §1). |
| `/admin` | `admin.panel` | utilisateurs & rôles, permissions de sections, **Modèle IA plateforme** + **Modèle IA CLI** (SUPER_ADMIN), **Devis & factures** (créer / changer le statut / **supprimer** ADMIN+SUPER_ADMIN), charges & revenus, agents & agent-docs, usage IA, diffusion d'avis (SUPER_ADMIN). |
| `/admin/audit` | `admin.panel` | 1000 dernières lignes d'`audit_logs` (résolution des noms). |

### 10.3 Espace de travail `/workspace/[id]`

| Route | Données / comportement |
|---|---|
| `/workspace/[id]` | redirige vers `…/overview`. |
| `…/overview` | projets, membres + charge (`activeWorkloadByUser`), commits/PR/déploiements. |
| `…/projects` | projets **groupés** (`ProjectGroup`) + avancement (`projectProgress`) ; création / réorg. |
| `…/ide` | IDE web Monaco sur le repo réel : `repoFiles`, branches, tickets ; édition via Contents API. |
| `…/git` | Git & CI/CD : branches, commits, PR (revue/merge), déploiements, état CI (Actions). |
| `…/chat` | chat d'équipe de l'espace (`TeamChat`, temps réel). |
| `…/documents` | fichiers partagés (contrats, specs, assets). |
| `…/calendar` | **vue mensuelle** (grille `MonthGrid` : échéances tickets, fins de sprint, milestones, navigation mois ± / aujourd'hui) + agenda + réunions (export ICS). |
| `…/settings` | membres + configuration de l'espace (repo, technos, lien portail, agent…). |

### 10.4 Projet `/workspace/[id]/projects/[pid]`

En-tête + onglets (`ProjectTabs`) via le layout projet ; contrôle de statut
éditable si `project.update` (`ProjectStatusControl`).

| Onglet | Données / comportement |
|---|---|
| `…/board` | **Kanban** par statut (drag&drop, `KanbanBoard`) ; suppression de ticket si ADMIN/LEAD. |
| `…/backlog` | backlog + affectation aux sprints. |
| `…/list` | vue tableau dense (type, priorité, statut, assigné). |
| `…/timeline` | milestones + % d'avancement (`milestoneProgress`). |
| `…/dashboard` | burndown sprint, vélocité, forecast, répartition type/priorité. |
| `…/tests` | QA : `TestCase`/`TestRun`, bug auto sur échec (`TestPanel`). |
| `…/docs` | éditeur de doc projet (`DocEditor`). |
| `…/documents` | fichiers du projet. |

---

## 11. Référence des routes API

Convention : **[méthodes]** · *autorisation* · comportement. Sauf mention,
l'autorisation passe par `getSessionUser()` + un gate. Les routes `/api/cli/**`
utilisent `userFromBearer` (Bearer), pas les cookies.

### 11.1 Auth & système
| Route | Méthodes | Auth | Comportement |
|---|---|---|---|
| `auth/me` | GET | session | utilisateur courant |
| `auth/logout` | POST | — | invalide la session |
| `health` | GET | public | sonde de santé |
| `cron` | GET | `CRON_SECRET` | snapshot burndown des sprints actifs |
| `events` | GET, POST | session | flux SSE temps réel / émission |
| `presence` | POST | session | mise à jour de présence |
| `search` | GET | (interne) | recherche globale scoping membership |

### 11.2 CLI (Bearer)
| Route | Méthodes | Comportement |
|---|---|---|
| `cli/login` | POST | sign-in mot de passe → JWT + refresh + **cliToken** (rbld_) |
| `cli/refresh` | POST | échange refresh token → nouveau JWT |
| `cli/token` | POST, DELETE | mint un CLI token non-expirant / révoque tous |
| `cli/status` | GET | état de connexion CLI (session) |
| `cli/context` | GET | contexte projet (tickets, contrats, skills) pour l'agent |
| `cli/projects` | GET | projets accessibles |
| `cli/repos` | GET | repos de l'org |
| `cli/integration` | GET, POST | intégration de branches → PR + revue IA |
| `cli/ticket` | POST | met à jour un ticket (statut + **DoD gate** sur DONE) |
| `cli/ticket/create` | POST | crée un ticket complet (backlog) |
| `cli/document`, `cli/document/[id]` | POST / GET | upload / lecture (ex. screenshots) |
| `cli/usage` | POST | enregistre le coût IA d'un run |

### 11.3 Tickets, projets, QA, temps
| Route | Méthodes | Auth | Comportement |
|---|---|---|---|
| `tickets/[id]` | GET, PATCH, DELETE | DELETE = `ticket.delete` | lecture / édition / suppression |
| `tickets/[id]/comments` | POST | session | commentaire |
| `tickets/[id]/links` | POST, DELETE | session | liens (BLOCKS/RELATES/DUPLICATES) |
| `tickets/[id]/watchers` | POST, DELETE | session | suivi |
| `tickets/[id]/time` | GET, POST | — | suivi du temps |
| `tickets/[id]/fields` | GET, PUT | — | valeurs de champs custom |
| `tickets/[id]/attachments` | POST | session | pièce jointe |
| `comments/[id]` | PATCH, DELETE | session | édition / suppression de commentaire |
| `attachments/[id]` | GET, DELETE | session | téléchargement / suppression |
| `projects/[id]` | GET, PATCH, DELETE | — | CRUD projet |
| `projects/[id]/tickets` | GET, POST | — | tickets du projet |
| `projects/[id]/reorder` | POST | — | réordonnancement Kanban |
| `projects/[id]/custom-fields` | GET, POST | — | champs custom |
| `projects/[id]/test-cases` | GET, POST | — | cas de test |
| `projects/[id]/forecast` | GET | — | prévision de complétion |
| `test-cases/[id]/runs` | GET, POST | — | exécutions de test |
| `sprints/[id]/snapshot` | GET, POST | — | snapshot burndown |

### 11.3b Blueprints (Phase A — section `blueprints`)
| Route | Méthodes | Auth | Comportement |
|---|---|---|---|
| `blueprints` | GET, POST | section `blueprints` | liste / créer (Intake) |
| `blueprints/[id]` | GET, PATCH, DELETE | section `blueprints` | lire / éditer artefacts (éditer la spec invalide validate+critique) / supprimer |
| `blueprints/[id]/validate` | POST | section `blueprints` | gate déterministe `validateSpec` |
| `blueprints/[id]/critique` | POST | section `blueprints` | `critiqueSpec` (IA, via `withAi`) → gate READY |
| `blueprints/[id]/plan` | POST | section `blueprints` | `planFromArchitecture` preview (plan figé) |
| `blueprints/[id]/gate` | POST | section `blueprints` | toggle d'une gate humaine (feasibility/design/budgets/prereqs) |
| `blueprints/[id]/approve` | POST | section `blueprints` | passe APPROVED si toutes les gates vertes |
| `blueprints/[id]/documents` | POST, DELETE | section `blueprints` | upload (→ bucket, sinon base64) / retrait d'un fichier attaché |
| `blueprints/[id]/convert` | POST | **`workspace.create`** (SUPER_ADMIN) | crée le workspace + applique le plan → CONVERTED |

### 11.4 Workspaces
| Route | Méthodes | Auth | Comportement |
|---|---|---|---|
| `workspaces` | GET, POST | POST = `workspace.create` | liste / création |
| `workspaces/[id]` | GET, PATCH, DELETE | PATCH/DELETE = `workspace.edit` | CRUD espace |
| `workspaces/[id]/projects` | GET, POST | — | projets de l'espace |
| `workspaces/[id]/members` | GET, POST | session | membres |
| `workspaces/[id]/groups`, `…/groups/[gid]` | GET/POST, PATCH/DELETE | — | groupes de projets |
| `workspaces/[id]/messages` | GET, POST | session | chat d'équipe |
| `workspaces/[id]/meetings`, `…/meetings/ics` | GET/POST, GET | session | réunions + export ICS |
| `workspaces/[id]/scaffold` | POST | — | preview / création depuis architecture |
| `workspaces/[id]/agent` | GET, PUT | `workspace.edit` | config de l'agent |
| `workspaces/[id]/seed-ci` | POST | — | seed du workflow CI |
| `workspaces/[id]/portal-link` | GET | — | lien signé du portail client |

### 11.5 Git & CI/CD (`git/[wsId]/…`)
| Route | Méthodes | Auth | Comportement |
|---|---|---|---|
| `tree`, `files`, `file` | GET / GET / GET,PUT | — | arbre, liste, lecture/écriture de fichier (IDE) |
| `commit`, `commit/[sha]`, `commits` | POST / GET / GET | — | créer un commit, diff d'un commit, liste |
| `diff` | GET | — | diff |
| `move`, `delete` | POST | — | renommer / supprimer un fichier |
| `branches`, `branches/cleanup` | GET,POST,DELETE / POST | — | branches + nettoyage |
| `prs`, `prs/[number]/diff`, `…/comments`, `…/reviews`, `…/merge` | GET / GET / POST / GET,POST / POST | reviews=`pr.approve`, merge=`pr.merge` | PR : liste, diff, commentaires, revues, merge |
| `actions` | GET, POST | — | GitHub Actions (runs, rerun/cancel) |
| `releases` | GET, POST | POST = `pr.merge` | releases |
| `vercel` | GET, POST | POST = `pr.merge` | déploiements Vercel |
| `scaffold-ci`, `ticket-link` | POST / GET | — | seed CI, lien commit↔ticket |

### 11.6 IA
| Route | Méthodes | Auth | |
|---|---|---|---|
| `ai/chat` | POST | `copilot.use` | copilote |
| `ai/review`, `ai/docs`, `ai/triage`, `ai/summary`, `ai/standup`, `ai/changelog` | POST | (interne) | revue, docs, triage, résumé, standup, changelog |

### 11.7 CRM & Finance
| Route | Méthodes | Auth | |
|---|---|---|---|
| `crm/leads` | GET, POST | `crm.view` / `crm.manage` | leads |
| `crm/leads/[id]` | PATCH, DELETE | `crm.manage` | édition / suppression |
| `crm/leads/[id]/quote` | POST | — | devis IA depuis lead |
| `crm/leads/[id]/convert` | POST | `crm.manage` | conversion → delivery/workspace |
| `admin/finance` | GET, POST | `billing.manage` | devis/factures |
| `admin/finance/[id]` | PATCH, DELETE | PATCH=`billing.manage`, **DELETE=`billing.delete`** | statut / **suppression** |
| `admin/transactions`, `…/[id]` | GET,POST / PATCH,DELETE | `billing.manage` | charges & revenus |
| `finance/[id]/pdf` | GET | — | PDF du document |
| `finance/[id]/checkout` | POST | — | lien Stripe Checkout |

### 11.8 Support
| Route | Méthodes | Comportement |
|---|---|---|
| `support` | GET, POST, DELETE | liste / création (**ouvre une issue GitHub best-effort**) / suppression |
| `support/[id]` | PATCH, DELETE | statut / suppression |
| `support/[id]/comments` | GET, POST | fil de discussion |

### 11.9 Admin
| Route | Méthodes | Auth | |
|---|---|---|---|
| `admin/users`, `…/[id]` | GET,POST / PATCH,DELETE | `isAdmin` | gestion utilisateurs/rôles |
| `admin/settings` | GET, PUT | GET=`admin.panel`, **PUT=SUPER_ADMIN** | lire/changer les modèles IA globaux (`aiModel` serveur + `cliModel` CLI) |
| `admin/permissions` | GET, PUT | session (admin via page) | matrice de sections |
| `admin/agents`, `…/[id]`, `…/[id]/files` | GET,POST / GET,PATCH,DELETE / PUT,DELETE | `isAdmin` | agents IA & leurs fichiers |
| `admin/agent-docs` | GET, PUT | `admin.panel` | docs d'agent |
| `admin/notify-role` | POST | `notify.broadcast` | diffusion par rôle |

### 11.10 Discord
| Route | Méthodes | Comportement (toutes : session) |
|---|---|---|
| `discord/members` | GET | annuaire |
| `discord/groups` | POST | créer un groupe |
| `discord/threads`, `…/[threadId]` | GET / GET,POST,DELETE | threads |
| `discord/dm/[userId]` | GET, POST | messages directs |
| `discord/notes/[userId]` | GET, PUT | notes privées sur un membre |
| `discord/relationships` | GET, POST | relations |
| `discord/reactions` | POST | réactions |
| `discord/search` | GET | recherche |
| `discord/unread` | GET | compteur non-lus |
| `discord/call-token` | POST | jeton LiveKit (appel) |
| `discord/admin/threads` | GET | modération |

### 11.11 Profil, documents, divers
| Route | Méthodes | Auth | |
|---|---|---|---|
| `profile` | GET, PATCH | session | profil |
| `profile/anthropic` | GET, PUT, DELETE | session | clé Claude perso (jamais réaffichée) |
| `profile/github` | GET, POST, DELETE | session | état du lien GitHub + (ré)invite à l'org + délier |
| `github/connect`, `github/callback` | GET | session | OAuth GitHub : lance le flux / échange le code, lie le login, invite à l'org |
| `profile/export` | GET | (token) | export RGPD |
| `notifications` | GET, PATCH, DELETE | session | notifications (lire/supprimer) |
| `documents`, `documents/[id]` | GET,POST / GET,DELETE | DELETE=`workspace.edit` | fichiers |
| `reports` | GET | session | rapports |
| `export` | GET | (token) | export de données |
| `import/leads`, `import/tickets` | POST | — | imports CSV |
| `client/[token]/validate` | POST | token | validation milestone côté client |
| `webhooks/github/[wsId]` | POST | `GITHUB_WEBHOOK_SECRET` | push/PR/CI → Supabase |
| `webhooks/stripe` | POST | signature Stripe | paiement → `PAID` |

---

## 12. Modules `lib/`

| Module | Rôle |
|---|---|
| `data.ts` | client service-role `sb()`, `SEL` (alias colonnes), prefs, annuaire users, `fetchSupportTickets` (lecture support résiliente : retombe sur la projection de base si la migration issue-link manque) |
| `queries.ts` | sélecteurs lecture (workspaces, projets, tickets, sprints, vélocité, forecast, burndown, repo files…) |
| `mutations.ts` | écritures : tickets/commentaires/liens/watchers, projets, fichiers/commits/branches, temps, `audit`, `createNotification`, `uniqueShortCode` |
| `auth.ts` | `can()`, `isAdmin()`, MATRIX, tiers |
| `auth/session.ts` | `getSessionUser`, `resolveAppUser` |
| `auth/guard.ts`, `auth/decide.ts` | gardes objet-niveau (anti-IDOR) |
| `permissions.ts` | sections, `canAccessSection`, `sectionsAllowedFor`, matrice |
| `cli-auth.ts` | `userFromBearer`, mint/résolution des CLI tokens (rbld_), heartbeat |
| `github.ts` | toute l'intégration GitHub (Octokit) |
| `ai.ts` | features IA + `trackedCreate` (résout le modèle actif) + schémas JSON |
| `ai-usage.ts` | gouvernance/coûts IA (ALS, budget, agrégats) + cycle de vie de la trace d'observabilité (`withAi`, `currentTrace`, `currentTraceId`) |
| `observability/langfuse.ts` | seul point de contact du SDK Langfuse : singleton paresseux + stub no-op, `startTrace`/`scoreTrace`/`flushObservability`, redaction |
| `blueprints.ts` / `blueprint-types.ts` | Phase A : data access (service-role) + `validateSpec`, gates, conversion ; types/constantes client-safe |
| `settings.ts` | réglages plateforme (`app_settings`) : modèle IA serveur (`getAiModel`/`setAiModel`) + modèle CLI (`getCliModel`/`setCliModel`), `AI_MODELS` |
| `analytics.ts` / `dora.ts` | analytics (global/ingénieur/workspace) + DORA |
| `reports.ts` | génération de rapports (markdown) |
| `finance.ts` | totaux, TVA, formatage monnaie, `summarize` |
| `stripe.ts`, `email.ts`, `slack.ts`, `vercel.ts` | intégrations |
| `discord.ts` | annuaire + LiveKit |
| `events.ts`, `realtime-bridge.ts` | SSE temps réel + présence |
| `storage.ts`, `uploads.ts` | objets/uploads (Supabase Storage ou base64) |
| `portal.ts` | tokens signés du portail client |
| `git-gate.ts` | gates de qualité du flux PR |
| `ticket-number.ts` | allocation atomique du `shortId` |
| `csv.ts`, `pagination.ts`, `ratelimit.ts`, `log.ts`, `utils.ts` | utilitaires |
| `i18n.ts`, `i18n-server.ts` | i18n (en/fr/ar) |
| `doc-loader.ts` | lecture des docs agent/contrats/prompts |
| `types.ts` | tous les types + META |

---

## 13. Migrations & exploitation

### Migrations SQL (`supabase/`, à exécuter à la main)
`all.sql` regroupe tout. Fichiers notables : `schema.sql`, `auth.sql`
(profiles + trigger signup), `seed.sql`, `storage.sql`, `permissions.sql`
(section_permissions), `ai-usage.sql`, `cli-sessions.sql`, **`cli-tokens.sql`**
(tokens CLI non-expirants), `user-ai-keys.sql` (Connect with Claude),
**`app-settings.sql`** (réglages plateforme : modèle IA),
**`blueprints.sql`** (Phase A — Conception),
`project-groups.sql`, `crm-fixes.sql`, `discord*.sql`, `agents*.sql`,
`time-tracking.sql`, `qa-support.sql`, **`support-github-issue.sql`**
(colonnes `github_issue_number`/`github_issue_url` du lien ticket↔issue),
`custom-fields.sql`, `vercel.sql`, `super-admin.sql`, `admin-user.sql`.

### Déploiement (Vercel)
- Build Turbopack. **Ne pas** activer `output: "standalone"` ni
  `"type":"module"` (→ `ERR_REQUIRE_ESM`).
- Cron quotidien `/api/cron` (Bearer `CRON_SECRET`).
- Diagnostic d'une 500 authentifiée : `vercel logs <deployment-url> --json`
  (les access logs seuls ne montrent pas la stack RSC).

### Observabilité
- Sentry opt-in (`instrumentation.ts`, `SENTRY_DSN`).
- Audit applicatif : `audit_logs` (`/admin/audit`).

---

*Pour aller plus loin : `agent_contracts/` (contrats agent↔serveur),
`cli/agent/` (doctrine + skills), `prompts/` (prompts versionnés),
`supabase/` (migrations).*
