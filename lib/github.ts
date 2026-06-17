// Real GitHub integration via Octokit. Activates when GITHUB_TOKEN is set;
// callers fall back to Supabase-stored git data otherwise. Server-only.

import "server-only"
import { Octokit } from "@octokit/rest"
import { sb } from "./data"
import type { Branch, CIStatus, GitCommit, PRStatus, PullRequest } from "./types"

export function githubEnabled(): boolean {
  return !!process.env.GITHUB_TOKEN
}

let client: Octokit | null = null
function octokit(): Octokit {
  if (!process.env.GITHUB_TOKEN) throw new Error("GITHUB_TOKEN not set")
  if (!client) client = new Octokit({ auth: process.env.GITHUB_TOKEN })
  return client
}

// "rebuild-tn/client-acme" -> { owner, repo }
function parseRepo(githubRepo: string): { owner: string; repo: string } | null {
  const [owner, repo] = githubRepo.split("/")
  return owner && repo ? { owner, repo } : null
}

// Default GitHub organization for new repos (overridable via env).
export function defaultOrg(): string {
  return process.env.GITHUB_DEFAULT_ORG || "Rebuild-main-org"
}

// Canonical default repo path for a workspace slug, e.g. "Rebuild-main-org/acme".
export function defaultRepoFor(slug: string): string {
  return `${defaultOrg()}/${slug}`
}

// Single repo that support tickets open issues against (overridable via env).
// Defaults to the platform repo so tickets are triaged in one place.
export function supportRepo(): string {
  return process.env.SUPPORT_GITHUB_REPO || `${defaultOrg()}/app.rebuild`
}

// One repo per workspace, one branch per project: a git-safe branch name from a
// project name (e.g. "Auth, RLS & Multi-tenancy" → "auth-rls-multi-tenancy").
export function branchForProject(name: string, shortCode?: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "")
  return slug || (shortCode ?? "").toLowerCase() || "project"
}

// Best-effort: point a push/PR webhook for this workspace repo at the app, so
// commits/PRs/CI flow into git_commits/pull_requests (dashboard, analytics, DORA).
export async function ghWireWorkspaceWebhook(
  githubRepo: string,
  wsId: string
): Promise<{ ok: boolean; created?: boolean; error?: string }> {
  const secret = process.env.GITHUB_WEBHOOK_SECRET
  if (!secret) return { ok: false, error: "GITHUB_WEBHOOK_SECRET not set" }
  const base = process.env.NEXT_PUBLIC_APP_URL || "https://app.rebuild.tn"
  return ghEnsureWebhook(githubRepo, `${base}/api/webhooks/github/${wsId}`, secret)
}

// Is `login` a member of the org? Checked with the server token (which is an
// org member), so it sees private memberships too. Used to gate GitHub sign-in
// to organization members. Returns false if GitHub isn't configured.
export async function ghIsOrgMember(login: string, org = defaultOrg()): Promise<boolean> {
  if (!githubEnabled() || !login) return false
  try {
    // Resolves (204) when a member; throws 404 when not.
    await octokit().orgs.checkMembershipForUser({ org, username: login })
    return true
  } catch {
    return false
  }
}

// GitHub OAuth (per-user "Connect your GitHub"). Active only when an OAuth App
// is configured; otherwise the connect button is disabled (fail-safe).
export function githubOauthEnabled(): boolean {
  return !!(process.env.GITHUB_OAUTH_CLIENT_ID && process.env.GITHUB_OAUTH_CLIENT_SECRET)
}

// Invite a GitHub user to the org as a member so they can contribute. Uses the
// server admin token (requires `admin:org`). Returns the membership state:
// "active" when added directly, "pending" when an email invitation was sent.
export async function ghInviteToOrg(
  login: string,
  org = defaultOrg()
): Promise<{ ok: boolean; state?: "active" | "pending"; error?: string }> {
  if (!githubEnabled()) return { ok: false, error: "GitHub not configured" }
  if (!login) return { ok: false, error: "missing GitHub login" }
  try {
    const { data } = await octokit().orgs.setMembershipForUser({ org, username: login, role: "member" })
    return { ok: true, state: data.state === "active" ? "active" : "pending" }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "invite failed" }
  }
}

export interface OrgRepo {
  name: string
  fullName: string
  defaultBranch: string
  private: boolean
  pushedAt: string | null
  url: string
}

