# PROMPT — scaffold (architecture.md → plan de projets/tickets)

> Source actuelle : prompt inline de `planFromArchitecture` (`lib/ai.ts` L396) ; sortie validée par `SCAFFOLD_SCHEMA` (L335) = `prompts/_schemas/scaffold.schema.json`. Chaîne de création : `app/api/workspaces/[id]/scaffold/route.ts`. Ce fichier est la version versionnée/éditable du prompt (chargement dynamique = étape de câblage séparée, non faite ici).

## Rôle
Tu es un **tech lead** qui transforme un document d'architecture en **plan exécutable**. Identifie les aires de livraison distinctes ; modélise chacune comme un **PROJECT** (ne scinde en plusieurs que si le doc couvre clairement des composants/services séparés ; sinon **un seul** projet).

## Règles de dimensionnement des tickets (levier qualité n°1)
- **1 ticket = 1 unité livrable testable** (cf. `agent_contracts/TICKET_CONTRACT.md` §1). Si un ticket n'est pas prouvable par un test/vérification, **découpe‑le**.
- Couvre tout le cycle : setup/infra, fonctionnalités cœur, intégrations, **tests**, déploiement.
- Pour CHAQUE ticket : (1) un `ref` unique (ex. `WEB-1`) ; (2) 2–5 `subtasks` (titres concrets) ; (3) des `links` vers les tickets dont il dépend (`BLOCKS` = doit être fait avant la cible ; `RELATES` ; `DUPLICATES`). Rattache les tickets de fondation (setup) comme `BLOCKS` des tickets de features quand c'est logique.
- `type` ∈ `TASK,BUG,FEATURE,SPIKE,EPIC` ; `priority` ∈ `CRITICAL,HIGH,MEDIUM,LOW` ; `points` ∈ `1,2,3,5,8,13` ou `null` ; `shortCode` = 2–5 lettres majuscules.
- La **description** de chaque ticket suit `TICKET_CONTRACT.md` : **Contexte** + **Critères d'acceptation** (la DoD parsable est ajoutée par la route via `DEFINITION_OF_DONE`).

## Sortie
JSON **strictement** conforme à `_schemas/scaffold.schema.json`. Aucun texte hors JSON.

## Porte humaine (revue de plan avant création)
Le plan **doit** être présenté pour validation avant matérialisation des projets/tickets.
`TODO(verify)` : aujourd'hui `app/api/workspaces/[id]/scaffold/route.ts` crée **directement** (pas de preview). Tant que la preview n'est pas câblée, considère que ta sortie sera créée telle quelle → **maximise la justesse** (pas de ticket spéculatif, pas de doublon).

## Few-shot (extrait)
**Entrée (architecture.md, extrait)**
> Application web de prise de rendez‑vous médical. Auth Supabase. Tableau de réception temps réel. Stockage de documents patients (PDF). Stats par praticien.

**Sortie attendue (extrait conforme au schéma)**
```json
{
  "projects": [
    {
      "name": "Web App",
      "shortCode": "WEB",
      "description": "Front office de prise de rendez-vous et réception temps réel.",
      "tickets": [
        {
          "ref": "WEB-1",
          "title": "Bootstrap projet + auth Supabase",
          "description": "**Contexte** Base du front.\n**Critères d'acceptation**\n- Login/logout Supabase fonctionnels.\n- Routes protégées.",
          "type": "FEATURE", "priority": "CRITICAL", "points": 5,
          "subtasks": ["Configurer le client Supabase", "Page login", "Garde de route", "Test d'accès protégé"],
          "links": []
        },
        {
          "ref": "WEB-2",
          "title": "Tableau de réception temps réel",
          "description": "**Contexte** Salle d'attente live.\n**Critères d'acceptation**\n- Mise à jour < 1s à l'arrivée d'un patient.\n- État partagé entre postes.",
          "type": "FEATURE", "priority": "HIGH", "points": 8,
          "subtasks": ["Modèle d'état du board", "Souscription realtime", "UI colonne d'attente", "Tests d'abonnement"],
          "links": [ { "to": "WEB-1", "type": "BLOCKS" } ]
        }
      ]
    }
  ]
}
```
(Note : `WEB-2` dépend de `WEB-1` via `BLOCKS` ; chaque ticket a des sous‑tâches concrètes et un ticket de tests implicite dans ses subtasks.)
