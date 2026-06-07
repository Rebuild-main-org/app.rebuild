# 05 — Roadmap Enterprise · Version complète

Vision : transformer REBUILD en **SaaS Enterprise** capable de concurrencer Jira + Linear + HubSpot + GitHub, avec IA native. Aucune contrainte actuelle prise en compte.

## A. Multi-tenant & isolation (fondation)
- **Organisations** (`org_id` sur toutes les tables top-level) + RLS stricte par org (plan dans `MULTI_TENANCY.md`).
- Isolation des données, du stockage (préfixe org) et de la recherche.
- **SSO Enterprise** : SAML 2.0, SCIM (provisioning auto), OIDC, Azure AD/Okta.
- **Domaines vérifiés** + auto-join par domaine email.

## B. Gouvernance & conformité
- **RBAC granulaire** + rôles custom + politiques par ressource.
- **Audit trail** exhaustif immuable + export signé.
- **RGPD/SOC2/ISO 27001** : registre, effacement, rétention, résidence des données (régions).
- **DLP** : masquage PII, classification de données.
- Politiques de mot de passe, MFA obligatoire par org, gestion de sessions.

## C. IA native (différenciateur clé)
- **RAG** sur toute la base (tickets, docs, code, commits) via embeddings pgvector → recherche sémantique + Q&A.
- **Agents autonomes** : triage à l'ingestion, auto-assignation par charge/compétence, détection de doublons, estimation de points, génération de PRD/spec.
- **Standup, changelog, devis, scaffold** (déjà présents) → planifiés + multi-langue.
- **Prévision de livraison ML** (au-delà de l'ETA déterministe), détection de risques de retard.
- **Copilot d'écriture** partout (descriptions, réponses support, emails commerciaux).
- **Résumés de réunion** (transcription + actions).

## D. Plateforme & extensibilité
- **API publique REST + GraphQL** documentée (OpenAPI), **clés API**, **rate-limit par plan**.
- **Webhooks** entrants/sortants signés + marketplace d'intégrations.
- **SDK** (JS/Python) + CLI officielle (la base CLI existe).
- **Apps/marketplace** : Slack, Teams, Calendar, Figma, Linear, Notion, Zapier, QuickBooks.
- **Champs custom avancés** (formules, relations, rollups) + **workflows no-code** (builder visuel).

## E. Analytics & BI
- **Analytics produit** (PostHog) : funnels, rétention, cohortes, feature adoption.
- **Dashboards BI** configurables, métriques DORA étendues, rapports planifiés (email/Slack).
- **Capacity planning**, prévisions de charge, time-tracking → facturation au temps.
- Export entrepôt (BigQuery/Snowflake), data API.

## F. Facturation & monétisation
- **Stripe Billing** complet : plans, seats, usage-based (appels IA, stockage), trials, coupons, dunning.
- **Self-service** : pricing, upgrade/downgrade, factures, moyens de paiement.
- **Plan Enterprise** : contrats annuels, PO, facturation manuelle, SLA contractuels.

## G. Fiabilité & scale
- **Observabilité** : Sentry, OpenTelemetry, métriques + alerting (PagerDuty), SLO/SLA.
- **Temps réel scalable** : Supabase Realtime / Redis pub-sub / Ably (remplace SSE in-process).
- **Cache distribué** (Redis), CDN, edge, file storage S3 + antivirus.
- **CI/CD** multi-env (preview/staging/prod), IaC (Terraform), tests e2e en pipeline, blue-green.
- **Backups** automatisés + restauration point-in-time + DR.

## H. Expérience & adoption
- **Onboarding** guidé, templates de projets, données d'exemple, tours produit.
- **Mobile** natif (React Native) + PWA offline.
- **Accessibilité** WCAG 2.2 AA, i18n complet (RTL pour l'arabe — déjà prévu), thèmes.
- **Notifications** omni-canal (in-app, email, push, SMS, Slack/Teams) avec préférences fines.
- **Collaboration temps réel** type Google Docs (curseurs, co-édition de descriptions/docs).
- **Centre d'aide**, base de connaissance, statut public (status page), changelog public.

## I. Verticalisation (agence/ESN — cœur du produit)
- **Portail client** white-label par client (déjà : token signé) + branding custom.
- **Devis → contrat → facture → paiement** bout-en-bout (e-signature DocuSign).
- **Rentabilité projet** (coûts internes vs facturé), marge, taux d'occupation.
- **CRM avancé** : scoring de leads IA, séquences, pipeline multi-équipes.

> Cette roadmap se livre par incréments commercialisables : Multi-tenant + SSO + Billing d'abord (déblocage Enterprise), puis IA RAG/agents (différenciation), puis BI/marketplace (rétention/expansion).
