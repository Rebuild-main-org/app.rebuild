import { notFound, redirect } from "next/navigation"

import { getSessionUser } from "@/lib/auth/session"
import { can } from "@/lib/auth"
import { canAccessSection } from "@/lib/permissions"
import { getBlueprint } from "@/lib/blueprints"
import { BlueprintPipeline } from "@/components/blueprints/blueprint-pipeline"

export const dynamic = "force-dynamic"

export default async function BlueprintDetail({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const user = await getSessionUser()
  if (!user) redirect(`/login?next=/blueprints/${id}`)
  if (!(await canAccessSection(user.role, "blueprints"))) redirect("/dashboard")
  const bp = await getBlueprint(id)
  if (!bp) notFound()

  return <BlueprintPipeline initial={bp} canCreateWorkspace={can(user, "workspace.create")} />
}
