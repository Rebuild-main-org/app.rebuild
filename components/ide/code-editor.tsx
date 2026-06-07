"use client"

import { Editor } from "@monaco-editor/react"
import { useTheme } from "next-themes"

import { Skeleton } from "@/components/ui/skeleton"

export function languageForPath(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase()
  switch (ext) {
    case "ts":
    case "tsx":
      return "typescript"
    case "js":
    case "jsx":
    case "mjs":
      return "javascript"
    case "json":
      return "json"
    case "md":
      return "markdown"
    case "css":
      return "css"
    case "html":
      return "html"
    case "yml":
    case "yaml":
      return "yaml"
    case "sql":
      return "sql"
    default:
      return "plaintext"
  }
}

export function CodeEditor({
  path,
  value,
  onChange,
  onCursor,
}: {
  path: string
  value: string
  onChange: (value: string) => void
  onCursor?: (line: number) => void
}) {
  const { resolvedTheme } = useTheme()
  return (
    <Editor
      key={path}
      height="100%"
      path={path}
      language={languageForPath(path)}
      value={value}
      onChange={(v) => onChange(v ?? "")}
      onMount={(editor) => {
        editor.onDidChangeCursorPosition((e) => onCursor?.(e.position.lineNumber))
      }}
      theme={resolvedTheme === "dark" ? "vs-dark" : "light"}
      loading={<Skeleton className="size-full rounded-none" />}
      options={{
        fontSize: 13,
        minimap: { enabled: true },
        scrollBeyondLastLine: false,
        automaticLayout: true,
        tabSize: 2,
        renderWhitespace: "selection",
        fontFamily: "var(--font-mono), monospace",
      }}
    />
  )
}
