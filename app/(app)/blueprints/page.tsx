import Link from "next/link"
import { redirect } from "next/navigation"
import { ClipboardCheck } from "lucide-react"

import { getSessionUser } from "@/lib/auth/session"
import { canAccessSection } from "@/lib/permissions"
import { listBlueprints, ALL_GATES } from "@/lib/blueprints"
import { NewBlueprint } from "@/components/blueprints/new-blueprint"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"

const STATUS_TONE: Record<string, string> = {
  DRAFT: "bg-zinc-500/15 text-zinc-600 dark:text-zinc-300",
  APPROVED: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  CONVERTED: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
}

export const dynamic = "force-dynamic"

export default async function BlueprintsPage() {
  const user = await getSessionUser()
  if (!user) redirect("/login?next=/blueprints")
  if (!(await canAccessSection(user.role, "blueprints"))) redirect("/dashboard")

  const blueprints = await listBlueprints()

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold">
            <ClipboardCheck className="size-6" /> Blueprints
          </h1>
          <p className="text-muted-foreground text-sm">
            Phase A — Conception. Un Blueprint approuvé (toutes les gates vertes) est la seule
            porte d&apos;entrée vers la création d&apos;un workspace.
          </p>
        </div>
        <NewBlueprint />
      </div>

      {blueprints.length === 0 ? (
        <Card>
          <CardContent className="text-muted-foreground p-10 text-center text-sm">
            Aucun blueprint pour l&apos;instant. Démarre une conception avec « Nouveau blueprint ».
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {blueprints.map((b) => {
            const green = ALL_GATES.filter((g) => b.gates[g] === true).length
            return (
              <Link key={b.id} href={`/blueprints/${b.id}`}>
                <Card className="hover:border-primary/40 transition-colors">
                  <CardHeader>
                    <div className="flex items-center justify-between gap-2">
                      <CardTitle className="text-base">{b.title}</CardTitle>
                      <span className={`rounded-full px-2 py-0.5 text-xs ${STATUS_TONE[b.status] ?? ""}`}>
                        {b.status}
                      </span>
                    </div>
                    <CardDescription>
                      Gates {green}/{ALL_GATES.length}
                      {b.critique ? ` · score ${b.critique.spec_quality_score}/100` : ""}
                      {b.workspaceId ? " · workspace créé" : ""}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="flex flex-wrap gap-1.5">
                    {ALL_GATES.map((g) => (
                      <Badge
                        key={g}
                        variant="outline"
                        className={
                          b.gates[g]
                            ? "border-emerald-500/40 text-emerald-600 dark:text-emerald-400"
                            : "text-muted-foreground"
                        }
                      >
                        {g}
                      </Badge>
                    ))}
                  </CardContent>
                </Card>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
