import { getWorkspace } from "@/lib/queries"
import { requireWorkspace } from "@/lib/auth/guard"
import { ghPutFile, githubEnabled } from "@/lib/github"

export const dynamic = "force-dynamic"

const CI_YAML = `name: CI

on:
  push:
    branches: [main]
  pull_request:

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npm run lint --if-present
      - run: npm run typecheck --if-present
      - run: npm test --if-present
      - run: npm run build --if-present
`

// POST /api/git/:wsId/scaffold-ci — commit a starter GitHub Actions workflow
// (.github/workflows/ci.yml) to the repo so real CI runs appear.
export async function POST(_request: Request, { params }: { params: Promise<{ wsId: string }> }) {
  const { wsId } = await params
  const access = await requireWorkspace(wsId, "code.access")
  if (access instanceof Response) return access
  const ws = await getWorkspace(wsId)
  if (!ws?.githubRepo || !githubEnabled()) {
    return Response.json({ error: "GitHub not connected" }, { status: 400 })
  }
  try {
    await ghPutFile(ws.githubRepo, ".github/workflows/ci.yml", CI_YAML, "ci: add GitHub Actions workflow", "main")
    return Response.json({ ok: true })
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Could not add CI" }, { status: 502 })
  }
}
