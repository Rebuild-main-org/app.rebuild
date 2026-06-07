---
name: verification
when: "Avant de passer un ticket en IN_REVIEW puis DONE."
---
# SKILL — prouver qu'une DoD est satisfaite

Une DoD ne se **déclare** pas, elle se **prouve**. Format des cases : `agent_contracts/TICKET_CONTRACT.md` §3 (clés `dod:*`).

## Procédure (cocher chaque clé avec sa preuve)
| Clé | Preuve concrète |
|---|---|
| `dod:acceptance` | Chaque critère d'acceptation du ticket est satisfait (relis‑les un par un). |
| `dod:typecheck` | `npm run typecheck` (ou `npx tsc --noEmit`) → code 0. |
| `dod:lint` | `npm run lint` → code 0, ou `N/A` si absent. |
| `dod:tests` | `npm test` vert **et** un test couvre le changement (`skills/testing`). |
| `dod:build` | `npm run build` → code 0, ou `N/A` si absent. |
| `dod:self-review` | passe `skills/self-review` sans finding `critical`. |
| `dod:evidence` | web app : `capture_screenshots({ baseUrl, routes, label })` des pages touchées (upload auto dans Documents) ; sinon `N/A`. |
| `dod:pr` | PR ouverte au gabarit PR_CONTRACT, CI verte, revue traitée. |

## Règles
- Une case ne passe `[x]` que si la preuve a réellement été obtenue **dans ce run** ; sinon `N/A` justifié, sinon laisser `[ ]`.
- **Tant qu'une case obligatoire reste `[ ]`**, le ticket **ne passe pas `DONE`** (doctrine d'arrêt `SOUL.md`).
- Reflète l'état des cases dans la description du ticket (via `add_comment`/recréation de la section DoD) pour que la preuve soit traçable.
- Gate serveur réel : `app/api/cli/ticket/route.ts` interdit déjà `DONE` hors `IN_PROGRESS`/`IN_REVIEW`. `TODO(verify)` : le parsing automatique des cases `dod:*` n'est pas encore côté serveur — la rigueur repose sur toi.
