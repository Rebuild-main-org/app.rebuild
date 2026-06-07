import { requireWorkspace } from "@/lib/auth/guard"
import { AINotConfiguredError, planFromArchitecture, type ScaffoldPlan } from "@/lib/ai"
import { AiBudgetError, withAi } from "@/lib/ai-usage"
import { addLink, createProject, createTicket } from "@/lib/mutations"
import { type LinkType, type StoryPoints } from "@/lib/types"

const POINTS = new Set([1, 2, 3, 5, 8, 13])
const LINK_TYPES = new Set(["BLOCKS", "RELATES", "DUPLICATES"])

// Appended to every scaffolded ticket so "done" means the same thing everywhere.
const DEFINITION_OF_DONE = `## Definition of Done
- [ ] Acceptance criteria above met
- [ ] Code typechecks, lints, and builds
- [ ] Tests added/updated and passing
- [ ] Reviewed (AI review + a teammate)
- [ ] Merged via PR with CI green`

// POST /api/workspaces/:id/scaffold — read an architecture doc and create the
// project(s) + a To-Do backlog, with sub-tasks and dependency links. project.create.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const access = await requireWorkspace(id, "project.create")
  if (access instanceof Response) return access

  const body = (await request.json()) as { content?: string; preview?: boolean; plan?: ScaffoldPlan }

  // Human gate: `preview` returns the plan WITHOUT creating; the UI shows it,
  // then re-POSTs the approved `plan` to create (no second AI call).
  let plan = body.plan
  if (!plan) {
    const content = body.content
    if (!content?.trim() || content.trim().length < 30) {
      return Response.json({ error: "Provide the architecture document text" }, { status: 400 })
    }
    try {
      plan = await withAi(access, "scaffold", () => planFromArchitecture(content), { workspaceId: id })
    } catch (e) {
      if (e instanceof AiBudgetError) return Response.json({ error: e.message }, { status: 429 })
      if (e instanceof AINotConfiguredError) return Response.json({ error: e.message }, { status: 503 })
      return Response.json({ error: e instanceof Error ? e.message : "Planning failed" }, { status: 502 })
    }
    if (body.preview) return Response.json({ preview: plan })
  }
  if (!plan?.projects?.length) {
    return Response.json({ error: "Empty plan — nothing to create" }, { status: 400 })
  }

  // Pass 1 — create projects + parent tickets, mapping each plan `ref` to its id.
  const refToId = new Map<string, string>()
  const created: { project: string; tickets: number }[] = []
  let totalTickets = 0
  let totalSubtasks = 0
  let totalLinks = 0

  for (const p of plan.projects) {
    const project = await createProject(id, {
      name: p.name,
      shortCode: p.shortCode || p.name.slice(0, 4).toUpperCase(),
      description: p.description,
      status: "ACTIVE",
    })
    let n = 0
    for (const t of p.tickets) {
      const pts = t.points && POINTS.has(t.points) ? (t.points as StoryPoints) : undefined
      const ticket = await createTicket(project.id, {
        title: t.title,
        description: `${t.description}\n\n${DEFINITION_OF_DONE}`,
        type: t.type,
        priority: t.priority,
        status: "TODO",
        points: pts,
      })
      if (t.ref) refToId.set(t.ref, ticket.id)
      n++
      // Sub-tasks → child tickets in the same project.
      for (const st of t.subtasks ?? []) {
        if (!st?.trim()) continue
        try {
          await createTicket(project.id, {
            title: st.trim(),
            description: "",
            type: "SUBTASK",
            priority: t.priority,
            status: "TODO",
            parentId: ticket.id,
          })
          totalSubtasks++
        } catch {
          // skip invalid sub-task
        }
      }
    }
    created.push({ project: project.name, tickets: n })
    totalTickets += n
  }

  // Pass 2 — links, once every ticket id is known (links may cross projects in
  // the same workspace).
  for (const p of plan.projects) {
    for (const t of p.tickets) {
      const fromId = refToId.get(t.ref)
      if (!fromId) continue
      for (const link of t.links ?? []) {
        const toId = refToId.get(link.to)
        if (!toId || toId === fromId || !LINK_TYPES.has(link.type)) continue
        try {
          await addLink(fromId, toId, link.type as LinkType)
          totalLinks++
        } catch {
          // skip duplicate/invalid link
        }
      }
    }
  }

  return Response.json(
    { projects: created.length, tickets: totalTickets, subtasks: totalSubtasks, links: totalLinks, breakdown: created },
    { status: 201 }
  )
}
