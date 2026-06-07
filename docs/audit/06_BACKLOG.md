# 06 — Backlog priorisé

Format : `[Effort] Titre — bénéfice`. Effort : S (<1j), M (1-3j), L (1-2 sem), XL (>2 sem).

## 🔴 Critique (bloquant prod/scale ou risque)
1. **[M] CI/CD GitHub Actions** (typecheck+lint+test+build sur PR) — empêche les régressions.
2. **[M] Monitoring Sentry** (front + routes) — visibilité des erreurs prod.
3. **[L] Pagination serveur normalisée** sur toutes les listes — évite l'effondrement à l'échelle.
4. **[S] Cron jobs gérés** (Vercel cron) : snapshots burndown, digests, relances — features dépendantes inertes sinon.
5. **[S] Rate-limit global** (mutations sensibles) — anti-abus au-delà de l'IA.
6. **[S] Correctif H** (`requires_approval` consulté) + **[S] G** (intégrité inter-projets) — cohérence métier.
7. **[S] Script SQL consolidé `all.sql`** + ordre garanti (correctif J) — déploiement fiable.

## 🟠 Haute
8. **[L] Tests e2e Playwright** + tests d'intégration des gardes — confiance déploiement.
9. **[L] Permissions par workspace** (`workspace_members.role`) + RLS active — sécurité fine.
10. **[M] Export CSV / Import CSV** (tickets, leads, finance) — adoption/migration.
11. **[L] Recherche sémantique pgvector** (tickets/docs) — valeur IA différenciante.
12. **[L] Stripe Subscriptions** (plans, seats, quotas) — monétisation SaaS.
13. **[L] Multi-tenant `org_id` + RLS** — prérequis Enterprise.
14. **[M] OAuth GitHub + MFA/2FA** — sécurité & friction login.
15. **[L] Moteur d'automatisation no-code** (trigger→action) — rétention.
16. **[S] i18n en/fr câblé** (next-intl) + **[M] audit responsive mobile**.
17. **[M] Logs structurés** + audit trail étendu.

## 🟡 Moyenne
18. [M] Archivage / corbeille / restauration (tickets, projets).
19. [M] Centre de préférences de notifications + Web Push + digest.
20. [L] Intégrations Slack bidirectionnel + Google/MS Calendar réel.
21. [M] API publique documentée (OpenAPI) + clés API.
22. [M] Versioning documents/commentaires.
23. [M] Dashboards configurables + rapports planifiés + PostHog.
24. [M] Duplication d'entités + tri multi-colonnes + filtres serveur partageables.
25. [L] Rentabilité projet (coûts vs facturé) + facturation au temps.
26. [M] Cache (Redis/unstable_cache) + optimisation requêtes N+1.

## 🟢 Faible
27. [S] SEO/OG sur pages publiques, status page, changelog public.
28. [M] PWA installable / offline shell.
29. [L] Mobile natif React Native.
30. [M] e-signature devis (DocuSign), intégrations comptables.
31. [S] SMS (Twilio) pour alertes critiques.
32. [M] Co-édition temps réel (curseurs) des descriptions.

## Ordonnancement recommandé (sprints de 2 sem.)
- **Sprint 1** : 1,2,4,5,6,7 (fiabilité + correctifs).
- **Sprint 2** : 3,8,16,17 (perf + tests + i18n + logs).
- **Sprint 3** : 9,14,10 (permissions/RLS + auth + import/export).
- **Sprint 4** : 12,13 (billing + multi-tenant — déblocage Enterprise).
- **Sprint 5+** : 11,15,20,21,23 (IA sémantique, automatisation, intégrations, API, BI).
