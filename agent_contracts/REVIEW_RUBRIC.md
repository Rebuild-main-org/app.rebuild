# REVIEW_RUBRIC — grille de revue partagée

Grille **unique** utilisée par : la fonction serveur `codeReview` (`lib/ai.ts` L115, schéma `REVIEW_SCHEMA` L72) **et** l'auto‑revue du CLI avant PR (`cli/agent/skills/self-review/SKILL.md`). Sortie structurée conforme à `prompts/_schemas/review.schema.json`.

## 1. Sortie (exacte, alignée sur `REVIEW_SCHEMA`)
```json
{
  "score": "A|B|C|D",
  "summary": "string",
  "findings": [
    { "severity": "info|warning|critical", "title": "string", "detail": "string" }
  ]
}
```
- **score** : note globale `A` (excellent) → `D` (à retravailler).
- **findings** : liste ; chaque entrée a `severity`, `title` (court), `detail` (précis : *où* + *pourquoi* + *correctif suggéré*). Inclure le chemin/ligne dans `detail` quand connu (ex. `src/auth.ts:42`).

## 2. Sévérités (sémantique)
- **critical** — bug fonctionnel, faille de sécurité, perte de données, build/tests cassés, DoD non satisfaite. **Bloque le merge.**
- **warning** — risque réel, dette, test manquant, violation de convention notable. À traiter ou justifier.
- **info** — amélioration/lisibilité, non bloquant.

## 3. Catégories à couvrir (chaque revue les passe en revue)
1. **Correction** — le code fait ce que le ticket demande ; cas limites gérés.
2. **Sécurité** — entrées validées, autorisation respectée (rappel : RLS contournée, l'authz est applicative — un guard manquant = `critical`), pas de secret en clair.
3. **Performance** — pas de N+1 évident, requêtes bornées, pas de boucle coûteuse inutile.
4. **Lisibilité** — nommage, cohérence avec le code environnant, commentaires utiles.
5. **Tests** — couverture du changement ; un changement de comportement sans test = au moins `warning`.
6. **DoD** — les cases `dod:*` du/des ticket(s) sont réellement satisfaites (cf. `TICKET_CONTRACT.md` §3). Une DoD non prouvable = `critical`.

## 4. Barème indicatif du score
- **A** : 0 `critical`, 0/1 `warning`, toutes catégories OK, DoD complète.
- **B** : 0 `critical`, quelques `warning` traitables.
- **C** : 0 `critical` mais `warning` nombreux / catégorie tests faible.
- **D** : ≥ 1 `critical`.

## 5. Règle de décision (porte de merge)
- **Auto‑revue CLI** : si un `critical` est trouvé sur son propre diff, l'agent **n'ouvre pas la PR** (doctrine d'arrêt, cf. `cli/agent/SOUL.md`) — il corrige d'abord.
- **Revue serveur sur PR** : `codeReview` poste la grille en commentaire (`/api/cli/integration` action `review`). Présence de `critical` → à corriger avant merge ; le merge effectif reste conditionné à **CI verte** + porte humaine (branch protection).

> Les deux usages partagent ce fichier : ne pas diverger de la liste de sévérités/catégories ci‑dessus.
