import { sb } from "@/lib/data"
import { userFromBearer } from "@/lib/cli-auth"
import { isWorkspaceMember } from "@/lib/auth/guard"
import { isAdmin } from "@/lib/auth"

export const dynamic = "force-dynamic"

// GET /api/cli/document/[id] (Bearer) → { id, name, mimeType, dataUrl } so the
// CLI can extract workspace documents into the agent's working context.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await userFromBearer(request)
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 })
  const { id } = await params

  const { data: doc } = await sb()
    .from("documents")
    .select("id,name,mime_type,data_url,workspace_id")
    .eq("id", id)
    .maybeSingle()
  if (!doc) return Response.json({ error: "Not found" }, { status: 404 })

  if (!isAdmin(user.role) && !(await isWorkspaceMember(user.id, doc.workspace_id as string))) {
    return Response.json({ error: "No access" }, { status: 403 })
  }

  return Response.json({
    id: doc.id,
    name: doc.name,
    mimeType: doc.mime_type,
    dataUrl: doc.data_url,
  })
}
