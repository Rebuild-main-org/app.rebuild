# FINDINGS — investigation des deux agents (Phase 1, lecture seule)

Tout est tracé au code réel. Aucune modification effectuée.

## Agent A — agent autonome CLI (`cli/rebuild216.mjs`)
**Rôle réel** : cloner le repo workspace, se placer sur la branche projet, livrer les tickets, intégrer (`-ops`).
**Prompt/persona (source)** : `WORKFLOW` (L246) + `buildSystem(ctx)` (L299) ; tâches `deliveryTask` (L579) / `chatPreamble` (L592).
**Matérialisé par `writeContext` (L324)** dans `<repo>/.rebuild/` : `WORKFLOW.md` (L329), `SOUL.md` (L330), `SKILLS.md` (L331), `ARCHITECTURE.md` (L333), `TICKETS.md` (L369), `agent/<nom>/…` + `agent/INDEX.md` (L341‑359), `docs/` (L372+).
**Modes** (`agentOptions` + `streamAgent` opts) : `cli-delivery`, `cli-chat`, `cli-ops-conflict` (`resolveConflictWithClaude`), `cli-ops-fix` (`fixStepWithClaude`). Chaque mode = même moteur, prompt/tâche différents.
**Source soul/skills/architecture** : `ctx.agentDocs` = agents de bibliothèque sélectionnés (fusion `pick()` dans `app/api/cli/context/route.ts` L104‑105) **sinon** défauts globaux table `agent_docs` (`globals`). `WORKFLOW` reste codé en dur.
**Entrées** : `/api/cli/context` (tickets, agentDocs, agents, documents). **Sorties** : commits locaux + statuts via MCP (`/api/cli/ticket`), PR via `/api/cli/integration`.

## Agent B — fonctions IA serveur (`lib/ai.ts`, `systemBlocks` L38)
Prompts **inline** + schémas JSON ; chaque appel enveloppé par `withAi(access, "<feature>", …)` (gouvernance) :
| Fonction | L | Sortie / schéma | Feature |
|---|---|---|---|
| `codeReview` | 115 | `CodeReview` (`REVIEW_SCHEMA` L72 : score A‑D, findings[severity info/warning/critical, title, detail]) | `review`, `integration-review` |
| `planFromArchitecture` | 391 | `ScaffoldPlan` (`SCAFFOLD_SCHEMA` L335) | `scaffold` |
| `triageTicket` | 200 | `TriageSuggestion` (`TRIAGE_SCHEMA` L188) | `triage` |
| `quoteFromLead` | 256 | `QuoteDraft` (`QUOTE_SCHEMA` L234) | `quote` |
| `chat` | 156 | texte | `chat` |
| `summarize` 301 / `standupDigest` 283 / `changelogFromPRs` 291 / `generateDocs` 141 | texte | `summary/standup/changelog/docs` |

**Chaîne scaffold** (`app/api/workspaces/[id]/scaffold/route.ts`) : `planFromArchitecture` → Pass 1 `createProject`/`createTicket` (+ `DEFINITION_OF_DONE` L11‑16 ajouté à la description, sous‑tâches type SUBTASK) → Pass 2 `addLink` (BLOCKS/RELATES/DUPLICATES) (L91‑108). Création **directe**, sans preview.

## Contrats implicites actuels
- **Ticket** : `shortId = <shortCode>-<n>` ; champs `createTicket` ; `TICKETS.md` = `## [shortId] title · type/priority · status` (L366).
- **DoD** : checklist markdown fixe (`DEFINITION_OF_DONE`, scaffold) — **non parsée, non vérifiée**.
- **Commit/PR** : message `feat: … [ACME-142]` + trailer `rebuild216-agent: true` (WORKFLOW L283‑286) ; branche delivery = `branchForProject` ; intégration = `ops/integration-<ts>` ; corps PR listant merged/conflicted.
- **Revue** : `REVIEW_SCHEMA` (A‑D + sévérités) — utilisée par `codeReview` uniquement.
- **Glossaire** (`lib/types.ts`) : TicketStatus BACKLOG/TODO/IN_PROGRESS/IN_REVIEW/DONE ; Priority CRITICAL/HIGH/MEDIUM/LOW ; LinkType BLOCKS/RELATES/DUPLICATES ; ProjectStatus PLANNING/ACTIVE/REVIEW/ON_HOLD/DONE/CANCELLED ; StoryPoints 1,2,3,5,8,13.

## Incohérences entre A et B
1. **DoD** : prose/checklist non parsable (scaffold) vs « run typecheck && tests » (WORKFLOW L275) — aucun contrat commun, aucune preuve exigée. Le gate DONE (`/api/cli/ticket`) ne vérifie que la progression de statut, pas la DoD.
2. **Taxonomie des types** : scaffold {TASK,BUG,FEATURE,SPIKE,EPIC} vs triage {TASK,BUG,FEATURE,SPIKE} vs `TicketType` réel (7, dont REVIEW/SUBTASK). Enums divergents selon le producteur.
3. **Rubrique de revue non partagée** : `codeReview` a la grille ; l'auto‑revue CLI (WORKFLOW étape 4) ne l'applique pas avant la PR.
4. **SKILLS monolithique** : `SKILLS.md` = un seul bloc (skills.md de l'agent biblio) — pas de progressive disclosure.
5. **Contrat PR/branche non centralisé** : conventions éparpillées (WORKFLOW + cmdOps) ; `changelogFromPRs` en dépend sans contrat pinné.

## Tâches orphelines / non couvertes (aucune action prise — règle d'or n°5)
- **Revue de plan avant création** (porte humaine scaffold) — *absente*. Devrait vivre : route/fonction `scaffold` (preview → approbation). **gap‑bloquant.**
- **Preuve de DoD par ticket** (parser la checklist, exiger commit/tests/screenshots avant DONE) — *sans propriétaire*. Devrait vivre : skill CLI `verification` + gate `/api/cli/ticket`. **gap‑bloquant.**
- **Auto‑revue CLI via REVIEW_RUBRIC avant PR** — *absente*. Skill CLI `self-review`. **gap‑bloquant.**
- **Déduplication d'un backlog ré‑importé** — *absente* (re‑scaffold duplique). Fonction/route `scaffold`. **gap‑amélioration.**
- **Release + changelog post‑merge** — `ghCreateRelease`/`changelogFromPRs` existent mais **aucun agent ne les déclenche**. Nouveau composant ? **gap‑amélioration.**
- **ARCHITECTURE.md régénéré depuis le vrai repo** — actuellement statique (agent_docs/biblio), risque d'obsolescence. Skill/contexte CLI. **gap‑amélioration.**
- **Rollback / reprise sur échec de mode** — pas de doctrine. Skills CLI `build-triage`/`conflict-resolution`. **gap‑amélioration.**

> Note : `cost/budget` est désormais **couvert** (`ai_usage` + `withAi`) ; merge sur `main` = porte humaine **volontaire** (branch protection), pas un orphelin.
