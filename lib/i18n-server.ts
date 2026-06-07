// Server-side translation: reads the `rebuild_lang` cookie and returns a bound
// translate function for use in server components (page titles, etc.).

import "server-only"
import { cookies } from "next/headers"
import { translate, type Lang } from "@/lib/i18n"

export async function getT(): Promise<{ t: (key: string) => string; lang: Lang }> {
  const lang = (((await cookies()).get("rebuild_lang")?.value) as Lang) || "en"
  return { t: (key: string) => translate(lang, key), lang }
}
