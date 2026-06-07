# DOMAIN_GLOSSARY — vocabulaire commun des deux agents

Source de vérité : `lib/types.ts`. Les deux agents (CLI rebuild216 et fonctions serveur `lib/ai.ts`) **doivent** employer ces termes/valeurs **à l'identique**. Toute valeur hors de ces listes est invalide.

## Entités
- **Workspace** (`Workspace`, `lib/types.ts`) — l'espace d'un client. Un workspace = **un** repo GitHub (`githubRepo`). Champs notables : `clientName`, `clientEmail`, `technologies: string[]`, `status: WorkspaceStatus`.
- **Project** (`Project`) — une unité de livraison dans un workspace. Un projet = **une branche** git (voir `branchForProject`, `lib/github.ts`). Préfixe de ticket = `shortCode`. Peut appartenir à un `ProjectGroup` (`group_id`).
- **ProjectGroup** (`ProjectGroup`) — regroupement de projets dans un workspace.
- **Ticket** (`Ticket`) — unité de travail. `shortId` = `<shortCode>-<n>` (ex. `WEB-12`), unique par projet (`tickets_project_shortid_key`).
- **Comment / Activity / TimeEntry** — fil de discussion, journal d'événements, temps passé d'un ticket.
- **AI Agent (bibliothèque)** (`agents` + `agent_files`) — bundle de fichiers (`soul.md`, `skills.md`, …) injecté par le CLI. Distinct des deux agents *runtime* décrits ici.

## Énumérations (valeurs exactes)
- **WorkspaceStatus** : `ACTIVE` · `PAUSED` · `ARCHIVED`.
- **ProjectStatus** : `PLANNING` · `ACTIVE` · `REVIEW` · `ON_HOLD` · `DONE` · `CANCELLED`.
- **TicketStatus** : `BACKLOG` · `TODO` · `IN_PROGRESS` · `IN_REVIEW` · `DONE`.
- **TicketType** : `TASK` · `BUG` · `FEATURE` · `REVIEW` · `EPIC` · `SPIKE` · `SUBTASK`.
- **TicketPriority** : `CRITICAL` · `HIGH` · `MEDIUM` · `LOW` (ordre de priorité décroissant).
- **LinkType** : `BLOCKS` · `RELATES` · `DUPLICATES`.
- **StoryPoints** : `1` · `2` · `3` · `5` · `8` · `13` (sinon `null`).
- **Role** : `SUPER_ADMIN` · `ADMIN` · `LEAD` · `PM` · `ENGINEER` · `QA` · `DESIGNER` · `SALES` · `FINANCE` · `SUPPORT` · `CLIENT`.

### Sous-ensembles producteurs (à connaître)
- `planFromArchitecture` (scaffold) n'émet que les types `TASK,BUG,FEATURE,SPIKE,EPIC` (`SCAFFOLD_SCHEMA`, `lib/ai.ts` L335).
- `triageTicket` ne classe qu'en `TASK,BUG,FEATURE,SPIKE` (`TRIAGE_SCHEMA`, L188).
- Le CLI peut créer tous les `TicketType` via le MCP `create_ticket` (`cli/mcp-rebuild.mjs`).
> Règle : un agent ne **réduit** jamais une valeur produite par l'autre ; il la respecte telle quelle. `SUBTASK` est réservé aux sous-tâches créées avec `parentId`.

## Cycle de vie d'un ticket (transitions autorisées)
`BACKLOG`/`TODO` → `IN_PROGRESS` → `IN_REVIEW` → `DONE`.
- **Gate réel** : `/api/cli/ticket` (`app/api/cli/ticket/route.ts`) **refuse** `DONE` si le statut courant n'est pas `IN_PROGRESS` ou `IN_REVIEW` (HTTP 409). Aucun saut direct vers `DONE`.

## Branches & repo
- 1 workspace → 1 repo ; 1 projet → 1 branche = `branchForProject(name, shortCode)` (`lib/github.ts`).
- Branche d'intégration `-ops` : `ops/integration-<timestamp>` (`cli/rebuild216.mjs`).
- Cible d'intégration : `main` (ou la branche par défaut du repo).

## Gouvernance IA
- Tout appel modèle est journalisé (`ai_usage`) via `withAi(user, "<feature>", fn, scope?)` (`lib/ai-usage.ts`). Features : `chat, review, integration-review, triage, quote, scaffold, summary, standup, changelog, docs` (serveur) et `cli-delivery, cli-chat, cli-ops-conflict, cli-ops-fix` (CLI, via `/api/cli/usage`).
