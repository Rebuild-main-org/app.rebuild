// Pure DORA metric calculations (unit-testable, no IO). Computed from the
// commit + deployment timelines available in the platform. Values are
// best-effort proxies given the data we track.

export interface DoraDeployment {
  status: string // SUCCESS | FAILED | IN_PROGRESS
  deployedAt: string
}
export interface DoraCommit {
  date: string
}

export interface DoraMetrics {
  windowDays: number
  deployCount: number
  deploysPerWeek: number
  leadTimeHours: number | null // avg commit → next deploy
  changeFailureRate: number // 0..1 of deployments that failed
  mttrHours: number | null // avg failed → next success
}

const HOUR = 3_600_000

export function computeDora(
  commits: DoraCommit[],
  deployments: DoraDeployment[],
  windowDays = 90,
  now: number = Date.now()
): DoraMetrics {
  const since = now - windowDays * 24 * HOUR
  const deploys = deployments
    .map((d) => ({ status: d.status, t: new Date(d.deployedAt).getTime() }))
    .filter((d) => d.t >= since && !Number.isNaN(d.t))
    .sort((a, b) => a.t - b.t)
  const commitTimes = commits
    .map((c) => new Date(c.date).getTime())
    .filter((t) => !Number.isNaN(t))
    .sort((a, b) => a - b)

  const deployCount = deploys.length
  const weeks = Math.max(1, windowDays / 7)
  const deploysPerWeek = +(deployCount / weeks).toFixed(2)

  // Change failure rate: failed / all (that reached a terminal state).
  const terminal = deploys.filter((d) => d.status === "SUCCESS" || d.status === "FAILED")
  const failed = terminal.filter((d) => d.status === "FAILED").length
  const changeFailureRate = terminal.length ? +(failed / terminal.length).toFixed(3) : 0

  // Lead time: for each successful deploy, time since the most recent commit before it.
  const leads: number[] = []
  for (const d of deploys.filter((x) => x.status === "SUCCESS")) {
    let latest = -1
    for (const t of commitTimes) {
      if (t <= d.t) latest = t
      else break
    }
    if (latest > 0) leads.push((d.t - latest) / HOUR)
  }
  const leadTimeHours = leads.length ? +(leads.reduce((a, b) => a + b, 0) / leads.length).toFixed(1) : null

  // MTTR: average gap from a FAILED deploy to the next SUCCESS deploy.
  const restores: number[] = []
  for (let i = 0; i < deploys.length; i++) {
    if (deploys[i].status !== "FAILED") continue
    const next = deploys.slice(i + 1).find((d) => d.status === "SUCCESS")
    if (next) restores.push((next.t - deploys[i].t) / HOUR)
  }
  const mttrHours = restores.length ? +(restores.reduce((a, b) => a + b, 0) / restores.length).toFixed(1) : null

  return { windowDays, deployCount, deploysPerWeek, leadTimeHours, changeFailureRate, mttrHours }
}
