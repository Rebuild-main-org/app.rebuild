import { randomUUID } from "crypto"

import { getSessionUser } from "@/lib/auth/session"
import { SEL, getUsersMap, sb } from "@/lib/data"
import { emit } from "@/lib/events"
import { createNotification } from "@/lib/mutations"
import type { Meeting } from "@/lib/types"
import { requireWorkspace } from "@/lib/auth/guard"

export const dynamic = "force-dynamic"

// Generates a Google Meet-style link. With real Google OAuth credentials this
// would call the Calendar API to create a conference; here we mint a code.
function meetLink(): string {
  const seg = (n: number) => randomUUID().replace(/[^a-z]/g, "").slice(0, n) || "xyz"
  return `https://meet.google.com/${seg(3)}-${seg(4)}-${seg(3)}`
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const _access = await requireWorkspace(id)
  if (_access instanceof Response) return _access
  const [{ data }, users] = await Promise.all([
    sb().from("meetings").select(SEL.meeting).eq("workspace_id", id).order("start_at"),
    getUsersMap(),
  ])
  return Response.json(
    ((data ?? []) as Meeting[]).map((m) => ({
      ...m,
      attendees: m.attendeeIds.map((uid) => users.get(uid)?.name).filter(Boolean),
    }))
  )
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser()
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 })
  const { id } = await params
  const _access = await requireWorkspace(id)
  if (_access instanceof Response) return _access
  const body = (await request.json()) as Partial<Meeting>
  if (!body.title || !body.start) {
    return Response.json({ error: "title and start are required" }, { status: 400 })
  }
  const start = new Date(body.start)
  const end = body.end ? new Date(body.end) : new Date(start.getTime() + 3600_000)

  let attendeeIds = body.attendeeIds ?? []
  if (attendeeIds.length === 0) {
    const { data } = await sb().from("workspace_members").select("user_id").eq("workspace_id", id)
    attendeeIds = (data ?? []).map((m) => m.user_id as string)
  }

  const meeting: Meeting = {
    id: randomUUID(),
    title: body.title,
    start: start.toISOString(),
    end: end.toISOString(),
    workspaceId: id,
    meetLink: body.meetLink || meetLink(),
    attendeeIds,
    createdById: user.id,
  }
  const { error } = await sb().from("meetings").insert({
    id: meeting.id,
    title: meeting.title,
    start_at: meeting.start,
    end_at: meeting.end,
    workspace_id: id,
    meet_link: meeting.meetLink,
    attendee_ids: attendeeIds,
    created_by_id: user.id,
  })
  if (error) return Response.json({ error: error.message }, { status: 400 })

  emit(`ws:${id}`, "meeting.created", { meeting }, user.id)
  for (const uid of attendeeIds) {
    if (uid !== user.id)
      await createNotification(
        uid,
        "meeting",
        `Meeting scheduled: ${meeting.title} — ${start.toLocaleString()}`,
        `/workspace/${id}/calendar`
      )
  }
  return Response.json(meeting, { status: 201 })
}
