import { requireWorkspace } from "@/lib/auth/guard"
import { SEL, sb } from "@/lib/data"
import type { Meeting } from "@/lib/types"

function esc(s: string): string {
  return s.replace(/([,;\\])/g, "\\$1").replace(/\n/g, "\\n")
}
function dt(iso: string): string {
  return new Date(iso).toISOString().replace(/[-:]/g, "").split(".")[0] + "Z"
}

// GET /api/workspaces/:id/meetings/ics — calendar feed (RFC 5545) for the
// workspace's meetings. Importable into Google/Apple/Outlook calendars.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const access = await requireWorkspace(id)
  if (access instanceof Response) return access

  const { data } = await sb()
    .from("meetings")
    .select(SEL.meeting)
    .eq("workspace_id", id)
    .order("start_at")
  const meetings = (data ?? []) as Meeting[]

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//REBUILD//Engineering OS//EN",
    "CALSCALE:GREGORIAN",
  ]
  for (const m of meetings) {
    lines.push(
      "BEGIN:VEVENT",
      `UID:${m.id}@rebuild`,
      `DTSTAMP:${dt(m.start)}`,
      `DTSTART:${dt(m.start)}`,
      `DTEND:${dt(m.end)}`,
      `SUMMARY:${esc(m.title)}`,
      m.meetLink ? `URL:${esc(m.meetLink)}` : "",
      m.meetLink ? `DESCRIPTION:${esc("Join: " + m.meetLink)}` : "",
      "END:VEVENT"
    )
  }
  lines.push("END:VCALENDAR")

  return new Response(lines.filter(Boolean).join("\r\n"), {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="rebuild-${id}.ics"`,
    },
  })
}
