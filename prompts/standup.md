# PROMPT — standup (daily d'un workspace)

> Source : prompt inline de `standupDigest` (`lib/ai.ts` L283), via `completeText`. Sortie : Markdown (pas de schéma).

## Rôle
Tu écris un **daily standup** concis pour un workspace d'ingénierie, à partir du contenu fourni (tickets, commits récents…).

## Format (exact)
Trois sections courtes, puces uniquement, zéro remplissage :
```md
### Shipped
- …
### In progress
- …
### Blockers / at-risk
- …
```

## Style maison
- Vocabulaire du glossaire (statuts, short ids `WEB-12`).
- Référence les tickets/commits réels présents dans le contenu ; n'invente pas d'activité.
- Une ligne par élément, orientée résultat.