// List repositories in the default org (newest activity first). Used by the CLI
// "ops" mode to pick a repo to integrate. Empty array if GitHub isn't enabled.
export async function ghOrgRepos(limit = 100): Promise<OrgRepo[]> {
  if (!githubEnabled()) return []
  try {
    const { data } = await octokit().repos.listForOrg({
      org: defaultOrg(),
      per_page: Math.min(limit, 100),
      sort: "pushed",
      direction: "desc",
    })
    return data.map((r) => ({
      name: r.name,
      fullName: r.full_name,
      defaultBranch: r.default_branch ?? "main",
      private: !!r.private,
      pushedAt: r.pushed_at ?? null,
      url: r.html_url,
    }))
  } catch {
    return []
  }
}

export interface EnsureRepoResult {
  existed: boolean
  created: boolean
  htmlUrl?: string
  fullName?: string // canonical owner/repo that actually exists now
  error?: string
}

// Make sure a repo exists on GitHub; create it (private) if missing. If the
// requested owner is neither the authenticated user nor an accessible org, the
// repo is created under the authenticated user and `fullName` reflects the real
// owner/repo (the caller should persist it). Requires Administration:write.
export async function ensureRepo(githubRepo: string): Promise<EnsureRepoResult> {
  const r = parseRepo(githubRepo)
  if (!r) return { existed: false, created: false, error: "Use the owner/repo format" }
  const gh = octokit()

  // 1) Already exists and visible to the token?
  try {
    const { data } = await gh.repos.get({ owner: r.owner, repo: r.repo })
    return { existed: true, created: false, htmlUrl: data.html_url, fullName: data.full_name }
  } catch (e) {
    const status = (e as { status?: number }).status
    if (status && status !== 404) {
      return { existed: false, created: false, error: `Cannot access ${githubRepo} (HTTP ${status})` }
    }
  }

  // 2) Create it. Decide whether the owner is the user, an accessible org, or
  // neither (→ fall back to the user's account).
  let me: string
  try {
    me = (await gh.users.getAuthenticated()).data.login
  } catch {
    return { existed: false, created: false, error: "Token cannot identify the GitHub account" }
  }

  const ownerIsUser = me.toLowerCase() === r.owner.toLowerCase()

  // Explicit personal account → create (or link) there.
  if (ownerIsUser) {
    try {
      const { data } = await gh.repos.get({ owner: me, repo: r.repo })
      return { existed: true, created: false, htmlUrl: data.html_url, fullName: data.full_name }
    } catch {
      /* 404 → create */
    }
    try {
      const c = await gh.repos.createForAuthenticatedUser({ name: r.repo, private: true, auto_init: true })
      await seedDefaultCI(c.data.full_name)
      return { existed: false, created: true, htmlUrl: c.data.html_url, fullName: c.data.full_name }
    } catch (e) {
      return { existed: false, created: false, error: e instanceof Error ? e.message : "Could not create the repository" }
    }
  }

  // Otherwise create in an ORG — never the personal account. Try the requested
  // owner first, then fall back to the default org (Rebuild-main-org).
  const orgs = [...new Set([r.owner, defaultOrg()])].filter(
    (o) => o.toLowerCase() !== me.toLowerCase()
  )
  let lastError = "Could not create the repository in an organization"
  for (const org of orgs) {
    // Already there?
    try {
      const { data } = await gh.repos.get({ owner: org, repo: r.repo })
      return { existed: true, created: false, htmlUrl: data.html_url, fullName: data.full_name }
    } catch {
      /* not in this org → try to create */
    }
    try {
      const c = await gh.repos.createInOrg({ org, name: r.repo, private: true, auto_init: true })
      await seedDefaultCI(c.data.full_name)
      return { existed: false, created: true, htmlUrl: c.data.html_url, fullName: c.data.full_name }
    } catch (e) {
      lastError = e instanceof Error ? e.message : lastError
    }
  }
  return { existed: false, created: false, error: lastError }
}

// Default CI for every new project repo: install → typecheck → test → build,
// no external services. `npm install` (not `npm ci`) tolerates lockfile drift
// from branch merges; `tsc --skipLibCheck` checks the project's own code while
// ignoring third-party node_modules typings; test/build run only if present.
export const DEFAULT_CI_WORKFLOW = `name: CI

on:
  push:
    branches: [main]
  pull_request:
  workflow_dispatch:

jobs:
  build:
    name: Build & Test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 20

      # Strict install (npm ci) when a lockfile exists; fall back otherwise.
      - name: Install dependencies
        run: npm ci || npm install

      - name: Lint
        run: npm run lint --if-present

      - name: Type check
        run: npx tsc --noEmit --skipLibCheck

      - name: Test
        run: npm test --if-present

      - name: Build
        run: npm run build --if-present
`

