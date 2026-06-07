import { getSessionUser } from "@/lib/auth/session"
import { can } from "@/lib/auth"
import { AI_MODELS, DEFAULT_AI_MODEL, getAiModel, isKnownModel, setAiModel } from "@/lib/settings"

export const dynamic = "force-dynamic"

// GET /api/admin/settings — current app settings + choices (admin panel).
export async function GET() {
  const user = await getSessionUser()
  if (!user || !can(user, "admin.panel")) {
    return Response.json({ error: "Forbidden" }, { status: 403 })
  }
  return Response.json({
    aiModel: await getAiModel(),
    models: AI_MODELS,
    default: DEFAULT_AI_MODEL,
    canEdit: user.role === "SUPER_ADMIN",
  })
}

// PUT /api/admin/settings { aiModel } — change the AI model for everyone.
// SUPER_ADMIN only (a global, sensitive switch).
export async function PUT(request: Request) {
  const user = await getSessionUser()
  if (!user || user.role !== "SUPER_ADMIN") {
    return Response.json({ error: "Forbidden — super admin only" }, { status: 403 })
  }
  const { aiModel } = (await request.json().catch(() => ({}))) as { aiModel?: string }
  if (!aiModel || !isKnownModel(aiModel)) {
    return Response.json({ error: "Modèle inconnu" }, { status: 400 })
  }
  await setAiModel(aiModel, user.id)
  return Response.json({ aiModel })
}
