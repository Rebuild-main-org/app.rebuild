import { mintCliToken, revokeCliTokens, userFromBearer } from "@/lib/cli-auth"

export const dynamic = "force-dynamic"

// POST /api/cli/token (Bearer) — mint a non-expiring CLI token for the caller.
// Lets an already-authenticated CLI (even one still on a short-lived JWT) upgrade
// to a permanent token without prompting for the password again.
export async function POST(request: Request) {
  const user = await userFromBearer(request)
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 })
  const cliToken = await mintCliToken(user.id, { email: user.email, name: user.name, role: user.role })
  return Response.json({ cliToken })
}

// DELETE /api/cli/token (Bearer) — revoke all of the caller's CLI tokens.
export async function DELETE(request: Request) {
  const user = await userFromBearer(request)
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 })
  await revokeCliTokens(user.id)
  return Response.json({ ok: true })
}
