# 08 — Audit UX / UI

Base : shadcn/ui + Tailwind v4 + lucide + sonner + next-themes. Design cohérent, moderne, dark/light.

## Points forts ✅
- **Système de design cohérent** (shadcn, tokens, dark mode, densité préférable).
- **Navigation claire** : sidebar globale + sidebar workspace + topbar (recherche ⌘K, notifs, profil).
- **Board Kanban riche** : drag&drop, WIP, recherche/filtres/priorité, vues sauvegardées, bulk-edit, **scroll par colonne**, présence temps réel.
- **Ticket dialog (Sheet)** complet : statut/priorité/assigné, description, sous-tâches, liens, watchers, pièces jointes, commentaires éditables + @mentions, champs custom, time tracking, activité.
- **Copilot IA** intégré, toasts d'action, feedback temps réel.
- **Accessibilité** : correctif récent `DialogTitle` (titre toujours présent), composants radix accessibles.

## Problèmes UX/UI (à corriger)

### 🟠 Haute
1. **Responsive non audité** : sidebars fixes, board en `overflow-x`, dialogues larges → expérience mobile/tablette incertaine. Audit + breakpoints à faire.
2. **i18n non câblé** : préférence `language` (en/fr/ar) stockée mais **UI 100 % anglaise**. L'arabe implique aussi le **RTL**.
3. **États vides pauvres** : plusieurs listes affichent juste "No X" sans illustration/CTA (onboarding raté pour un nouvel utilisateur).
4. **Pas d'onboarding** : aucun wizard/tour/données d'exemple → workspace vide intimidant (atténué par l'import architecture.md, mais pas guidé).
5. **Pagination absente** : longues listes (commits, audit, notifications) chargées en entier → lenteur perçue + scroll infini non géré.

### 🟡 Moyenne
6. **Feedback de chargement** inégal : certains écrans serveur n'ont pas de skeleton.
7. **Gestion d'erreurs** : toasts génériques ("Failed") peu actionnables par endroits.
8. **Cohérence des actions destructives** : `confirm()` natif utilisé (ex. suppression ticket, merge) → remplacer par AlertDialog stylé.
9. **Recherche ⌘K** : pas d'historique récent ni navigation clavier complète dans les résultats.
10. **Densité d'info** sur l'overview : beaucoup de cartes ; hiérarchie visuelle à renforcer.
11. **Formulaires longs** (devis, meeting) sans validation inline progressive.
12. **Notifications** : pas de groupement, pas de "tout marquer lu" visible partout, pas de préférences.

### 🟢 Faible
13. **Pas de raccourcis clavier** au-delà de ⌘K (créer, naviguer colonnes).
14. **Avatars** : initiales seulement (pas d'upload d'avatar utilisateur).
15. **Thème** : accent personnalisable stocké mais peu exploité visuellement.
16. **Pas de mode plein écran / focus** pour l'IDE et le board.

## Accessibilité (WCAG)
- ✅ Composants radix (focus, aria) ; titres de dialogue corrigés.
- ⚠️ Contrastes à vérifier (badges colorés sur fond clair), navigation clavier board (drag&drop non accessible clavier), pas de `prefers-reduced-motion`, labels de formulaires à auditer.
- ❌ RTL (arabe) non supporté, pas d'audit Lighthouse/axe formel.

## Recommandations
1. **Audit responsive** + drawer mobile pour les sidebars + board en colonnes empilées sur petit écran.
2. **i18n next-intl** (en/fr puis ar + RTL).
3. **États vides + onboarding** (illustrations, CTA, données d'exemple, tour produit).
4. **Pagination + skeletons** partout.
5. Remplacer `confirm()` par **AlertDialog**, normaliser les messages d'erreur.
6. Audit **axe/Lighthouse** en CI, contrastes, navigation clavier, `reduced-motion`.
