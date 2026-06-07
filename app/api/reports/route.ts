import { getSessionUser } from "@/lib/auth/session"
import { roleAtLeast } from "@/lib/auth"
import { generateReport, reportToMarkdown, type ReportType } from "@/lib/reports"

// GET /api/reports?type=weekly|sprint|release&workspaceId=...&format=md
export async function GET(request: Request) {
  const user = await getSessionUser()
  if (!user || !roleAtLeast(user.role, "LEAD")) {
    return Response.json({ error: "Forbidden" }, { status: 403 })
  }
  const { searchParams } = new URL(request.url)
  const type = (searchParams.get("type") ?? "weekly") as ReportType
  const workspaceId = searchParams.get("workspaceId")
  if (!workspaceId) {
    return Response.json({ error: "workspaceId required" }, { status: 400 })
  }
  const report = await generateReport(type, workspaceId)
  if (searchParams.get("format") === "md") {
    return new Response(reportToMarkdown(report), {
      headers: {
        "Content-Type": "text/markdown",
        "Content-Disposition": `attachment; filename="${type}-report.md"`,
      },
    })
  }
  return Response.json(report)
}
