import "server-only"

// Thin client for the Vercel REST API (deployment pipeline view + promote /
// rollback). Configured via VERCEL_TOKEN (+ optional VERCEL_TEAM_ID).

const API = "https://api.vercel.com"

export function vercelConfigured(): boolean {
  return !!process.env.VERCEL_TOKEN
}

function teamQuery(): string {
  const t = process.env.VERCEL_TEAM_ID
  return t ? `&teamId=${t}` : ""
}

async function vfetch(path: string, init?: RequestInit) {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${process.env.VERCEL_TOKEN}`,
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
    cache: "no-store",
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error((data?.error?.message as string) || `Vercel API ${res.status}`)
  return data
}

export interface VercelDeployment {
  id: string
  name: string
  url: string
  inspectorUrl?: string
  state: string // READY | BUILDING | ERROR | QUEUED | CANCELED
  target: string // production | preview
  createdAt: number
  commitSha?: string
  commitMessage?: string
  branch?: string
}

// Find the Vercel project whose Git link matches a "owner/repo".
export async function resolveProjectForRepo(githubRepo: string): Promise<string | null> {
  const [owner, repo] = githubRepo.split("/")
  if (!owner || !repo) return null
  try {
    const data = await vfetch(`/v9/projects?limit=100${teamQuery()}`)
    const projects = (data.projects ?? []) as Array<{ id: string; name: string; link?: { type?: string; repo?: string; org?: string } }>
    const match = projects.find((p) => p.link?.repo === repo && (!p.link.org || p.link.org === owner))
    return match?.id ?? null
  } catch {
    return null
  }
}

export async function listDeployments(projectId: string, limit = 10): Promise<VercelDeployment[]> {
  const data = await vfetch(`/v6/deployments?projectId=${projectId}&limit=${limit}${teamQuery()}`)
  return ((data.deployments ?? []) as Array<Record<string, unknown>>).map((d) => {
    const meta = (d.meta ?? {}) as Record<string, string>
    return {
      id: (d.uid ?? d.id) as string,
      name: d.name as string,
      url: d.url as string,
      inspectorUrl: d.inspectorUrl as string | undefined,
      state: (d.readyState ?? d.state ?? "QUEUED") as string,
      target: (d.target as string) ?? "preview",
      createdAt: (d.created ?? d.createdAt) as number,
      commitSha: meta.githubCommitSha,
      commitMessage: meta.githubCommitMessage,
      branch: meta.githubCommitRef,
    }
  })
}

// Promote a deployment to production (also used for rollback = promote an older
// production deployment). Points the production domains to the given deploy.
export async function promoteDeployment(projectId: string, deploymentId: string): Promise<void> {
  await vfetch(`/v10/projects/${projectId}/promote/${deploymentId}?${teamQuery().slice(1)}`, { method: "POST" })
}