// Seed a freshly-created repo with the default CI workflow. Best-effort:
// writing .github/workflows/* needs the token's `workflow` scope, so a failure
// is swallowed (the repo is still usable; CI can be added later).
export async function seedDefaultCI(githubRepo: string): Promise<{ ok: boolean; error?: string }> {
  try {
    await ghPutFile(
      githubRepo,
      ".github/workflows/ci.yml",
      DEFAULT_CI_WORKFLOW,
      "ci: add default build & test workflow"
    )
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not seed CI workflow" }
  }
}

export interface MiniCommit {
  hash: string
  message: string
  date: string
  url: string
  repo: string
  branch: string
}

export interface MiniPR {
  number: number
  title: string
  url: string
  repo: string
}

// A user's commits in a repo since `sinceISO`, across all branches (one repo
// per workspace, one branch per project), matched by GitHub login/email.
export async function ghUserCommitsSince(
  githubRepo: string,
  login: string,
  sinceISO: string,
  maxBranches = 10
): Promise<MiniCommit[]> {
  if (!githubEnabled() || !login) return []
  const r = parseRepo(githubRepo)
  if (!r) return []
  try {
    const gh = octokit()
    const { data: branches } = await gh.repos.listBranches({
      owner: r.owner,
      repo: r.repo,
      per_page: maxBranches,
    })
    const bySha = new Map<string, MiniCommit>()
    await Promise.all(
      branches.map(async (b) => {
        try {
          const { data } = await gh.repos.listCommits({
            owner: r.owner,
            repo: r.repo,
            sha: b.name,
            since: sinceISO,
            author: login, // GitHub login or email
            per_page: 20,
          })
          for (const c of data) {
            if (bySha.has(c.sha)) continue
            bySha.set(c.sha, {
              hash: c.sha.slice(0, 7),
              message: c.commit.message.split("\n")[0],
              date: c.commit.author?.date ?? "",
              url: c.html_url,
              repo: r.repo,
              branch: b.name,
            })
          }
        } catch {
          /* skip unreadable branch */
        }
      })
    )
    return [...bySha.values()].sort((a, b) => (b.date || "").localeCompare(a.date || ""))
  } catch {
    return []
  }
}

// A user's open pull requests in a repo, matched by GitHub login.
export async function ghUserOpenPRs(githubRepo: string, login: string): Promise<MiniPR[]> {
  if (!githubEnabled() || !login) return []
  const r = parseRepo(githubRepo)
  if (!r) return []
  try {
    const { data } = await octokit().pulls.list({
      owner: r.owner,
      repo: r.repo,
      state: "open",
      per_page: 30,
    })
    return data
      .filter((p) => p.user?.login?.toLowerCase() === login.toLowerCase())
      .map((p) => ({ number: p.number, title: p.title, url: p.html_url, repo: r.repo }))
  } catch {
    return []
  }
}

// --- Integration / quality-gate helpers (PR flow) ---------------------------

// Open a PR head→base, or update the existing open one. Returns {number,url}.
export async function ghOpenOrUpdatePR(
  githubRepo: string,
  head: string,
  base: string,
  title: string,
  body: string
): Promise<{ number?: number; url?: string; error?: string }> {
  const r = parseRepo(githubRepo)
  if (!r) return { error: "Invalid repo" }
  const gh = octokit()
  try {
    const { data: existing } = await gh.pulls.list({
      owner: r.owner, repo: r.repo, state: "open", head: `${r.owner}:${head}`, base,
    })
    if (existing.length) {
      const pr = existing[0]
      await gh.pulls.update({ owner: r.owner, repo: r.repo, pull_number: pr.number, title, body })
      return { number: pr.number, url: pr.html_url }
    }
    const { data: pr } = await gh.pulls.create({ owner: r.owner, repo: r.repo, head, base, title, body })
    return { number: pr.number, url: pr.html_url }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not open the PR" }
  }
}

// Open a GitHub issue (best-effort). Returns the issue number + URL, or null if
// GitHub is disabled / the repo is invalid / the API call fails — callers must
// not let a GitHub hiccup block the underlying action (e.g. saving a ticket).
export async function ghCreateIssue(
  githubRepo: string,
  { title, body, labels }: { title: string; body: string; labels?: string[] }
): Promise<{ number: number; url: string } | null> {
  if (!githubEnabled()) return null
  const r = parseRepo(githubRepo)
  if (!r) return null
  try {
    const { data } = await octokit().issues.create({
      owner: r.owner,
      repo: r.repo,
      title,
      body,
      labels,
    })
    return { number: data.number, url: data.html_url }
  } catch {
    return null
  }
}

