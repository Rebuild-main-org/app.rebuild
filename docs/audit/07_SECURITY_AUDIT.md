# 07 — Audit de sécurité

Référentiel : OWASP Top 10 (2021). Statut : ✅ couvert · ⚠️ partiel · ❌ absent.

## Synthèse OWASP Top 10

| # | Risque | Statut | Détail |
|---|---|---|---|
| A01 | Broken Access Control | ✅ | Garde objet `lib/auth/guard.ts` sur toutes les routes workspace-scoped (anti-IDOR), RBAC `lib/auth.ts`. **Reste** : rôle global (pas par workspace), RLS inactive. |
| A02 | Cryptographic Failures | ⚠️ | HTTPS (Vercel), secrets en env, tokens portail HMAC. **Manque** : chiffrement applicatif des secrets par workspace, rotation formalisée. |
| A03 | Injection | ✅ | PostgREST/Supabase paramétré (pas de SQL brut côté app). Webhooks vérifiés. **Vérifier** : `.or(\`id.eq.${token}\`)` historique remplacé par token signé (OK). |
| A04 | Insecure Design | ⚠️ | Bon modèle d'autorisation ; **manque** quotas, anti-abus global, threat modeling. |
| A05 | Security Misconfiguration | ⚠️ | Headers de sécurité posés (`next.config.ts` : X-Frame-Options, nosniff, Referrer-Policy, Permissions-Policy, HSTS). **Manque** : CSP stricte (nonces). |
| A06 | Vulnerable Components | ⚠️ | Deps récentes ; **manque** : `npm audit` en CI, Dependabot/Renovate. |
| A07 | Identification & Auth Failures | ⚠️ | Supabase Auth (password/magic/Google), reset OK. **Manque** : MFA/2FA, gestion sessions, politique mot de passe, lockout (GoTrue a un rate-limit de base). |
| A08 | Software & Data Integrity | ✅/⚠️ | Webhooks GitHub & Stripe **HMAC-vérifiés**. **Manque** : SRI/CSP, signature des artefacts CI. |
| A09 | Logging & Monitoring Failures | ❌ | `audit_logs` partiel ; **pas de Sentry, pas de logs structurés, pas d'alerting**. Point faible majeur. |
| A10 | SSRF | ✅ | Pas de fetch d'URL utilisateur arbitraire côté serveur (Octokit/Resend/Stripe/Slack = endpoints fixes). |

## Contrôles en place (✅)
- **Autorisation objet** centralisée (`requireWorkspace/Project/Ticket/Comment/Attachment/Document/TestCase/Sprint`) — corrige l'IDOR généralisé initial.
- **Rate-limiting** sur les routes IA (`lib/ratelimit.ts`, 20/min/user).
- **Validation des uploads** (`lib/uploads.ts` : 10 Mo, 20 fichiers, allow-list MIME).
- **Webhooks signés** : GitHub (`x-hub-signature-256`), Stripe (`stripe-signature` v1, timing-safe).
- **Portail client** : token **HMAC signé** (plus de slug devinable), résolution du bon client par `client_email`.
- **Middleware** : auth obligatoire (401 API / redirect pages), chemins publics whitelistés.
- **Headers** de sécurité globaux ; `.env*` git-ignoré ; aucun secret loggé.
- **GDPR export** self-service (`/api/profile/export`).

## Vulnérabilités / faiblesses (à traiter)

### 🔴 Critique
1. **Observabilité sécurité absente** (A09) : aucune capture d'erreurs/alerte → exploitation/incident invisible. → Sentry + logs structurés + alerting.
2. **Rate-limit non global** : login proxy, invitations, commentaires, uploads non protégés contre l'abus/brute-force applicatif.

### 🟠 Haute
3. **Pas de MFA/2FA** — comptes ADMIN/FINANCE exposés au credential stuffing.
4. **RLS Postgres morte** : la défense en profondeur est désactivée (service-role bypass). Une faille applicative = accès total. → activer RLS sur les lectures via client cookie.
5. **Rôle global, pas par workspace** : un membre garde son rôle élevé partout. → autorisation par `workspace_members.role`.
6. **Service-role key** = credential racine : confirmer rotation (cf. SECURITY.md), restreindre, ne jamais exposer client.
7. **Pas de CSP stricte** : surface XSS plus large (bien que React échappe par défaut).

### 🟡 Moyenne
8. **Bootstrap admin codé en dur** (`azizghed10@gmail.com`) — à externaliser en env.
9. **Suppression user** laisse une ligne `users` orpheline (intégrité), pas d'anonymisation RGPD formelle.
10. **Pas de scan antivirus** sur uploads ; data-URL base64 en repli (DoS mémoire possible sur gros fichiers malgré la validation).
11. **`audit_logs` partiel** : couverture incomplète des mutations sensibles.
12. **Deployment Protection désactivée** (lien public) — assumé pour le portail client, mais l'app interne est aussi publique → envisager protection sélective ou auth applicative renforcée.

## Recommandations prioritaires
1. Sentry + alerting + logs structurés (A09).
2. Rate-limit global + lockout login.
3. MFA/2FA (TOTP) pour ADMIN/FINANCE au minimum.
4. Réactiver la RLS en lecture (defense-in-depth) + autorisation par workspace.
5. CSP stricte (report-only → enforce) + `npm audit`/Dependabot en CI.
6. Anonymisation RGPD + couverture audit complète + rotation documentée.
