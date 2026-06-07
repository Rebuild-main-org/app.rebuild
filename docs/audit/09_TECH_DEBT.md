# 09 — Dette technique

## 1. Tests & qualité
- **Couverture faible** : 20 tests unitaires (`auth`, `ratelimit`, `uploads`) — **0 test d'intégration des routes/gardes**, **0 e2e**. Risque de régression élevé sur 69 routes.
- Pas de tests sur les mutations (createTicket atomique, addComment/mentions, merge gate, conversion lead).
- Pas de `npm audit`/Dependabot.

## 2. CI/CD & infra
- **Pas de CI** : typecheck/lint/test/build non automatisés sur PR.
- **Pas de Docker** ni d'IaC.
- **Migrations SQL manuelles** : 13 fichiers à exécuter dans le bon ordre, dépendances implicites (ex. `roles.sql` avant tout rôle étendu ; `storage.sql` avant `STORAGE_BUCKET`). → consolider en `all.sql` + outil de migration versionné (ou Supabase migrations).
- Codemod `scripts/apply-guards.py` : outillage one-shot non ré-exécutable proprement.

## 3. Observabilité
- **Aucun monitoring** (Sentry), **aucun logger structuré** (usage de `console`/silencieux), audit trail partiel, pas de métriques/alerting.

## 4. Performance & données
- **Aucune pagination** : toutes les listes chargent l'intégralité (tickets, commits, audit, notifications, leads…).
- **N+1** : `milestoneProgress`/`projectProgress` requêtent par entité ; `analytics` charge plusieurs tables entières ; DORA itère en mémoire.
- **Pas de cache** (ni serveur ni client SWR).
- **Fichiers en base64** (repli) dans Postgres → poids DB, limite de taille, coût.
- Recalcul à la volée des agrégats (velocity, progress) à chaque rendu.

## 5. Temps réel
- **Bus in-process** (`lib/events.ts`) : ne survit pas au serverless/multi-instance sans `REALTIME_BRIDGE=supabase`. Sur Vercel par défaut, **les events SSE ne se propagent pas** entre invocations.

## 6. Modèle de données / cohérence
- **Double identité** `profiles` (auth uuid) vs `users` (annuaire) : synchronisée au login + réconciliation invité, mais source de complexité et de drift potentiel (rôle propagé manuellement).
- **Intégrité inter-projets** non contrainte (audit G).
- **`requires_approval`** colonne morte (audit H).
- **RLS** présente mais inactive (service-role) — code mort de sécurité.
- **Policy finance** incohérente avec le RBAC (audit L).

## 7. Configuration & secrets
- **Bootstrap admin codé en dur** (email).
- Multiples flags d'env optionnels (no-op si absents) — bon pour la robustesse, mais **comportement variable** non documenté en un seul endroit (un `README`/`.env.example` existe, à compléter).

## 8. Code & architecture
- Quelques **`eslint-disable react-hooks/set-state-in-effect`** (load au montage) — acceptable mais à surveiller.
- Édits via scripts Python sur disque : à terme, préférer des migrations/refactors tracés.
- `lib/` bien découpé (22 modules) ; types centralisés (`types.ts`) — **bonne base**, peu de dette structurelle.
- Pas de couche service/repository explicite : routes ↔ `queries`/`mutations` directement (acceptable à cette taille).

## Priorisation de remboursement
| Dette | Gravité | Effort | Action |
|---|---|---|---|
| Pas de CI + Sentry | 🔴 | M | Sprint 1 |
| Pas de pagination | 🔴 | L | Sprint 2 |
| Tests d'intégration/e2e | 🟠 | L | Sprint 2 |
| Migrations consolidées/versionnées | 🟠 | S | Sprint 1 |
| RLS inactive / autorisation par workspace | 🟠 | L | Sprint 3 |
| Realtime serverless | 🟠 | M | Sprint 2 (activer bridge + doc) |
| Cache + N+1 | 🟡 | M | Sprint 2-3 |
| Double identité / drift rôle | 🟡 | M | Sprint 3 |
| Incohérences G/H/L + admin hardcodé | 🟡 | S | Sprint 1 (quick wins) |
