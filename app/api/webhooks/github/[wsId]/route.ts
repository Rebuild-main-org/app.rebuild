import { createHmac, randomUUID, timingSafeEqual } from "crypto"

import { SEL, sb } from "@/lib/data"
import { emit } from "@/lib/events"
import { createNotification } from "@/lib/mutations"
import type { CIStatus, PullRequest, Ticket, Workspace } from "@/lib/types"

function verifySignature(raw: string, signature: string | null): boolean {
  const secret = process.env.GITHUB_WEBHOOK_SECRET
  if (!secret || !signature) return false
  const expected = "sha256=" + createHmac("sha256", secret).update(raw).digest("hex")
  const a = Buffer.from(expected)
  const b = Buffer.from(signature)
  return a.length === b.length && timingSafeEqual(a, b)
}

function shortHash() {
  return randomUUID().replace(/-/g, "").slice(0, 7)
}

// POST /api/webhooks/github/:wsId — GitHub webhook receiver (HMAC-verified).
export async function POST(
  request: Request,
  { params }: { params: Promise<{ wsId: string }> }
) {
  const { wsId } = await params
  if (!process.env.GITHUB_WEBHOOK_SECRET) {
    return Response.json({ error: "Webhook not configured — set GITHUB_WEBHOOK_SECRET" }, { status: 500 })
  }
  const raw = await request.text()
  if (!verifySignature(raw, request.headers.get("x-hub-signature-256"))) {
    return Response.json({ error: "Invalid signature" }, { status: 401 })
  }

  const { data: wsRow } = await sb().from("workspaces").select(SEL.workspace).eq("id", wsId).maybeSingle()
  const ws = wsRow as Workspace | null
  if (!ws) return Response.json({ error: "Unknown workspace" }, { status: 404 })

  const eventType = request.headers.get("x-github-event") ?? "push"
  const body = JSON.parse(raw || "{}") as Record<string, unknown>
  const now = new Date().toISOString()

  // Webhooks have no session; attribute writes to the workspace's first member.
  const { data: memberRows } = await sb().from("workspace_members").select("user_id").eq("workspace_id", wsId)
  const memberIds = (memberRows ?? []).map((m) => m.user_id as string)
  const actorId = memberIds[0]
  if (!actorId) return Response.json({ error: "Workspace has no members" }, { status: 409 })

  const findTicketByRef = async (text: string): Promise<string | undefined> => {
    const m = text.match(/\[([A-Z]+-\d+)\]/)
    if (!m) return undefined
    const { data } = await sb().from("tickets").select("id").eq("short_id", m[1]).maybeSingle()
    return (data?.id as string) ?? undefined
  }

  switch (eventType) {
    case "push": {
      const branch = (body.branch as string) ?? (body.ref as string)?.replace("refs/heads/", "") ?? "main"
      const message = (body.message as string) ?? "chore: update from GitHub"
      const commit = {
        id: randomUUID(),
        hash: shortHash(),
        message,
        author_id: actorId,
        date: now,
        workspace_id: wsId,
        branch,
        ticket_id: (await findTicketByRef(message)) ?? null,
      }
      await sb().from("git_commits").insert(commit)
      emit(`ws:${wsId}`, "git.commit", { commit })
      return Response.json({ ok: true })
    }

    case "pull_request": {
      const action = (body.action as string) ?? "opened"
      const { data: maxRow } = await sb().from("pull_requests").select("number").eq("workspace_id", wsId).order("number", { ascending: false }).limit(1).maybeSingle()
      const number = (body.number as number) ?? ((maxRow?.number as number) ?? 0) + 1
      const { data: existing } = await sb().from("pull_requests").select(SEL.pr).eq("workspace_id", wsId).eq("number", number).maybeSingle()
      let pr = existing as PullRequest | null
      if (!pr) {
        const row = {
          id: randomUUID(),
          number,
          title: (body.title as string) ?? `PR #${number}`,
          status: "OPEN" as const,
          ci: "RUNNING" as const,
          branch_from: (body.branchFrom as string) ?? "feature/x",
          branch_to: (body.branchTo as string) ?? "main",
          workspace_id: wsId,
          ticket_id: (await findTicketByRef((body.title as string) ?? "")) ?? null,
          author_id: actorId,
          created_at: now,
        }
        const { data } = await sb().from("pull_requests").insert(row).select(SEL.pr).single()
        pr = data as PullRequest
      }
      if (action === "closed") {
        await sb().from("pull_requests").update({ status: "MERGED" }).eq("id", pr.id)
        pr.status = "MERGED"
      }
      emit(`ws:${wsId}`, "pr.updated", { pr })
      for (const uid of memberIds) {
        await createNotification(uid, "pr", `PR #${pr.number} ${action} — ${pr.title}`, `/workspace/${wsId}/git`)
      }
      if (action === "closed" && pr.ticketId) {
        const { data: tRow } = await sb().from("tickets").select(SEL.ticket).eq("id", pr.ticketId).maybeSingle()
        const ticket = tRow as Ticket | null
        if (ticket) {
          await sb().from("tickets").update({ status: "DONE", updated_at: now }).eq("id", ticket.id)
          emit([`ticket:${ticket.id}`, `project:${ticket.projectId}`, `ws:${wsId}`], "ticket.updated", { ticket: { ...ticket, status: "DONE" } })
        }
      }
      return Response.json({ ok: true, pr })
    }

    case "check_run": {
      const conclusion = ((body.conclusion as string) ?? "success") as "success" | "failure"
      const ci: CIStatus = conclusion === "success" ? "PASSING" : "FAILING"
      const number = body.prNumber as number | undefined
      let q = sb().from("pull_requests").select(SEL.pr).eq("workspace_id", wsId)
      q = number ? q.eq("number", number) : q.eq("status", "OPEN")
      const { data } = await q.limit(1).maybeSingle()
      const pr = data as PullRequest | null
      if (pr) {
        await sb().from("pull_requests").update({ ci }).eq("id", pr.id)
        pr.ci = ci
        emit(`ws:${wsId}`, "pr.updated", { pr })
        if (ci === "FAILING") {
          await createNotification(pr.authorId, "ci_failed", `CI failed on PR #${pr.number} — ${pr.title}`, `/workspace/${wsId}/git`)
        }
      }
      return Response.json({ ok: true, ci })
    }

    case "workflow_run":
    case "workflow_job": {
      // No DB row to keep — just nudge the live Git page to refetch /actions.
      emit(`ws:${wsId}`, "actions.updated", { event: eventType })
      return Response.json({ ok: true })
    }

    case "release": {
      const deployment = {
        id: randomUUID(),
        env: "PRODUCTION" as const,
        commit_hash: (body.commitHash as string) ?? shortHash(),
        status: "SUCCESS" as const,
        deployed_at: now,
        workspace_id: wsId,
        branch: "main",
        author_id: actorId,
      }
      await sb().from("deployments").insert(deployment)
      emit(`ws:${wsId}`, "deployment.created", { deployment })
      const { data: clientRow } = await sb().from("users").select("id").eq("email", ws.clientEmail).maybeSingle()
      const recipients = [...memberIds, ...(clientRow ? [clientRow.id as string] : [])]
      for (const uid of recipients) {
        await createNotification(uid, "deploy_prod", `Production deploy succeeded for ${ws.name}`, `/workspace/${wsId}/git`)
      }
      return Response.json({ ok: true })
    }

    default:
      return Response.json({ ok: true, ignored: eventType })
  }
}
