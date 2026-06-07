"use client"

import { useCallback, useEffect, useState } from "react"
import { Loader2, Save, Bot, Sparkles, Network } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

const PLACEHOLDERS: Record<DocName, string> = {
  soul:
    "# Soul — who the agent is\n\nDefine the agent's identity, tone, values and the way it should approach work on this org's projects. This is injected as the agent's persona.",
  skills:
    "# Skills — how the agent works\n\nList the conventions, stack, commands (typecheck/test/build), coding standards and workflow rules the agent must follow when delivering tickets.",
  architecture:
    "# Architecture — how the system is built\n\nDescribe the architecture the agent should respect: layers, module boundaries, data flow, where logic belongs, naming/folder conventions, and patterns to follow (or avoid) when changing the codebase.",
}

const LABELS: Record<DocName, string> = {
  soul: "soul.md",
  skills: "skills.md",
  architecture: "architecture.md",
}

type DocName = "soul" | "skills" | "architecture"

export function AgentDocsEditor() {
  const [skills, setSkills] = useState("")
  const [soul, setSoul] = useState("")
  const [architecture, setArchitecture] = useState("")
  const [state, setState] = useState<"loading" | "ready" | "error">("loading")
  const [errorMsg, setErrorMsg] = useState("")
  const [saving, setSaving] = useState<DocName | null>(null)

  const load = useCallback(async () => {
    setState("loading")
    const res = await fetch("/api/admin/agent-docs")
    if (!res.ok) {
      const { error } = await res.json().catch(() => ({ error: "Failed" }))
      setErrorMsg(error ?? "Failed to load agent docs")
      setState("error")
      return
    }
    const data = await res.json()
    setSkills(data.skills ?? "")
    setSoul(data.soul ?? "")
    setArchitecture(data.architecture ?? "")
    setState("ready")
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load()
  }, [load])

  async function save(name: DocName, content: string) {
    setSaving(name)
    const res = await fetch("/api/admin/agent-docs", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, content }),
    })
    setSaving(null)
    const data = await res.json().catch(() => ({}))
    if (!res.ok) return toast.error(data.error ?? "Could not save")
    toast.success(`${LABELS[name]} saved — applied to the next rebuild216 run`)
  }

  if (state === "loading") {
    return (
      <div className="text-muted-foreground flex items-center gap-2 p-6 text-sm">
        <Loader2 className="size-4 animate-spin" /> Loading agent docs…
      </div>
    )
  }
  if (state === "error") {
    return (
      <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-400">
        {errorMsg}
        <div className="text-muted-foreground mt-1 text-xs">
          Run <code>supabase/agent-docs.sql</code> to create the <code>agent_docs</code> table.
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <p className="text-muted-foreground text-sm">
        These documents are injected into the autonomous <code>rebuild216</code> agent on every run:{" "}
        <strong>Soul</strong> shapes who it is, <strong>Skills</strong> shapes how it works, and{" "}
        <strong>Architecture</strong> shapes the system it must respect.
      </p>
      <Tabs defaultValue="soul">
        <TabsList>
          <TabsTrigger value="soul">
            <Bot className="size-4" /> soul.md
          </TabsTrigger>
          <TabsTrigger value="skills">
            <Sparkles className="size-4" /> skills.md
          </TabsTrigger>
          <TabsTrigger value="architecture">
            <Network className="size-4" /> architecture.md
          </TabsTrigger>
        </TabsList>

        <TabsContent value="soul" className="space-y-3">
          <Textarea
            value={soul}
            onChange={(e) => setSoul(e.target.value)}
            placeholder={PLACEHOLDERS.soul}
            className="min-h-72 font-mono text-xs"
          />
          <div className="flex justify-end">
            <Button onClick={() => save("soul", soul)} disabled={saving === "soul"}>
              {saving === "soul" ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
              Save soul.md
            </Button>
          </div>
        </TabsContent>

        <TabsContent value="skills" className="space-y-3">
          <Textarea
            value={skills}
            onChange={(e) => setSkills(e.target.value)}
            placeholder={PLACEHOLDERS.skills}
            className="min-h-72 font-mono text-xs"
          />
          <div className="flex justify-end">
            <Button onClick={() => save("skills", skills)} disabled={saving === "skills"}>
              {saving === "skills" ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
              Save skills.md
            </Button>
          </div>
        </TabsContent>

        <TabsContent value="architecture" className="space-y-3">
          <Textarea
            value={architecture}
            onChange={(e) => setArchitecture(e.target.value)}
            placeholder={PLACEHOLDERS.architecture}
            className="min-h-72 font-mono text-xs"
          />
          <div className="flex justify-end">
            <Button onClick={() => save("architecture", architecture)} disabled={saving === "architecture"}>
              {saving === "architecture" ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
              Save architecture.md
            </Button>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
