# 04 — Roadmap V2 · Fonctionnalités intermédiaires (1 à 4 semaines)

Chantiers structurants après les Quick Wins (V1).

## 1. Pagination & performance (sem. 1) — 🔴
- Pagination serveur normalisée (`?cursor=&limit=`) sur toutes les listes (tickets, commits, leads, support, documents, notifications, audit).
- Virtualisation des longues listes (board, list) avec `@tanstack/react-virtual`.
- Cache : `unstable_cache`/`revalidateTag` sur lectures chères (analytics, DORA, velocity) ; SWR côté client.
- Index DB additionnels + élimination des N+1 (`milestoneProgress`, `projectProgress` → agrégat SQL unique).

## 2. Tests & qualité (sem. 1–2) — 🟠
- **Tests d'intégration des gardes** (`requireWorkspace/Project/Ticket`) avec Supabase de test.
- **Tests e2e Playwright** : login, créer ticket, drag board, merge PR, conversion lead, portail client.
- Couverture cible 60 % sur `lib/` + routes critiques.

## 3. Permissions par workspace (sem. 2) — 🟠
- Utiliser `workspace_members.role` pour l'autorisation (rôle effectif par workspace, pas global).
- Écran "Membres & rôles" par workspace.
- Activer la **RLS Postgres** en lecture via le client cookie (defense-in-depth) tout en gardant le service-role pour les jobs.

## 4. Recherche & filtres avancés (sem. 2) — 🟡
- Recherche avancée (opérateurs `assignee:`, `type:`, `is:open`).
- **Recherche sémantique** : `pgvector` + embeddings sur tickets/docs/commentaires.
- Vues sauvegardées **côté serveur** (partageables), filtres par label/sprint/dates/points.

## 5. Import / migration (sem. 2–3) — 🟠
- Import CSV (tickets, leads, users) avec mapping de colonnes + dry-run.
- Importeurs Jira / GitHub Issues / Trello.

## 6. Automatisation (sem. 3) — 🟠
- Moteur de **règles no-code** : trigger (event) → condition → action (changer statut, assigner, notifier, créer ticket).
- Transitions auto sur webhooks git/CI (PR ouverte → In Review ; CI rouge → notif).
- Séquences de relance (factures impayées, leads inactifs).

## 7. Notifications & collaboration (sem. 3) — 🟡
- Centre de préférences de notifications (par type/canal).
- Web Push (service worker) + digest email.
- Versioning des documents/commentaires (historique + diff).

## 8. Intégrations (sem. 3–4) — 🟡
- Slack bidirectionnel (slash commands, actions).
- Google/Microsoft Calendar (création réelle d'events, pas juste ICS).
- Webhooks sortants configurables + signature.

## 9. Facturation SaaS (sem. 4) — 🟠
- Stripe **subscriptions** (plans, seats, trial), portail de facturation client.
- Quotas par plan (workspaces, membres, stockage, appels IA).
- Page pricing + upgrade self-service.

## 10. Mobile / responsive (sem. 4) — 🟡
- Audit responsive complet + correctifs.
- PWA installable (manifest + offline shell).

**Definition of Done V2** : listes paginées, e2e verts, permissions par workspace, import CSV, moteur d'automatisation MVP, abonnements Stripe en place.