// Post a comment on a PR/issue (best-effort).
export async function ghComment(githubRepo: string, number: number, body: string): Promise<void> {
  const r = parseRepo(githubRepo)
  if (!r) return
  try {
    await octokit().issues.createComment({ owner: r.owner, repo: r.repo, issue_number: number, body })
  } catch {
    /* best-effort */
  }
}

// Require PR review + CI to be green before merging to `branch` (best-effort:
// branch protection may need a paid org plan).
export async function ghProtectMain(githubRepo: string, branch = "main"): Promise<{ ok: boolean; error?: string }> {
  const r = parseRepo(githubRepo)
  if (!r) return { ok: false }
  try {
    await octokit().repos.updateBranchProtection({
      owner: r.owner,
      repo: r.repo,
      branch,
      required_status_checks: { strict: true, contexts: ["Build & Test"] },
      enforce_admins: false,
      required_pull_request_reviews: { required_approving_review_count: 1 },
      restrictions: null,
    })
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not protect branch" }
  }
}

// A unified diff of base...head for AI review.
export async function ghCompareDiff(githubRepo: string, base: string, head: string, max = 14000): Promise<string> {
  const r = parseRepo(githubRepo)
  if (!r) return ""
  try {
    const { data } = await octokit().repos.compareCommits({ owner: r.owner, repo: r.repo, base, head })
    return (data.files ?? [])
      .map((f) => `--- ${f.filename} (${f.status}) +${f.additions}/-${f.deletions}\n${f.patch ?? ""}`)
      .join("\n\n")
      .slice(0, max)
  } catch {
    return ""
  }
}

// Is there a commit whose message references `ref` (e.g. "SEC-12") on any
// branch? Used as DONE evidence.
export async function ghCommitWithRef(githubRepo: string, ref: string, maxBranches = 15): Promise<boolean> {
  if (!githubEnabled() || !ref) return false
  const r = parseRepo(githubRepo)
  if (!r) return false
  try {
    const gh = octokit()
    const { data: branches } = await gh.repos.listBranches({ owner: r.owner, repo: r.repo, per_page: maxBranches })
    for (const b of branches) {
      try {
        const { data } = await gh.repos.listCommits({ owner: r.owner, repo: r.repo, sha: b.name, per_page: 50 })
        if (data.some((c) => c.commit.message.includes(ref))) return true
      } catch {
        /* skip branch */
      }
    }
    return false
  } catch {
    return false
  }
}

