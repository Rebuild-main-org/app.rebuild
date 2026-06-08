// Cached GitHub reads for dashboard render paths (perf P3).
//
// The raw helpers in lib/github.ts hit the GitHub API on every render: the
// workspace overview fans out branches → commits → per-commit diffs (~30+ calls
// per load) and the dashboard does it per repo per user. Rendered live, that's
// latency, rate-limit pressure, and compute paid even when GitHub errors.
//
// These wrappers go through Next's Data Cache (persists across requests on
// serverless, unlike an in-process Map) with a short TTL — so a dashboard is at
// most TTL seconds stale instead of paying the GitHub round-trip every render.
// Entries carry GITHUB_CACHE_TAG so on-push invalidation can be wired later
// (deferred: Next 16's tag-invalidation API is mid-migration to "use cache").
// Reads that must stay live (IDE file contents, mutations) keep calling
// lib/github.ts directly — only dashboard reads are cached here.

import "server-only"
import { unstable_cache } from "next/cache"

import { ghRecentChangesAllBranches, ghUserCommitsSince, ghUserOpenPRs } from "./github"

// Staleness window for cached GitHub dashboard reads (seconds). Overridable.
const TTL = Number(process.env.GITHUB_CACHE_TTL_SECONDS) || 60

// Invalidated by the GitHub webhook on push/PR so dashboards refresh on change.
export const GITHUB_CACHE_TAG = "github"

const opts = { revalidate: TTL, tags: [GITHUB_CACHE_TAG] }

// Workspace overview: recent commits + diffs across all branches.
export const ghRecentChangesAllBranchesCached = unstable_cache(
  ghRecentChangesAllBranches,
  ["gh-recent-changes-all-branches"],
  opts
)

// Dashboard: a user's commits today / open PRs in a repo.
export const ghUserCommitsSinceCached = unstable_cache(
  ghUserCommitsSince,
  ["gh-user-commits-since"],
  opts
)
export const ghUserOpenPRsCached = unstable_cache(ghUserOpenPRs, ["gh-user-open-prs"], opts)
