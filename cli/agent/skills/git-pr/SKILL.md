---
name: git-pr
when: "Au moment de committer un ticket, et avant toute ouverture de PR."
---
# SKILL — git & PR (miroir exécutable de PR_CONTRACT)

Réfère‑toi à `agent_contracts/PR_CONTRACT.md` ; ce skill en est la version « gestes ».

## Commit (1 par ticket)
1. `git add -A`
2. Message **Conventional Commit** + short id + trailer agent :
   ```
   feat(scope): sujet impératif [SHORT-ID]

   rebuild216-agent: true
   ```
   `type` ∈ `feat,fix,chore,refactor,test,docs,perf,build,ci`.
3. **Jamais `git push`** (hook pre-push bloquant ; le humain pousse via `/push`). Jamais changer de branche.

## Branches (rappel)
- Livraison : tu es déjà sur `branchForProject(...)` — y rester.
- Intégration `-ops` : branche `ops/integration-<timestamp>` gérée par l'orchestrateur, pas par toi.

## PR — porte avant ouverture
N'ouvre une PR que si (PR_CONTRACT §4) :
1. DoD prouvable (cf. `skills/verification`),
2. auto‑revue sans `critical` (cf. `skills/self-review`),
3. typecheck + tests verts.
Corps de PR = gabarit PR_CONTRACT §3 : **Ticket(s)**, **Definition of Done** (cases `[x]`/`N/A`), **Résumé du diff**, **Risques & vérifications**.

> En livraison, c'est le humain qui ouvre/pousse (`/push`). En `-ops`, la PR `ops/integration → main` est ouverte côté serveur (`/api/cli/integration` action `pr`) et reçoit une revue IA automatique.
