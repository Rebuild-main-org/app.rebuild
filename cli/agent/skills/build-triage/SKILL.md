---
name: build-triage
when: "Mode ops-fix : npm run <step> échoue après intégration."
---
# SKILL — triage build/test (mode ops)

Contexte : l'orchestrateur `-ops` (`cli/rebuild216.mjs`, `fixStepWithClaude`) appelle ce mode quand une étape de vérification (`install`/`typecheck`/`lint`/`test`/`build`) échoue sur la branche d'intégration.

## Doctrine
1. **Relancer pour lire l'erreur réelle** : `npm run <step>` ; n'agis que sur le message réel.
2. **Classer la cause** :
   - *Formatage/lint auto‑corrigeable* → lance le fixer du repo : `npx eslint . --fix` ou `npx prettier --write .`.
   - *Erreur réelle* (type, test, build) → **édite le code** pour la corriger.
   - *Outil absent* (ex. `eslint: not found`) → l'étape est ignorée par l'orchestrateur ; ne l'invente pas.
   - *Lock désync* (`npm ci` refuse) → l'orchestrateur répare via `npm install` ; ne masque pas.
3. **Interdits** : désactiver une règle de lint, supprimer/`skip` un test, affaiblir une config, baisser un seuil — uniquement pour « passer ». C'est un échec, pas une réparation.

## Porte de vérification
- L'étape ressort **verte** (`npm run <step>` code 0).
- Cas particulier toléré : erreurs `tsc` **uniquement** dans `node_modules/*` (typings tiers) — l'orchestrateur les ignore déjà ; n'y touche pas, mais **aucune** erreur ne doit subsister dans le **code projet**.

## Conditions d'arrêt
- **Succès** : étape verte → l'intégration continue ; tes corrections sont committées par l'orchestrateur.
- **Échec irréductible** : signale clairement — ne committe jamais un faux « vert ».
