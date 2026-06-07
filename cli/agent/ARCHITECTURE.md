# ARCHITECTURE — faits système (à régénérer par run)

> **Doit être régénéré depuis le vrai repo cloné à chaque run** — ne pas figer ce contenu.
> `TODO(verify)` : aujourd'hui, `ARCHITECTURE.md` matérialisé par `writeContext` (`cli/rebuild216.mjs` L333) provient de `ctx.agentDocs.architecture` (agent de bibliothèque ou défauts `agent_docs`), **pas** d'une analyse du repo. Tant que la régénération automatique n'est pas câblée, **le code du repo fait foi** : avant d'agir, inspecte l'arbre réel (`README`, `package.json`, dossiers `src/`, configs) au lieu de te fier à ce fichier.

## Comment établir les faits (procédure)
1. Lire `package.json` → scripts (`typecheck`, `lint`, `test`, `build`, `dev`), gestionnaire de paquets (présence de `package-lock.json`), dépendances clés.
2. Repérer le framework/runtime (Next.js, Vite, Deno edge functions, etc.) et la structure (`src/`, `app/`, `supabase/`…).
3. Identifier la cible de test (vitest/jest/playwright) et la commande de build.
4. Noter les conventions visibles (lint/format config) — détaillées dans `skills/codebase-conventions`.

## Faits stables de la plateforme REBUILD (contexte d'orchestration)
- **1 workspace = 1 repo** ; **1 projet = 1 branche** (`branchForProject`, `lib/github.ts`).
- L'agent est déjà positionné sur la branche du projet (ne pas en changer).
- La livraison ne **pousse pas** ; `main` se met à jour par PR + CI verte (`agent_contracts/PR_CONTRACT.md`).
- Contexte fourni par `/api/cli/context` : tickets, documents (`.rebuild/docs/`), agents de bibliothèque (`.rebuild/agent/<nom>/`).

> Renseigne ici, à chaque run, les faits réels du repo courant (framework, scripts, modules majeurs). Ne documente jamais un module/chemin que tu n'as pas vu dans l'arbre.
