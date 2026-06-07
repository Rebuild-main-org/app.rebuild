"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

import { cn } from "@/lib/utils"

export function ProjectTabs({ base }: { base: string }) {
  const pathname = usePathname()
  const tabs = [
    { href: `${base}/board`, label: "Board" },
    { href: `${base}/backlog`, label: "Backlog" },
    { href: `${base}/timeline`, label: "Timeline" },
    { href: `${base}/list`, label: "List" },
    { href: `${base}/dashboard`, label: "Dashboard" },
    { href: `${base}/tests`, label: "Tests" },
    { href: `${base}/docs`, label: "Docs" },
    { href: `${base}/documents`, label: "Files" },
  ]
  return (
    <nav className="flex gap-1 border-b px-4 md:px-6">
      {tabs.map((t) => {
        const active = pathname === t.href
        return (
          <Link
            key={t.href}
            href={t.href}
            className={cn(
              "border-b-2 px-3 py-2.5 text-sm transition-colors",
              active
                ? "border-primary text-foreground font-medium"
                : "text-muted-foreground hover:text-foreground border-transparent"
            )}
          >
            {t.label}
          </Link>
        )
      })}
    </nav>
  )
}
