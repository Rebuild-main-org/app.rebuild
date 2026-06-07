# 10 — Plan d'implémentation étape par étape

Plan exécutable par sprints de 2 semaines, du durcissement vers l'Enterprise. Chaque étape liste les fichiers/zones touchés.

## Pré-requis immédiats (jour 0)
1. Exécuter les migrations Supabase dans l'ordre : `schema → auth → roles → crm → p0-tickets → p0-reviews → storage → time-tracking → qa-support → custom-fields → fixes-abcf`.
2. Configurer les env Vercel (déjà : Supabase + Anthropic + APP_URL). Ajouter `REALTIME_BRIDGE=supabase`.
3. Vérifier `/api/health` → tout `configured/up`.

---

## Sprint 1 — Fiabilité & correctifs (fondations)
**Objectif : ne plus jamais régresser silencieusement.**
- **CI/CD** : `.github/workflows/ci.yml` → `npm ci && typecheck && lint && test && build` sur PR + `npm audit`.
- **Monitoring** : `@sentry/nextjs` (instrumentation client + server), `lib/log.ts` (logger structuré), remplacer `console`.
- **Crons** : `vercel.json` → snapshots burndown quotidiens, digests, relances factures.
- **Rate-limit global** : appliquer `rateLimitResponse` aux mutations sensibles.
- **Correctifs audit** : G (intégrité inter-projets dans `mutations.ts`), H (`requires_approval` dans `merge/route.ts`), J (`supabase/all.sql`), L (policy RLS finance), admin bootstrap → env `BOOTSTRAP_ADMINS`.
- **Docker** : `Dockerfile` multi-stage + `docker-compose.yml`.
> Livrable : CI verte, erreurs prod tracées, déploiement reproductible.

## Sprint 2 — Performance & tests
- **Pagination serveur** normalisée (`?cursor=&limit=`) : `queries.ts` + routes listes + UI (charger plus / virtualisation `@tanstack/react-virtual`).
- **Cache** : `unstable_cache`/`revalidateTag` sur analytics/DORA/velocity ; SWR client.
- **N+1** : remplacer `milestoneProgress`/`projectProgress` par un agrégat SQL ; index additionnels.
- **Tests** : intégration des gardes (`requireWorkspace/...`) + e2e Playwright (login, ticket, board, merge, conversion, portail).
- **i18n** : `next-intl` (en/fr), extraire les libellés ; **responsive** : drawer mobile + board empilé.
> Livrable : listes paginées, e2e verts, app utilisable mobile, bilingue.

## Sprint 3 — Sécurité fine & auth
- **Permissions par workspace** : utiliser `workspace_members.role` dans `guard.ts` (rôle effectif par ws).
- **RLS active** en lecture via client cookie (defense-in-depth), service-role réservé aux jobs.
- **MFA/2FA** (TOTP) + **OAuth GitHub** + gestion de sessions.
- **CSP stricte** (report-only → enforce), Dependabot/Renovate.
- **RGPD** : anonymisation (soft-delete + scrub), couverture `audit_logs` complète.
> Livrable : posture sécurité Enterprise-ready, RBAC par workspace.

## Sprint 4 — Monétisation & multi-tenant
- **Stripe Subscriptions** : plans, seats, usage (appels IA, stockage), trials, dunning, portail facturation ; quotas par plan ; page pricing + upgrade self-service.
- **Multi-tenant** : `organizations` + `org_id` sur tables top-level, backfill, garde org dans `guard.ts`, préfixe storage/recherche (suivre `MULTI_TENANCY.md`).
> Livrable : SaaS facturable + isolation org → déblocage commercial Enterprise.

## Sprint 5 — IA différenciante & automatisation
- **Recherche sémantique / RAG** : `pgvector`, embeddings sur tickets/docs/commentaires, Q&A copilot.
- **Agents** : auto-triage à l'ingestion, auto-assign par charge/skill, détection doublons, estimation points.
- **Moteur d'automatisation no-code** : trigger→condition→action + transitions auto git/CI.
- **Import** CSV + Jira/GitHub Issues.
> Livrable : valeur IA native + workflows + migration entrante.

## Sprint 6 — Plateforme & expansion
- **API publique** (OpenAPI) + clés API + webhooks sortants signés + rate-limit par plan.
- **Intégrations** : Slack bidirectionnel, Google/MS Calendar réel, marketplace.
- **BI/Analytics** : PostHog, dashboards configurables, rapports planifiés, rentabilité projet.
- **Export** CSV/Excel/PDF généralisés, sauvegarde workspace.
> Livrable : extensibilité + rétention/expansion.

## Sprint 7+ — Scale & polish
- Temps réel scalable (Redis/Ably), CDN, S3 + antivirus, OpenTelemetry, SLO/alerting (PagerDuty), backups + PITR + DR.
- PWA/offline, mobile natif, accessibilité WCAG 2.2 AA, RTL arabe, status page, centre d'aide.
- SSO SAML/SCIM, résidence des données, SOC2/ISO.

---

## Gouvernance
- **Branche par feature** + PR + CI obligatoire ; revues + ultrareview pour les changements sensibles (auth, billing, multi-tenant).
- **Definition of Done** par étape : typecheck+lint+test+build verts, e2e du parcours touché, doc/`.env.example` à jour, migration versionnée, observabilité branchée.
- **Métriques de succès** : taux d'erreur (Sentry), latence p95, couverture de tests, activation/rétention (PostHog), MRR (Stripe), DORA.
