// Lightweight i18n (no routing change). Dictionaries map English source labels
// to translations; `translate` falls back to the key so untranslated strings
// still render. Wire more keys incrementally. RTL-ready (see dir()).

export type Lang = "en" | "fr" | "ar"

export const LANGS: { code: Lang; label: string }[] = [
  { code: "en", label: "English" },
  { code: "fr", label: "Français" },
  { code: "ar", label: "العربية" },
]

export function dir(lang: Lang): "ltr" | "rtl" {
  return lang === "ar" ? "rtl" : "ltr"
}

type Dict = Record<string, string>

const fr: Dict = {
  Dashboard: "Tableau de bord",
  Workspaces: "Espaces",
  CRM: "CRM",
  Support: "Support",
  Analytics: "Analytique",
  Reports: "Rapports",
  Overview: "Aperçu",
  Projects: "Projets",
  IDE: "IDE",
  "Git & CI/CD": "Git & CI/CD",
  "Team Chat": "Discussion d'équipe",
  Documents: "Documents",
  Calendar: "Calendrier",
  Settings: "Paramètres",
  Profile: "Profil",
  "Admin panel": "Panneau admin",
  "Audit log": "Journal d'audit",
  "Log out": "Déconnexion",
  "New ticket": "Nouveau ticket",
  "Search…": "Rechercher…",
  "CRM — Pipeline": "CRM — Pipeline",
  "Each workspace is one client's isolated space.":
    "Chaque espace est l'environnement isolé d'un client.",
  "Personal information": "Informations personnelles",
  "Visible to your team.": "Visible par votre équipe.",
  Security: "Sécurité",
  Privacy: "Confidentialité",
  Save: "Enregistrer",
  "Save changes": "Enregistrer",
  Cancel: "Annuler",
  Create: "Créer",
  Delete: "Supprimer",
  Export: "Exporter",
  Import: "Importer",
  "New project": "Nouveau projet",
  "New lead": "Nouveau lead",
  "New workspace": "Nouvel espace",
  Members: "Membres",
  General: "Général",
}

// Arabic kept minimal; extend as needed.
const ar: Dict = {
  Dashboard: "لوحة التحكم",
  Workspaces: "مساحات العمل",
  Projects: "المشاريع",
  Settings: "الإعدادات",
  "Log out": "تسجيل الخروج",
}

const DICTS: Record<Lang, Dict> = { en: {}, fr, ar }

export function translate(lang: Lang, key: string): string {
  return DICTS[lang]?.[key] ?? key
}
