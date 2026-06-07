import { NextResponse } from "next/server"

import { createClient } from "@/lib/supabase/server"
import { ghIsOrgMember } from "@/lib/github"

// OAuth / magic-link callback: exchanges the code for a session, then redirects.
// GitHub sign-ins are gated to members of the organization.
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get("code")
  const next = searchParams.get("next") || "/dashboard"

  if (code) {
    const supabase = await createClient()
    const { data, error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      const user = data.user
      const provider = user?.app_metadata?.provider
      // For GitHub sign-ins, the GitHub account must already be an org member.
      if (provider === "github") {
        const login = (user?.user_metadata as Record<string, unknown> | undefined)?.user_name
        const ok = typeof login === "string" ? await ghIsOrgMember(login) : false
        if (!ok) {
          await supabase.auth.signOut()
          return NextResponse.redirect(`${origin}/login?error=not_org_member`)
        }
      }
      return NextResponse.redirect(`${origin}${next}`)
    }
  }
  return NextResponse.redirect(`${origin}/login?error=auth`)
}
