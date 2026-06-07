"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useTheme } from "next-themes"
import { toast } from "sonner"

import { applyAppearance } from "@/components/profile/preferences-applier"

import type {
  Density,
  Language,
  ThemePref,
  UserPreferences,
} from "@/lib/types"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"

const ACCENTS = ["#0a0a0a", "#2563eb", "#7c3aed", "#db2777", "#ea580c", "#16a34a"]

export function AppearanceForm({ preferences }: { preferences: UserPreferences }) {
  const { setTheme } = useTheme()
  const router = useRouter()
  const [theme, setThemePref] = useState<ThemePref>(preferences.theme)
  const [density, setDensity] = useState<Density>(preferences.density)
  const [language, setLanguage] = useState<Language>(preferences.language)
  const [accent, setAccent] = useState(preferences.accent)
  const [emailDigest, setEmailDigest] = useState(preferences.emailDigest)
  const [saving, setSaving] = useState(false)

  // Live preview as the user changes density/accent.
  function previewDensity(d: Density) {
    setDensity(d)
    applyAppearance({ density: d })
  }
  function previewAccent(a: string) {
    setAccent(a)
    applyAppearance({ accent: a })
  }

  async function save() {
    setSaving(true)
    setTheme(theme) // apply immediately
    applyAppearance({ density, accent })
    // Language is read from a cookie by the i18n providers — set it so the
    // choice takes effect (and refresh to re-render server components).
    document.cookie = `rebuild_lang=${language}; path=/; max-age=31536000`
    const res = await fetch("/api/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        preferences: { theme, density, language, accent, emailDigest },
      }),
    })
    setSaving(false)
    if (!res.ok) return toast.error("Could not save settings")
    toast.success("Preferences saved")
    router.refresh()
  }

  return (
    <div className="grid max-w-lg gap-5">
      <div className="space-y-1.5">
        <Label>Theme</Label>
        <Select value={theme} onValueChange={(v) => setThemePref(v as ThemePref)}>
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="light">Light</SelectItem>
            <SelectItem value="dark">Dark</SelectItem>
            <SelectItem value="system">System</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label>Density</Label>
        <Select value={density} onValueChange={(v) => previewDensity(v as Density)}>
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="comfortable">Comfortable</SelectItem>
            <SelectItem value="compact">Compact</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label>Language</Label>
        <Select value={language} onValueChange={(v) => setLanguage(v as Language)}>
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="en">English</SelectItem>
            <SelectItem value="fr">Français</SelectItem>
            <SelectItem value="ar">العربية</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label>Accent color</Label>
        <div className="flex gap-2">
          {ACCENTS.map((c) => (
            <button
              key={c}
              onClick={() => previewAccent(c)}
              className={cn(
                "size-7 rounded-full border-2 transition",
                accent === c ? "border-ring scale-110" : "border-transparent"
              )}
              style={{ backgroundColor: c }}
              aria-label={`Accent ${c}`}
            />
          ))}
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <Checkbox
          checked={emailDigest}
          onCheckedChange={(v) => setEmailDigest(!!v)}
        />
        Send me a daily email digest
      </label>

      <div>
        <Button onClick={save} disabled={saving}>
          Save preferences
        </Button>
      </div>
    </div>
  )
}
