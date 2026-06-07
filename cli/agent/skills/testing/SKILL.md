---
name: testing
when: "Avant de marquer un ticket DONE, ou dès qu'un changement touche du code."
---
# SKILL — tests

## « Tests verts » = définition concrète
Le repo est vert quand **toutes** les commandes de test/qualité **présentes** dans `package.json` sortent en code 0 :
- `npm run typecheck` si le script existe (sinon `npx tsc --noEmit`).
- `npm test` (ou le script `test`) — vitest/jest selon le repo.
- `npm run lint` si présent.
Si une commande n'existe pas dans `package.json`, elle est `N/A` (et la case DoD correspondante est justifiée `N/A`) — tu ne l'inventes pas.

## Procédure
1. Installer si besoin : `npm ci` (lockfile présent) sinon `npm install`.
2. Lancer typecheck → tests → (lint) ; lire les sorties réelles, pas les suppositions.
3. **Écrire/mettre à jour un test** pour tout changement de comportement (sinon `dod:tests` ne peut pas être cochée ; un changement sans test = au moins `warning` à l'auto‑revue, cf. `REVIEW_RUBRIC.md`).
4. Réparer jusqu'au vert. Ne jamais désactiver/sauter un test pour « passer » (interdit, cf. `build-triage`).

## Sortie attendue
Les commandes ci‑dessus vertes (code 0) → coche `dod:typecheck`, `dod:tests`, `dod:lint` (ou `N/A`) dans la description du ticket (`agent_contracts/TICKET_CONTRACT.md` §3).
