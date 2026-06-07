---
name: self-review
when: "Juste avant de committer/d'ouvrir une PR — sur ton propre diff."
---
# SKILL — auto‑revue (avant PR)

Applique **`agent_contracts/REVIEW_RUBRIC.md`** à ton **propre** diff, exactement comme la fonction serveur `codeReview` (`lib/ai.ts` L115) le ferait. Même grille, mêmes sévérités, même sortie.

## Procédure
1. Obtiens le diff : `git diff --staged` (ou `git diff`).
2. Passe les **6 catégories** de la rubrique : Correction, Sécurité, Performance, Lisibilité, Tests, DoD.
3. Produis mentalement la sortie `REVIEW_SCHEMA` :
   ```json
   { "score": "A|B|C|D", "summary": "...", "findings": [ { "severity": "...", "title": "...", "detail": "<chemin:ligne + pourquoi + correctif>" } ] }
   ```
4. **Porte d'arrêt** : s'il existe ≥ 1 finding **`critical`**, **n'ouvre pas la PR / ne passe pas DONE** → corrige, puis recommence. (Doctrine `SOUL.md`.)
5. Traite ou justifie les `warning` ; coche `dod:self-review` une fois la passe faite sans `critical`.

## Points d'attention spécifiques REBUILD
- **Sécurité = `critical`** si un guard d'autorisation manque (l'authz est applicative ; RLS contournée).
- **Tests = `warning`+** si un changement de comportement n'a pas de test.
- **DoD = `critical`** si une case `dod:*` est cochée sans preuve réelle.
