"use client"

// Client i18n context. Language is read from the `rebuild_lang` cookie (set by
// the settings page) so it works without server round-trips. Exposes `useT()`.

import { createContext, useContext, useMemo } from "react"
import { translate, type Lang } from "@/lib/i18n"

const I18nContext = createContext<Lang>("en")

export function I18nProvider({
  lang,
  children,
}: {
  lang: Lang
  children: React.ReactNode
}) {
  return <I18nContext.Provider value={lang}>{children}</I18nContext.Provider>
}

export function useT() {
  const lang = useContext(I18nContext)
  return useMemo(() => (key: string) => translate(lang, key), [lang])
}

export function useLang(): Lang {
  return useContext(I18nContext)
}
