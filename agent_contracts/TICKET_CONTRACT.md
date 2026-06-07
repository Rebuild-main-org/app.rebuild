# TICKET_CONTRACT — anatomie d'un ticket (contrat partagé)

Produit par **`scaffold`** (`planFromArchitecture` → `app/api/workspaces/[id]/scaffold/route.ts`) et par le **CLI** (MCP `create_ticket`, `cli/mcp-rebuild.mjs`). Consommé tel quel par les deux. Vocabulaire : voir `DOMAIN_GLOSSARY.md`.

## 1. Règle de granularité
**1 ticket = 1 unité livrable, testable, revue en une PR.** Si un ticket ne peut pas être prouvé « fait » par un test ou une vérification concrète, il est trop gros → le découper en sous‑tâches (`subtasks` côté plan, `SUBTASK` + `parentId` côté création).

## 2. Champs (alignés sur le code réel)
| Champ | Obligatoire | Source / valeurs |
|---|---|---|
| `title` | oui | impératif, concis (« Add login rate-limit ») |
| `description` | oui | markdown : **Contexte**, **Critères d'acceptation**, puis la **Definition of Done** (§3) |
| `type` | oui | `TicketType` (glossaire). Plan: `TASK,BUG,FEATURE,SPIKE,EPIC` |
| `priority` | oui | `TicketPriority` |
| `points` | oui (nullable) | `StoryPoints` ou `null` |
| `labels` | non | `string[]` |
| `parentShortId` / `parentId` | non | rattache à un parent (EPIC → SUBTASK) |
| `links` | non | `{ to/toShortId, type }`, `LinkType` |
| `assignee` | oui | `"me"` ou email d'un membre du workspace |

`shortId` (`<shortCode>-<n>`) est **alloué par le serveur** (`next_ticket_number`, `lib/mutations.ts`) — un agent ne l'invente jamais.

## 3. Definition of Done — format **parsable** (jamais de prose libre)
La DoD est un bloc de cases à cocher à **clés stables** `dod:<id>`. Le bloc actuel (`DEFINITION_OF_DONE`, `app/api/workspaces/[id]/scaffold/route.ts` L11) est étendu à cette forme normative :

```md
## Definition of Done
- [ ] dod:acceptance — Critères d'acceptation satisfaits
- [ ] dod:typecheck — `tsc --noEmit` (ou script `typecheck`) passe
- [ ] dod:lint — lint passe (ou `N/A` si le repo n'en a pas)
- [ ] dod:tests — tests ajoutés/à jour et verts
- [ ] dod:build — build passe (ou `N/A`)
- [ ] dod:self-review — diff auto-revu selon REVIEW_RUBRIC.md
- [ ] dod:evidence — captures/logs joints (web app) ou `N/A`
- [ ] dod:pr — PR ouverte, CI verte, revue traitée
```

Règles de parsing :
- Chaque ligne = `- [ ]` (non fait) ou `- [x]` (fait), un espace, la clé `dod:<id>`, ` — `, le libellé.
- Les clés sont **fixes** ; un agent ne renomme pas une clé, il coche/décoche.
- « DONE » d'un ticket exige que **toutes** les clés soient `[x]` ou justifiées `N/A`. Voir `cli/agent/skills/verification/SKILL.md`.
- Gate serveur réel : la transition `DONE` est refusée hors `IN_PROGRESS`/`IN_REVIEW` (`app/api/cli/ticket/route.ts`). `TODO(verify)` : le parsing des cases `dod:*` n'est pas encore appliqué côté serveur — c'est aujourd'hui une obligation portée par l'agent (skill `verification`).

## 4. Exemple conforme
```md
**Contexte** — Le login accepte un nombre illimité de tentatives.
**Critères d'acceptation**
- 5 tentatives échouées / 10 min → 429 + délai.
- Compteur réinitialisé après succès.

## Definition of Done
- [ ] dod:acceptance — Critères d'acceptation satisfaits
- [ ] dod:typecheck — `tsc --noEmit` passe
- [ ] dod:lint — lint passe
- [ ] dod:tests — test du rate-limit ajouté et vert
- [ ] dod:build — `N/A`
- [ ] dod:self-review — diff auto-revu selon REVIEW_RUBRIC.md
- [ ] dod:evidence — `N/A` (pas d'UI)
- [ ] dod:pr — PR ouverte, CI verte, revue traitée
```
Type `FEATURE`, priority `HIGH`, points `3`.
