# WORKFLOW — la boucle par mode (agent rebuild216)

Quatre modes, un seul moteur. Chaque mode a des **conditions d'arrêt** et une **porte de vérification** explicites. Identité : `SOUL.md`. Contrats : `agent_contracts/`. Détails exécutables : `skills/`.

Règles transverses (rappel `SOUL.md`) : un commit par ticket, jamais de `git push`, jamais de changement de branche, jamais de commande destructrice. Charge un skill seulement quand tu en as besoin (progressive disclosure).

---
## Mode `delivery` — livrer les tickets ouverts
Boucle par ticket :
1. `list_tickets` → prendre le prochain non‑`DONE`.
2. `update_ticket_status(id, "IN_PROGRESS")`.
3. Implémenter **un seul** ticket. Diff focalisé. Conventions : `skills/codebase-conventions`.
4. **Porte de vérification** : `skills/verification` → typecheck + tests verts (`skills/testing`), et chaque case `dod:*` du ticket cochée ou `N/A` (`agent_contracts/TICKET_CONTRACT.md` §3). Web app → preuve visuelle (`capture_screenshots`).
5. **Auto‑revue** : `skills/self-review` applique `agent_contracts/REVIEW_RUBRIC.md` au diff. Un finding `critical` → retour à l'étape 3.
6. Commit conforme `agent_contracts/PR_CONTRACT.md` (`feat: … [SHORT-ID]` + trailer `rebuild216-agent: true`). `skills/git-pr`.
7. `update_ticket_status(id, "IN_REVIEW")` puis `"DONE")` **seulement** si la porte 4 + l'auto‑revue 5 sont vertes ; `add_comment(id, "<résumé>")`.

**Conditions d'arrêt** : tous les tickets `DONE` ; ou DoD non prouvable ; ou `critical` non résolu ; ou tests rouges irréparables (→ signale, ne marque pas `DONE`). Rappel : `/api/cli/ticket` refuse `DONE` hors `IN_PROGRESS`/`IN_REVIEW`.

---
## Mode `chat` — discuter/planifier puis agir
- Réponds, planifie, implémente à la demande. Pour toute implémentation, tu repasses par les portes 4‑6 du mode delivery.
- Backlog vide + demande de remplissage → crée de **vrais** tickets conformes `agent_contracts/TICKET_CONTRACT.md` (jamais de filler).
- **Arrêt** : la demande est traitée ; ou elle exige un `git push`/une action destructrice (refus) ; ou elle sort du périmètre (demande).

---
## Mode `ops-conflict` — résoudre un conflit de merge (intégration `-ops`)
Contexte : un `git merge` est en cours avec conflits. Doctrine : `skills/conflict-resolution`.
1. Résoudre **chaque** conflit en combinant les deux côtés (jamais supprimer un côté sans raison) ; retirer tous les marqueurs.
2. **Ne pas** `git merge --abort` ni `git reset`.
3. `git add -A` puis `git commit --no-edit`.
4. **Porte** : si un script typecheck/test existe, le lancer et réparer ce que le merge a cassé (`skills/build-triage`).

**Arrêt** : conflits résolus + commit fait ; sinon laisser l'orchestrateur abandonner ce merge (la branche est exclue de l'intégration).

---
## Mode `ops-fix` — réparer un échec build/test (intégration `-ops`)
Contexte : `npm run <step>` échoue après intégration. Doctrine : `skills/build-triage`.
1. Relancer la commande, lire l'erreur réelle.
2. Formatage/lint → lancer le fixer du repo (`eslint --fix` / `prettier --write`) ; erreurs réelles → éditer le code.
3. **Ne pas** désactiver une règle, supprimer un test, ni affaiblir une config pour masquer l'échec.
4. **Porte** : la commande ressort verte. Sinon, signaler — ne pas committer un faux « vert ».

**Arrêt** : `npm run <step>` vert ; ou échec irréductible → signaler.

---
## ARCHITECTURE
Lis `ARCHITECTURE.md` — il doit refléter le **vrai** repo (régénération à chaque run ; voir la note du fichier). En cas de doute, le **code du repo fait foi**, pas le doc.
