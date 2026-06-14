"use client"

import { useEffect } from "react"
import { useTheme } from "next-themes"

const DEFAULT_ACCENT = "#0a0a0a"

// Persist the chosen theme to the user's account so a quick toggle (topbar
// button / "d" hotkey) survives a reload and stays in sync across devices.
// next-themes already updated localStorage; this just mirrors it to the DB.
export function persistTheme(theme: string) {
  if (typeof fetch === "undefined") return
  fetch("/api/profile", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ preferences: { theme } }),
  }).catch(() => {
    /* unauthenticated pages (login) 401 — ignore */
  })
}

function readableOn(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex)
  if (!m) return "#ffffff"
  const n = parseInt(m[1], 16)
  const r = (n >> 16) & 255
  const g = (n >> 8) & 255
  const b = n & 255
  // Relative luminance → pick a contrasting foreground.
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return lum > 0.6 ? "#0a0a0a" : "#ffffff"
}

// Apply user appearance preferences to the document. Accent overrides the
// shadcn primary token (buttons, rings); the default black restores the theme.
export function applyAppearance({ density, accent }: { density?: string; accent?: string }) {
  if (typeof document === "undefined") return
  const root = document.documentElement
  if (density) root.dataset.density = density
  const vars = ["--primary", "--ring", "--sidebar-primary"]
  if (accent && accent.toLowerCase() !== DEFAULT_ACCENT) {
    for (const v of vars) root.style.setProperty(v, accent)
    root.style.setProperty("--primary-foreground", readableOn(accent))
    root.style.setProperty("--sidebar-primary-foreground", readableOn(accent))
  } else {
    // Reset to the theme defaults.
    for (const v of [...vars, "--primary-foreground", "--sidebar-primary-foreground"]) {
      root.style.removeProperty(v)
    }
  }
}

// Mounted in the app layout to apply the saved preferences on every load.
export function PreferencesApplier({
  theme,
  density,
  accent,
}: {
  theme?: string
  density?: string
  accent?: string
}) {
  const { setTheme } = useTheme()
  useEffect(() => {
    applyAppearance({ density, accent })
  }, [density, accent])
  // Honor the saved theme on load. next-themes otherwise reads only its own
  // localStorage, so a saved "dark" preference never applied (the Settings
  // dropdown showed Dark while the app rendered light).
  useEffect(() => {
    if (theme) setTheme(theme)
  }, [theme, setTheme])
  return null
}
