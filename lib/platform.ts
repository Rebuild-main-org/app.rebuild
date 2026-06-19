// Platform-level role (you), SEPARATE from org roles (Phase 2). Replaces the
// removed env-based elevation in lib/auth/session.ts. A platform admin is a row
// in `platform_admins`, checked via the service-role client (cross-tenant).
import "server-only"
import { supabaseAdmin } from "@/lib/supabase/admin"

export async function isPlatformAdmin(userId: string): Promise<boolean> {
  if (!userId) return false
  try {
    const { data } = await supabaseAdmin()
      .from("platform_admins")
      .select("user_id")
      .eq("user_id", userId)
      .maybeSingle()
    return !!data
  } catch {
    return false
  }
}
