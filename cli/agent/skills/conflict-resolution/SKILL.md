---
name: conflict-resolution
when: "Mode ops-conflict : un git merge en cours a produit des conflits."
---
# SKILL — résolution de conflits (mode ops)

Contexte : l'orchestrateur `-ops` (`cli/rebuild216.mjs`, `resolveConflictWithClaude`) intègre des branches de projet dans une branche `ops/integration-…` ; un `git merge` est **en cours** avec conflits.

## Doctrine
1. **Combiner, pas choisir.** Résous chaque conflit en gardant **les deux** intentions fonctionnelles. Ne supprime un côté que s'il est clairement obsolète/superflu.
2. **Retire tous les marqueurs** `<<<<<<<`, `=======`, `>>>>>>>`.
3. **Ne jamais** `git merge --abort` ni `git reset` — cela jetterait le travail.
4. Quand tout est résolu : `git add -A` puis `git commit --no-edit`.

## Porte de vérification
- Aucun fichier en conflit restant : `git diff --name-only --diff-filter=U` doit être **vide**, et `git ls-files -u` vide.
- Si le projet a un script typecheck/test, le lancer et **réparer ce que le merge a cassé** (enchaîne sur `skills/build-triage`).

## Conditions d'arrêt
- **Succès** : conflits résolus + merge committé + (si applicable) typecheck/test verts.
- **Échec** : si tu ne peux pas résoudre proprement, laisse l'orchestrateur abandonner ce merge — la branche sera **exclue** de l'intégration et signalée (« Skipped (conflicts) » dans la PR). Ne force jamais une résolution douteuse.

> Une résolution sémantiquement risquée doit être visible dans la PR d'intégration (revue IA + porte humaine) — n'enfouis pas un choix dangereux.
