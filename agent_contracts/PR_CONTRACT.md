# PR_CONTRACT — branches, commits et pull requests (contrat partagé)

Respecté par le **CLI** (livraison + `-ops`) et exploité par les fonctions serveur **`codeReview`**, **`changelogFromPRs`**, **`generateDocs`**. Vocabulaire : `DOMAIN_GLOSSARY.md`.

## 1. Branches
- **Livraison** : on travaille sur la branche du projet = `branchForProject(name, shortCode)` (`lib/github.ts`). On **ne crée ni ne change** de branche pendant la livraison (`WORKFLOW`, `cli/rebuild216.mjs` L248‑251).
- **Intégration `-ops`** : branche éphémère `ops/integration-<timestamp>` créée depuis `origin/<cible>` (`cli/rebuild216.mjs`). La cible est `main` (ou la branche par défaut).
- `main` n'est **jamais** poussé en direct ; il est mis à jour via PR (porte humaine + branch protection, `ghProtectMain` `lib/github.ts`).

## 2. Commits — Conventional Commits
Format : `type(scope?): sujet [SHORT-ID]`
- `type` ∈ `feat, fix, chore, refactor, test, docs, perf, build, ci`.
- `[SHORT-ID]` = le `shortId` du ticket (ex. `[WEB-12]`), obligatoire pour un commit de livraison.
- **1 commit par ticket** (`WORKFLOW` L293).
- **Trailer obligatoire** pour un commit produit par l'agent : ligne vide puis `rebuild216-agent: true` (`WORKFLOW` L283‑286). C'est le marqueur qui distingue le travail agent.
- Les commits automatiques de correction (`-ops`) utilisent : `style: automated lint/verification fixes (rebuild216 ops)` (`cli/rebuild216.mjs`).

Exemple :
```
feat(auth): add login rate-limit [WEB-12]

rebuild216-agent: true
```

## 3. Corps de PR (template)
Toute PR (intégration `-ops` ou PR projet) suit ce gabarit — c'est ce qui rend `codeReview`/`changelogFromPRs` fiables :

```md
## Ticket(s)
- WEB-12 — Add login rate-limit

## Definition of Done
- [x] dod:acceptance — …
- [x] dod:typecheck — …
- [x] dod:tests — …
(… cf. TICKET_CONTRACT.md §3, toutes cases [x] ou N/A)

## Résumé du diff
<3-6 puces : ce qui change, où, pourquoi>

## Risques & vérifications
- Risque : …
- Vérifié : `npm run typecheck && npm test` verts ; auto-revue REVIEW_RUBRIC OK.
```

Le corps réel des PR `-ops` (généré par `cli/rebuild216.mjs`) liste **Merged (N)** et **Skipped (conflicts)** — il satisfait la section « Résumé du diff » ; les sections Ticket(s)/DoD/Risques sont à compléter pour une PR de projet.

## 4. Porte de vérification (avant ouverture de PR)
Une PR ne s'ouvre que si :
1. la DoD du/des ticket(s) est **prouvable** (cases `dod:*` cochées, cf. `skills/verification`),
2. l'auto‑revue (`skills/self-review` → `REVIEW_RUBRIC.md`) ne laisse **aucun** finding `critical`,
3. typecheck + tests verts localement.
Côté serveur, la PR d'intégration reçoit une revue IA automatique (`codeReview` via `/api/cli/integration` action `review`) postée en commentaire ; merge seulement si **CI verte**.

## 5. Release & changelog (doctrine cible)
Après merge sur `main`, les notes de version se génèrent via `changelogFromPRs` (`lib/ai.ts` L291) à partir des PR mergées (groupées Features/Fixes/Chores) ; une release peut être créée via `ghCreateRelease` (`lib/github.ts`).
`TODO(verify)` : ce déclenchement post‑merge n'a pas encore de propriétaire automatisé (cf. FINDINGS « release+changelog »). En attendant, c'est une action déclenchée manuellement (admin / `git` page).
