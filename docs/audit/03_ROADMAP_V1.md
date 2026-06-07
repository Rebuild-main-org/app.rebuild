# 03 — Roadmap V1 · Quick Wins (1 à 3 jours)

Améliorations à fort ratio valeur/effort, réalisables rapidement sur la base existante.

## Correctifs d'audit restants (½–1 j)
- [ ] **G — intégrité inter-projets** : valider que `sprintId`/`milestoneId`/`epicId`/`parentId` appartiennent au même projet dans `createTicket`/`updateTicket` + liens.
- [ ] **H — `requires_approval`** : consulter la colonne dans `merge/route.ts` (skip gate si `false`).
- [ ] **J — ordre migrations** : script SQL consolidé `supabase/all.sql` exécutant tout dans le bon ordre (idempotent).
- [ ] **L — RLS finance** : policy `is_admin() OR auth_role()='FINANCE'`.
- [ ] Retirer le bootstrap admin **codé en dur** → liste d'emails via env `BOOTSTRAP_ADMINS`.

## Sécurité (½ j)
- [ ] **Rate-limit global** : appliquer `rateLimitResponse` aux routes de mutation sensibles (login proxy, invites, uploads, commentaires).
- [ ] Validation taille/MIME déjà en place → étendre aux avatars.
- [ ] Headers : ajouter une CSP de base (report-only d'abord).

## Données / export (1 j)
- [ ] **Export CSV** générique (tickets, leads, transactions) — endpoint `/api/export?entity=` + bouton.
- [ ] **Export PDF analytics** (réutiliser l'approche HTML imprimable de `finance/[id]/pdf`).

## UX rapides (1 j)
- [ ] **i18n minimal** : câbler la préférence `language` avec `next-intl` (au moins en/fr) sur les libellés clés.
- [ ] États vides riches (illustration + CTA) sur board/CRM/support/QA.
- [ ] Raccourcis clavier board (`c` créer, `/` recherche déjà ⌘K).
- [ ] Toasts d'erreur normalisés (helper `apiError`).
- [ ] Skeletons de chargement sur les pages serveur lourdes.

## Observabilité (½ j)
- [ ] **Sentry** (front + route handlers) via `@sentry/nextjs`.
- [ ] Logger structuré minimal (`lib/log.ts`) remplaçant les `console`.

## DevOps (1 j)
- [ ] **GitHub Actions** : workflow `ci.yml` (typecheck + lint + test + build) sur PR.
- [ ] **Dockerfile** multi-stage + `docker-compose` (app + Supabase local optionnel).
- [ ] Cron Vercel (`vercel.json` crons) pour : snapshots burndown quotidiens, digest, relances factures.

## IA (½ j)
- [ ] Câbler les endpoints IA déjà existants encore non exposés partout (ex. résumé sprint sur backlog).
- [ ] Bouton "Estimer les points (IA)" dans le ticket dialog.

**Definition of Done V1** : CI verte sur chaque PR, Sentry capte les erreurs prod, export CSV dispo, i18n en/fr, correctifs G/H/J/L livrés, crons actifs.
