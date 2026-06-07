"use client"

import { DiffEditor } from "@monaco-editor/react"
import { useTheme } from "next-themes"

import { Skeleton } from "@/components/ui/skeleton"
import { languageForPath } from "@/components/ide/code-editor"

export function DiffViewer({
  path,
  original,
  modified,
}: {
  path: string
  original: string
  modified: string
}) {
  const { resolvedTheme } = useTheme()
  return (
    <DiffEditor
      height="100%"
      language={languageForPath(path)}
      original={original}
      modified={modified}
      theme={resolvedTheme === "dark" ? "vs-dark" : "light"}
      loading={<Skeleton className="size-full rounded-none" />}
      options={{
        fontSize: 13,
        readOnly: true,
        renderSideBySide: true,
        automaticLayout: true,
        scrollBeyondLastLine: false,
        fontFamily: "var(--font-mono), monospace",
      }}
    />
  )
}
