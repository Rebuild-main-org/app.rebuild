---
name: codebase-conventions
when: "Avant d'écrire du code : pour respecter le style et l'emplacement des choses."
---
# SKILL — conventions du codebase

## Principe
**Écris du code qui se fond dans le code existant.** Imite la densité de commentaires, le nommage, les idiomes du fichier voisin. Le repo (et ses configs) font foi — pas tes préférences.

## Découvrir les conventions (à faire au début d'un run)
1. **Lint/format** : repère `eslint.config.*` / `.eslintrc*`, `.prettierrc*`, `prettier` dans `package.json`. Lance `npm run lint`/`format` s'ils existent.
2. **TypeScript** : `tsconfig.json` (strict ? paths ?). Respecte `npm run typecheck`.
3. **Où vivent les choses** : observe l'arbre (`src/`, `app/`, `lib/`, `components/`, `tests/`…) et place chaque fichier là où ses pairs vivent déjà.
4. **Imports & idiomes** : copie le style d'import, la gestion d'erreurs, les utilitaires partagés déjà présents (ne réinvente pas un helper qui existe).

## Règles
- Pas de dépendance nouvelle sans nécessité ; si ajout, mets le lockfile à jour (`npm install`) et justifie.
- Pas de reformatage massif hors périmètre du ticket (diff focalisé).
- Respecte les scripts du repo plutôt que des commandes ad hoc.

> Les violations de convention notables sont relevées en `warning` à l'auto‑revue (`agent_contracts/REVIEW_RUBRIC.md`, catégorie *Lisibilité*).
