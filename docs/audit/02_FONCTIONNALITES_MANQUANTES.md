# 02 — Fonctionnalités manquantes (matrice exhaustive)

Priorité : 🔴 Critique · 🟠 Haute · 🟡 Moyenne · 🟢 Faible
Impact : ⭐⭐⭐ fort · ⭐⭐ moyen · ⭐ faible

| Domaine | Fonctionnalité | Priorité | Impact |
|---|---|---|---|
| **Authentification** | MFA / 2FA (TOTP) | 🟠 | ⭐⭐⭐ |
| Authentification | OAuth GitHub | 🟠 | ⭐⭐ |
| Authentification | OAuth Microsoft / SSO SAML (Enterprise) | 🟡 | ⭐⭐⭐ |
| Authentification | Gestion des sessions (liste appareils, révocation) | 🟡 | ⭐⭐ |
| Authentification | Politique de mot de passe / expiration | 🟢 | ⭐ |
| **Gestion utilisateurs** | Page "Activité récente" / historique par user | 🟡 | ⭐⭐ |
| Gestion utilisateurs | Statut présence/dispo, fuseau horaire | 🟢 | ⭐ |
| Gestion utilisateurs | Désactivation (vs suppression) + anonymisation RGPD | 🟠 | ⭐⭐ |
| **Permissions** | Rôles par workspace/projet (aujourd'hui rôle global) | 🟠 | ⭐⭐⭐ |
| Permissions | Permissions granulaires / custom roles | 🟡 | ⭐⭐ |
| Permissions | RLS Postgres réellement active (defense-in-depth) | 🟠 | ⭐⭐⭐ |
| **Administration** | Feature flags / paramètres globaux | 🟡 | ⭐⭐ |
| Administration | Quotas / limites par plan | 🟡 | ⭐⭐ |
| Administration | Impersonation (support) | 🟢 | ⭐⭐ |
| **Dashboard** | Widgets configurables / personnalisables | 🟡 | ⭐⭐ |
| Dashboard | "Ma journée" cross-workspace agrégé | 🟠 | ⭐⭐ |
| **CRUD** | Archivage / restauration (tickets, projets, workspaces) | 🟠 | ⭐⭐ |
| CRUD | Duplication d'entités (ticket, projet, devis) | 🟡 | ⭐⭐ |
| CRUD | Corbeille / soft-delete + restauration | 🟠 | ⭐⭐ |
| CRUD | Bulk delete (bulk update existe sur board) | 🟡 | ⭐ |
| **Recherche** | Recherche avancée (opérateurs, par champ) | 🟡 | ⭐⭐ |
| Recherche | Recherche **sémantique** (embeddings/pgvector) | 🟠 | ⭐⭐⭐ |
| Recherche | Recherche dans le contenu des commentaires/docs | 🟡 | ⭐⭐ |
| **Filtres** | Filtres dynamiques sauvegardés côté serveur (vs localStorage) | 🟡 | ⭐⭐ |
| Filtres | Filtres par label, sprint, dates, points | 🟡 | ⭐⭐ |
| **Tri** | Tri multi-colonnes (vue list) | 🟢 | ⭐ |
| **Export** | Export CSV / Excel (tickets, leads, finance) | 🟠 | ⭐⭐⭐ |
| Export | Export PDF des rapports / analytics | 🟡 | ⭐⭐ |
| Export | Export de sauvegarde complète d'un workspace | 🟡 | ⭐⭐ |
| **Import** | Import CSV (tickets, leads, users) | 🟠 | ⭐⭐⭐ |
| Import | Import Jira / Trello / GitHub Issues | 🟡 | ⭐⭐⭐ |
| **Notifications** | Centre de préférences de notifications fines | 🟠 | ⭐⭐ |
| Notifications | Push (web push / mobile) | 🟡 | ⭐⭐ |
| Notifications | SMS (Twilio) pour alertes critiques | 🟢 | ⭐ |
| Notifications | Digest email quotidien/hebdo | 🟡 | ⭐⭐ |
| **Emails** | Templates riches + branding | 🟡 | ⭐⭐ |
| Emails | Séquences de relance (factures impayées, leads froids) | 🟠 | ⭐⭐⭐ |
| **API** | API publique REST documentée (OpenAPI) | 🟠 | ⭐⭐⭐ |
| API | Clés API / tokens personnels | 🟠 | ⭐⭐ |
| API | Webhooks sortants configurables | 🟡 | ⭐⭐ |
| API | Pagination + filtres normalisés sur toutes les listes | 🔴 | ⭐⭐⭐ |
| **Sécurité** | CSP stricte + headers complets (HSTS posé) | 🟠 | ⭐⭐ |
| Sécurité | Rate-limit global (pas seulement IA) | 🟠 | ⭐⭐⭐ |
| Sécurité | Scan antivirus uploads | 🟡 | ⭐⭐ |
| Sécurité | Chiffrement applicatif des secrets par workspace | 🟡 | ⭐⭐ |
| Sécurité | Détection d'anomalies / alertes login | 🟢 | ⭐⭐ |
| **Monitoring** | Sentry (erreurs front+back) | 🔴 | ⭐⭐⭐ |
| Monitoring | Métriques (latence, taux d'erreur) + dashboard | 🟠 | ⭐⭐ |
| Monitoring | Uptime / synthetic checks + alerting | 🟠 | ⭐⭐ |
| **Logs** | Logs structurés centralisés (pas de logger) | 🟠 | ⭐⭐ |
| Logs | Audit trail exhaustif (couverture partielle) | 🟡 | ⭐⭐ |
| **Analytics** | Analytics produit (PostHog : funnels, rétention) | 🟠 | ⭐⭐⭐ |
| Analytics | Tableaux de bord exportables / planifiés | 🟡 | ⭐⭐ |
| **Mobile** | App mobile (React Native) ou PWA installable | 🟡 | ⭐⭐ |
| **Responsive** | Audit + optimisation mobile/tablette | 🟠 | ⭐⭐ |
| **SEO** | Métadonnées / OG (landing publique, blog) | 🟢 | ⭐ |
| **IA** | Recherche sémantique / RAG sur docs+tickets | 🟠 | ⭐⭐⭐ |
| IA | Agent autonome (auto-assign, auto-triage à l'ingestion) | 🟡 | ⭐⭐⭐ |
| IA | Estimation de points IA, détection de doublons | 🟡 | ⭐⭐ |
| IA | Assistant vocal / résumé de réunion | 🟢 | ⭐⭐ |
| **Automatisation** | Règles "if-this-then-that" (workflows no-code) | 🟠 | ⭐⭐⭐ |
| Automatisation | Cron jobs gérés (snapshots, digests, relances) | 🔴 | ⭐⭐⭐ |
| Automatisation | Transitions de statut auto sur events git/CI | 🟡 | ⭐⭐ |
| **Intégrations** | Slack bidirectionnel (slash commands) | 🟡 | ⭐⭐ |
| Intégrations | Google/Microsoft Calendar (vrais events) | 🟠 | ⭐⭐ |
| Intégrations | Figma, Linear, Notion, Zapier | 🟢 | ⭐⭐ |
| Intégrations | Comptabilité (QuickBooks/Sage) | 🟢 | ⭐⭐ |
| **DevOps** | Dockerfile + docker-compose | 🟠 | ⭐⭐ |
| DevOps | CI/CD (GitHub Actions : lint/test/build/deploy) | 🔴 | ⭐⭐⭐ |
| DevOps | Tests e2e (Playwright) | 🟠 | ⭐⭐⭐ |
| DevOps | Tests d'intégration des routes/guard | 🟠 | ⭐⭐⭐ |
| **Performance** | Pagination + virtualisation des listes | 🔴 | ⭐⭐⭐ |
| Performance | Cache (Redis / unstable_cache / SWR) | 🟠 | ⭐⭐ |
| Performance | Optimisation requêtes (N+1, index) | 🟠 | ⭐⭐ |
| Performance | Lazy loading / code-splitting ciblé | 🟡 | ⭐ |
| **Facturation SaaS** | Plans/abonnements Stripe (subscriptions, seats) | 🟠 | ⭐⭐⭐ |
| Facturation SaaS | Page pricing + self-service upgrade | 🟡 | ⭐⭐⭐ |
| **Multi-tenant** | Isolation `org_id` + RLS (cf. MULTI_TENANCY.md) | 🟠 | ⭐⭐⭐ |
| **Onboarding** | Wizard de bienvenue, tours produit, samples | 🟡 | ⭐⭐ |
| **Conformité** | RGPD complet (effacement, registre), SOC2, audit export | 🟡 | ⭐⭐⭐ |

> Synthèse priorités critiques (🔴) : **pagination/API normalisée, monitoring (Sentry), CI/CD, cron jobs gérés**. Voir 06_BACKLOG.md pour l'ordonnancement.