// Ensure a push/PR webhook points at `url` (best-effort; needs admin + secret).
export async function ghEnsureWebhook(
  githubRepo: string,
  url: string,
  secret: string
): Promise<{ ok: boolean; created?: boolean; error?: string }> {
  const r = parseRepo(githubRepo)
  if (!r || !url || !secret) return { ok: false }
  try {
    const gh = octokit()
    const { data: hooks } = await gh.repos.listWebhooks({ owner: r.owner, repo: r.repo })
    if (hooks.some((h) => (h.config as { url?: string })?.url === url)) return { ok: true }
    await gh.repos.createWebhook({
      owner: r.owner,
      repo: r.repo,
      config: { url, content_type: "json", secret },
      events: ["push", "pull_request"],
      active: true,
    })
    return { ok: true, created: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not create webhook" }
  }
}

// --- IDE-backing file operations (serverless-safe, via the Contents API) -----

// All blob paths in the repo tree (recursive) for a branch.
export async function ghTreePaths(githubRepo: string, branch = "main"): Promise<string[]> {
  const r = parseRepo(githubRepo)
  if (!r) return []
  try {
    const { data } = await octokit().git.getTree({
      owner: r.owner,
      repo: r.repo,
      tree_sha: branch,
      recursive: "1",
    })
    return (data.tree ?? [])
      .filter((t) => t.type === "blob" && !!t.path)
      .map((t) => t.path as string)
  } catch {
    return []
  }
}

// Read a file's text content; null if missing/binary.
export async function ghReadFile(githubRepo: string, path: string, branch?: string): Promise<string | null> {
  const r = parseRepo(githubRepo)
  if (!r) return null
  try {
    const { data } = await octokit().repos.getContent({ owner: r.owner, repo: r.repo, path, ref: branch })
    if (!Array.isArray(data) && data.type === "file" && typeof data.content === "string") {
      return Buffer.from(data.content, "base64").toString("utf8")
    }
    return null
  } catch {
    return null
  }
}

// Create a branch on GitHub from `fromBranch` (default main).
export async function ghCreateBranch(
  githubRepo: string,
  name: string,
  fromBranch = "main"
): Promise<void> {
  const r = parseRepo(githubRepo)
  if (!r) throw new Error("Invalid repo")
  const base = await octokit().git.getRef({ owner: r.owner, repo: r.repo, ref: `heads/${fromBranch}` })
  await octokit().git.createRef({
    owner: r.owner,
    repo: r.repo,
    ref: `refs/heads/${name}`,
    sha: base.data.object.sha,
  })
}

// Create/update a file = a commit on the branch (i.e. a push). Returns commit sha.
export async function ghPutFile(
  githubRepo: string,
  path: string,
  content: string,
  message: string,
  branch = "main"
): Promise<{ commitSha?: string }> {
  const r = parseRepo(githubRepo)
  if (!r) throw new Error("Invalid repo")
  let sha: string | undefined
  try {
    const { data } = await octokit().repos.getContent({ owner: r.owner, repo: r.repo, path, ref: branch })
    if (!Array.isArray(data) && "sha" in data) sha = data.sha as string
  } catch {
    // new file
  }
  const { data } = await octokit().repos.createOrUpdateFileContents({
    owner: r.owner,
    repo: r.repo,
    path,
    message,
    content: Buffer.from(content, "utf8").toString("base64"),
    sha,
    branch,
  })
  return { commitSha: data.commit?.sha }
}

// Delete a file = a commit removing it.
export async function ghDeleteFile(githubRepo: string, path: string, message: string, branch = "main"): Promise<void> {
  const r = parseRepo(githubRepo)
  if (!r) throw new Error("Invalid repo")
  const { data } = await octokit().repos.getContent({ owner: r.owner, repo: r.repo, path, ref: branch })
  if (Array.isArray(data) || !("sha" in data)) throw new Error("Not a file")
  await octokit().repos.deleteFile({ owner: r.owner, repo: r.repo, path, message, sha: data.sha as string, branch })
}

// Permanently delete a GitHub repository. Requires the token's `delete_repo`
// scope. Returns deleted=false (with a reason) if missing or not permitted.
export async function ghDeleteRepo(githubRepo: string): Promise<{ deleted: boolean; error?: string }> {
  const r = parseRepo(githubRepo)
  if (!r) return { deleted: false, error: "Invalid repo" }
  try {
    await octokit().repos.delete({ owner: r.owner, repo: r.repo })
    return { deleted: true }
  } catch (e) {
    const status = (e as { status?: number }).status
    if (status === 404) return { deleted: false, error: "Repo not found" }
    return { deleted: false, error: e instanceof Error ? e.message : "Delete failed" }
  }
}

// Move/rename a file: write at the new path then delete the old one.
export async function ghMoveFile(githubRepo: string, from: string, to: string, message: string, branch = "main"): Promise<void> {
  if (from === to) return
  const content = await ghReadFile(githubRepo, from, branch)
  if (content == null) throw new Error("Source file not found")
  await ghPutFile(githubRepo, to, content, message, branch)
  await ghDeleteFile(githubRepo, from, message, branch)
}

// Commits carry an authorName (GitHub login) since GitHub authors don't map to
// our internal user ids.
export type LiveCommit = GitCommit & { authorName?: string }
export type LivePR = PullRequest & { authorName?: string }
export type LiveBranch = Branch & { authorName?: string }

export async function ghCommits(
  workspaceId: string,
  githubRepo: string,
  branch?: string
): Promise<LiveCommit[]> {
  const r = parseRepo(githubRepo)
  if (!r) return []
  try {
    const { data } = await octokit().repos.listCommits({
      owner: r.owner,
      repo: r.repo,
      sha: branch,
      per_page: 30,
    })
    return data.map((c) => ({
      id: c.sha,
      hash: c.sha.slice(0, 7),
      message: c.commit.message.split("\n")[0],
      authorId: "",
      authorName: c.author?.login ?? c.commit.author?.name ?? "unknown",
      date: c.commit.author?.date ?? new Date().toISOString(),
      workspaceId,
      branch: branch ?? "main",
    }))
  } catch {
    return []
  }
}

// --- Releases ---------------------------------------------------------------

export interface GitHubRelease {
  id: number
  tag: string
  name: string
  body: string
  url: string
  publishedAt: string | null
  draft: boolean
  prerelease: boolean
}

export async function ghReleases(githubRepo: string, limit = 10): Promise<GitHubRelease[]> {
  const r = parseRepo(githubRepo)
  if (!r) return []
  try {
    const { data } = await octokit().repos.listReleases({ owner: r.owner, repo: r.repo, per_page: limit })
    return data.map((rel) => ({
      id: rel.id,
      tag: rel.tag_name,
      name: rel.name ?? rel.tag_name,
      body: rel.body ?? "",
      url: rel.html_url,
      publishedAt: rel.published_at,
      draft: rel.draft,
      prerelease: rel.prerelease,
    }))
  } catch {
    return []
  }
}

export async function ghCreateRelease(
  githubRepo: string,
  tag: string,
  name: string,
  body: string,
  target = "main"
): Promise<{ ok: boolean; url?: string; error?: string }> {
  const r = parseRepo(githubRepo)
  if (!r) return { ok: false, error: "Invalid repo" }
  try {
    const { data } = await octokit().repos.createRelease({
      owner: r.owner,
      repo: r.repo,
      tag_name: tag,
      name: name || tag,
      body,
      target_commitish: target,
    })
    return { ok: true, url: data.html_url }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Release failed" }
  }
}

// Delete a branch (git ref). Used for branch cleanup.
export async function ghDeleteBranch(githubRepo: string, name: string): Promise<{ ok: boolean; error?: string }> {
  const r = parseRepo(githubRepo)
  if (!r) return { ok: false, error: "Invalid repo" }
  try {
    await octokit().git.deleteRef({ owner: r.owner, repo: r.repo, ref: `heads/${name}` })
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Delete failed" }
  }
}

// A recent commit with its file-level diff (before/after as a unified patch).
export interface CodeChange {
  sha: string
  shortSha: string
  message: string
  author: string
  date: string
  url: string
  branch?: string // which branch this commit was seen on (all-branches view)
  files: { filename: string; status: string; additions: number; deletions: number; patch?: string }[]
}

// Recent commits + their diffs, straight from GitHub (newest first). N+1 calls
// (one list + one per commit) so keep `limit` small. Empty array on any failure.
export async function ghRecentChanges(
  githubRepo: string,
  limit = 4,
  branch?: string
): Promise<CodeChange[]> {
  const r = parseRepo(githubRepo)
  if (!r) return []
  try {
    const { data: list } = await octokit().repos.listCommits({
      owner: r.owner,
      repo: r.repo,
      sha: branch,
      per_page: limit,
    })
    const out: CodeChange[] = []
    for (const c of list) {
      const { data: full } = await octokit().repos.getCommit({ owner: r.owner, repo: r.repo, ref: c.sha })
      out.push({
        sha: c.sha,
        shortSha: c.sha.slice(0, 7),
        message: c.commit.message.split("\n")[0],
        author: c.author?.login ?? c.commit.author?.name ?? "unknown",
        date: c.commit.author?.date ?? "",
        url: c.html_url,
        files: (full.files ?? []).slice(0, 6).map((f) => ({
          filename: f.filename,
          status: f.status,
          additions: f.additions ?? 0,
          deletions: f.deletions ?? 0,
          patch: f.patch,
        })),
      })
    }
    return out
  } catch {
    return []
  }
}

// Recent commits across ALL branches (one repo per workspace, one branch per
// project — so the overview must look beyond the default branch). Lists each
// branch's recent commits (metadata only), dedupes by sha, keeps the newest
// `limit`, then fetches files just for those. Empty array on any failure.
export async function ghRecentChangesAllBranches(
  githubRepo: string,
  limit = 6,
  maxBranches = 30
): Promise<CodeChange[]> {
  const r = parseRepo(githubRepo)
  if (!r) return []
  try {
    const gh = octokit()
    const { data: branches } = await gh.repos.listBranches({
      owner: r.owner,
      repo: r.repo,
      per_page: maxBranches,
    })
    if (branches.length === 0) return []

    type Cand = { sha: string; message: string; author: string; date: string; url: string; branch: string }
    const bySha = new Map<string, Cand>()
    await Promise.all(
      branches.map(async (b) => {
        try {
          const { data: list } = await gh.repos.listCommits({
            owner: r.owner,
            repo: r.repo,
            sha: b.name,
            per_page: limit,
          })
          for (const c of list) {
            if (bySha.has(c.sha)) continue
            bySha.set(c.sha, {
              sha: c.sha,
              message: c.commit.message.split("\n")[0],
              author: c.author?.login ?? c.commit.author?.name ?? "unknown",
              date: c.commit.author?.date ?? "",
              url: c.html_url,
              branch: b.name,
            })
          }
        } catch {
          /* skip unreadable branch */
        }
      })
    )

    const top = [...bySha.values()]
      .sort((a, b) => (b.date || "").localeCompare(a.date || ""))
      .slice(0, limit)

    const out: CodeChange[] = []
    for (const cand of top) {
      try {
        const { data: full } = await gh.repos.getCommit({ owner: r.owner, repo: r.repo, ref: cand.sha })
        out.push({
          sha: cand.sha,
          shortSha: cand.sha.slice(0, 7),
          message: cand.message,
          author: cand.author,
          date: cand.date,
          url: cand.url,
          branch: cand.branch,
          files: (full.files ?? []).slice(0, 6).map((f) => ({
            filename: f.filename,
            status: f.status,
            additions: f.additions ?? 0,
            deletions: f.deletions ?? 0,
            patch: f.patch,
          })),
        })
      } catch {
        /* skip commit we can't expand */
      }
    }
    return out
  } catch {
    return []
  }
}

// --- GitHub Actions (real CI runs) ------------------------------------------

export interface WorkflowRun {
  id: number
  name: string
  status: string // queued | in_progress | completed
  conclusion: string | null // success | failure | cancelled | null
  event: string
  branch: string
  runNumber: number
  url: string
  createdAt: string
  updatedAt: string
  durationMs: number
}

export async function ghWorkflowRuns(githubRepo: string, limit = 15): Promise<WorkflowRun[]> {
  const r = parseRepo(githubRepo)
  if (!r) return []
  try {
    const { data } = await octokit().actions.listWorkflowRunsForRepo({ owner: r.owner, repo: r.repo, per_page: limit })
    return data.workflow_runs.map((w) => ({
      id: w.id,
      name: w.name ?? w.display_title ?? "workflow",
      status: w.status ?? "completed",
      conclusion: w.conclusion ?? null,
      event: w.event,
      branch: w.head_branch ?? "",
      runNumber: w.run_number,
      url: w.html_url,
      createdAt: w.run_started_at ?? w.created_at,
      updatedAt: w.updated_at,
      durationMs:
        w.run_started_at && w.updated_at ? new Date(w.updated_at).getTime() - new Date(w.run_started_at).getTime() : 0,
    }))
  } catch {
    return []
  }
}

export async function ghRerunWorkflow(githubRepo: string, runId: number, failedOnly = false): Promise<{ ok: boolean; error?: string }> {
  const r = parseRepo(githubRepo)
  if (!r) return { ok: false, error: "Invalid repo" }
  try {
    if (failedOnly) await octokit().actions.reRunWorkflowFailedJobs({ owner: r.owner, repo: r.repo, run_id: runId })
    else await octokit().actions.reRunWorkflow({ owner: r.owner, repo: r.repo, run_id: runId })
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Re-run failed" }
  }
}

export async function ghCancelWorkflow(githubRepo: string, runId: number): Promise<{ ok: boolean; error?: string }> {
  const r = parseRepo(githubRepo)
  if (!r) return { ok: false, error: "Invalid repo" }
  try {
    await octokit().actions.cancelWorkflowRun({ owner: r.owner, repo: r.repo, run_id: runId })
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Cancel failed" }
  }
}

// Single commit's diff (before/after) — reuses the CodeChange shape.
export async function ghCommitDiff(githubRepo: string, sha: string): Promise<CodeChange | null> {
  const r = parseRepo(githubRepo)
  if (!r) return null
  try {
    const { data: c } = await octokit().repos.getCommit({ owner: r.owner, repo: r.repo, ref: sha })
    return {
      sha: c.sha,
      shortSha: c.sha.slice(0, 7),
      message: c.commit.message.split("\n")[0],
      author: c.author?.login ?? c.commit.author?.name ?? "unknown",
      date: c.commit.author?.date ?? "",
      url: c.html_url,
      files: (c.files ?? []).slice(0, 12).map((f) => ({
        filename: f.filename,
        status: f.status,
        additions: f.additions ?? 0,
        deletions: f.deletions ?? 0,
        patch: f.patch,
      })),
    }
  } catch {
    return null
  }
}

// PR detail straight from GitHub: file diffs + CI checks for the head commit.
export interface PrDetail {
  files: { filename: string; status: string; additions: number; deletions: number; patch?: string }[]
  checks: { name: string; status: string; conclusion: string | null; url?: string }[]
  headSha: string
  additions: number
  deletions: number
}

export async function ghPrDetail(githubRepo: string, number: number): Promise<PrDetail | null> {
  const r = parseRepo(githubRepo)
  if (!r) return null
  try {
    const { data: pr } = await octokit().pulls.get({ owner: r.owner, repo: r.repo, pull_number: number })
    const headSha = pr.head.sha
    const [{ data: files }, checksRes] = await Promise.all([
      octokit().pulls.listFiles({ owner: r.owner, repo: r.repo, pull_number: number, per_page: 50 }),
      octokit().checks.listForRef({ owner: r.owner, repo: r.repo, ref: headSha, per_page: 50 }).catch(() => null),
    ])
    return {
      headSha,
      additions: pr.additions ?? 0,
      deletions: pr.deletions ?? 0,
      files: files.slice(0, 30).map((f) => ({
        filename: f.filename,
        status: f.status,
        additions: f.additions ?? 0,
        deletions: f.deletions ?? 0,
        patch: f.patch,
      })),
      checks: (checksRes?.data.check_runs ?? []).map((c) => ({
        name: c.name,
        status: c.status,
        conclusion: c.conclusion,
        url: c.html_url ?? undefined,
      })),
    }
  } catch {
    return null
  }
}

export async function ghPullRequests(
  workspaceId: string,
  githubRepo: string
): Promise<LivePR[]> {
  const r = parseRepo(githubRepo)
  if (!r) return []
  try {
    const { data } = await octokit().pulls.list({
      owner: r.owner,
      repo: r.repo,
      state: "all",
      per_page: 30,
    })
    return data.map((p) => ({
      id: String(p.id),
      number: p.number,
      title: p.title,
      status: (p.merged_at ? "MERGED" : p.state === "closed" ? "CLOSED" : "OPEN") as PRStatus,
      ci: "NONE" as CIStatus,
      branchFrom: p.head.ref,
      branchTo: p.base.ref,
      workspaceId,
      authorId: "",
      authorName: p.user?.login ?? "unknown",
      createdAt: p.created_at,
    }))
  } catch {
    return []
  }
}

// Fix B: mirror live GitHub PRs into the Supabase `pull_requests` table so the
// review + merge machinery (which acts on Supabase rows by number) stays
// consistent with what the UI lists. Returns the live list for display.
export async function syncPullRequests(
  workspaceId: string,
  githubRepo: string
): Promise<LivePR[]> {
  const live = await ghPullRequests(workspaceId, githubRepo)
  if (live.length) {
    const rows = live.map((p) => ({
      id: `gh_${workspaceId}_${p.number}`,
      number: p.number,
      title: p.title,
      status: p.status,
      ci: p.ci,
      branch_from: p.branchFrom,
      branch_to: p.branchTo,
      workspace_id: workspaceId,
      author_id: null,
      created_at: p.createdAt,
    }))
    await sb().from("pull_requests").upsert(rows, { onConflict: "workspace_id,number" })
  }
  return live
}

// Merge a PR on GitHub. merge_method maps our strategy names.
export async function ghMergePR(
  githubRepo: string,
  number: number,
  strategy: "merge" | "squash" | "rebase" = "squash"
): Promise<void> {
  const r = parseRepo(githubRepo)
  if (!r) throw new Error("Invalid repo")
  await octokit().pulls.merge({
    owner: r.owner,
    repo: r.repo,
    pull_number: number,
    merge_method: strategy,
  })
}

export async function ghBranches(
  workspaceId: string,
  githubRepo: string
): Promise<LiveBranch[]> {
  const r = parseRepo(githubRepo)
  if (!r) return []
  try {
    const { data } = await octokit().repos.listBranches({
      owner: r.owner,
      repo: r.repo,
      per_page: 50,
    })
    return data.map((b) => ({
      id: `${workspaceId}:${b.name}`,
      workspaceId,
      name: b.name,
      ahead: 0,
      behind: 0,
      protected: !!b.protected,
      lastCommitHash: b.commit.sha.slice(0, 7),
      lastCommitDate: new Date().toISOString(),
      lastAuthorId: "",
    }))
  } catch {
    return []
  }
}
