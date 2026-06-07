# TICKETS — format & manipulation (agent rebuild216)

Ce fichier embarque le **contrat de ticket** : voir `agent_contracts/TICKET_CONTRACT.md` (anatomie, granularité, **DoD parsable**) et `agent_contracts/DOMAIN_GLOSSARY.md` (énums). Au runtime, la liste réelle des tickets du projet est aussi matérialisée par `writeContext` (`cli/rebuild216.mjs` L362) au format :

```
## [SHORT-ID] Titre  · type/priority · status
<description>
```

## Lire / écrire les tickets (outils MCP réels — `cli/mcp-rebuild.mjs`)
- `list_tickets` — l'état courant du board.
- `create_ticket` — créer un ticket **pleinement renseigné** (cf. TICKET_CONTRACT : description avec Contexte + Critères d'acceptation + bloc DoD, `type`, `priority`, `points`, `labels`, `parentShortId`, `links`, `assignee`).
- `update_ticket_status(ticketId, status)` — `BACKLOG|TODO|IN_PROGRESS|IN_REVIEW|DONE`. Rappel : `DONE` refusé hors `IN_PROGRESS`/`IN_REVIEW` (`app/api/cli/ticket/route.ts`).
- `add_comment(ticketId, content)` — journaliser ce qui a été fait.

## Règles
- Le `shortId` est **alloué par le serveur** — ne jamais l'inventer ni le réécrire.
- Un ticket par PR (granularité, TICKET_CONTRACT §1). Découper en `SUBTASK` (`parentId`) si non testable d'un bloc.
- Le bloc **Definition of Done** est obligatoire dans la description et se coche au fil de l'avancement ; un ticket ne passe `DONE` que si toutes les clés `dod:*` sont `[x]` ou justifiées `N/A` (preuve via `skills/verification`).
- Création de backlog : uniquement de **vrais** tickets cohérents avec le but du projet — jamais de filler, jamais marquer `DONE` quelque chose de non implémenté/vérifié.
