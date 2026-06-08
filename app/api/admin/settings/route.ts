import { getSessionUser } from "@/lib/auth/session"
import { can } from "@/lib/auth"
import {
  AI_MODELS,
  DEFAULT_AI_MODEL,
  getAiModel,
  getCliModel,
  isKnownModel,
  setAiModel,
  setCliModel,
} from "@/lib/settings"

export const dynamic = "force-dynamic"

// GET /api/admin/settings — current app settings + choices (admin panel).
export async function GET() {
  const user = await getSessionUser()
  if (!user || !can(user, "admin.panel")) {
    return Response.json({ error: "Forbidden" }, { status: 403 })
  }
  return Response.json({
    aiModel: await getAiModel(),
    cliModel: await getCliModel(),
    models: AI_MODELS,
    default: DEFAULT_AI_MODEL,
    canEdit: user.role === "SUPER_ADMIN",
  })
}

// PUT /api/admin/settings { aiModel?, cliModel? } — change the platform AI model
// (server) and/or the CLI/agent model for everyone. SUPER_ADMIN only.
export async function PUT(request: Request) {
  const user = await getSessionUser()
  if (!user || user.role !== "SUPER_ADMIN") {
    return Response.json({ error: "Forbidden — super admin only" }, { status: 403 })
  }
  const { aiModel, cliModel } = (await request.json().catch(() => ({}))) as {
    aiModel?: string
    cliModel?: string
  }
  if (aiModel === undefined && cliModel === undefined) {
    return Response.json({ error: "aiModel or cliModel required" }, { status: 400 })
  }
  if (aiModel !== undefined) {
    if (!isKnownModel(aiModel)) return Response.json({ error: "Modèle inconnu" }, { status: 400 })
    await setAiModel(aiModel, user.id)
  }
  if (cliModel !== undefined) {
    if (!isKnownModel(cliModel)) return Response.json({ error: "Modèle inconnu" }, { status: 400 })
    await setCliModel(cliModel, user.id)
  }
  return Response.json({
    aiModel: await getAiModel(),
    cliModel: await getCliModel(),
  })
}
