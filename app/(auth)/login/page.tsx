"use client"

import { Suspense, useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { AlertTriangle, Code2, GitBranch, Loader2, Mail } from "lucide-react"
import { toast } from "sonner"

import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"

function LoginForm() {
  const router = useRouter()
  const params = useSearchParams()
  const next = params.get("next") || "/dashboard"

  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [mode, setMode] = useState<"signin" | "signup">("signin")
  const [loading, setLoading] = useState<null | "pw" | "google" | "github" | "magic" | "forgot">(null)

  // Connectivity preflight: ping Supabase so a wrong/unreachable project URL is
  // diagnosed up front instead of as an opaque "Failed to fetch" on submit.
  const supaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const [reach, setReach] = useState<"checking" | "ok" | "down" | "unset">(
    supaUrl ? "checking" : "unset"
  )
  // Surface callback errors (e.g. a GitHub account that isn't an org member).
  useEffect(() => {
    const err = params.get("error")
    if (err === "not_org_member") {
      toast.error("That GitHub account isn't a member of the organization. Ask an admin to add you to Rebuild-main-org, then try again.")
    } else if (err === "auth") {
      toast.error("Sign-in could not be completed. Please try again.")
    }
  }, [params])

  useEffect(() => {
    if (!supaUrl) return
    let cancelled = false
    fetch(`${supaUrl}/auth/v1/health`, {
      headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "" },
    })
      .then(() => !cancelled && setReach("ok"))
      .catch(() => !cancelled && setReach("down"))
    return () => {
      cancelled = true
    }
  }, [supaUrl])

  function supabase() {
    try {
      return createClient()
    } catch {
      toast.error("Supabase is not configured. Set the env vars in .env.local.")
      return null
    }
  }

  // Network failures (e.g. an unreachable / wrong NEXT_PUBLIC_SUPABASE_URL)
  // reject the fetch instead of returning { error }. Surface an actionable message.
  function describeError(e: unknown): string {
    const m = e instanceof Error ? e.message : String(e)
    if (/failed to fetch|networkerror|enotfound|err_name_not_resolved/i.test(m)) {
      return "Cannot reach Supabase. Check NEXT_PUBLIC_SUPABASE_URL in .env.local — the project URL must resolve."
    }
    return m
  }

  async function emailPassword() {
    const sb = supabase()
    if (!sb || !email || !password) return
    setLoading("pw")
    try {
      const { error } =
        mode === "signin"
          ? await sb.auth.signInWithPassword({ email, password })
          : await sb.auth.signUp({
              email,
              password,
              options: { emailRedirectTo: `${location.origin}/auth/callback?next=${encodeURIComponent(next)}` },
            })
      if (error) return toast.error(error.message)
      if (mode === "signup")
        return toast.success("Check your email to confirm your account.")
      router.push(next)
      router.refresh()
    } catch (e) {
      toast.error(describeError(e))
    } finally {
      setLoading(null)
    }
  }

  async function google() {
    const sb = supabase()
    if (!sb) return
    setLoading("google")
    try {
      const { error } = await sb.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: `${location.origin}/auth/callback?next=${encodeURIComponent(next)}` },
      })
      if (error) {
        toast.error(error.message)
        setLoading(null)
      }
      // otherwise the browser is redirected to Google
    } catch (e) {
      toast.error(describeError(e))
      setLoading(null)
    }
  }

  async function forgot() {
    const sb = supabase()
    if (!sb || !email) return toast.error("Enter your email first")
    setLoading("forgot")
    try {
      const { error } = await sb.auth.resetPasswordForEmail(email, {
        redirectTo: `${location.origin}/auth/callback?next=${encodeURIComponent("/reset")}`,
      })
      if (error) return toast.error(error.message)
      toast.success("Password reset link sent — check your email.")
    } catch (e) {
      toast.error(describeError(e))
    } finally {
      setLoading(null)
    }
  }

  async function github() {
    const sb = supabase()
    if (!sb) return
    setLoading("github")
    try {
      const { error } = await sb.auth.signInWithOAuth({
        provider: "github",
        options: { redirectTo: `${location.origin}/auth/callback?next=${encodeURIComponent(next)}` },
      })
      if (error) {
        toast.error(error.message)
        setLoading(null)
      }
      // otherwise the browser is redirected to GitHub
    } catch (e) {
      toast.error(describeError(e))
      setLoading(null)
    }
  }

  async function magicLink() {
    const sb = supabase()
    if (!sb || !email) return toast.error("Enter your email first")
    setLoading("magic")
    try {
      const { error } = await sb.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: `${location.origin}/auth/callback?next=${encodeURIComponent(next)}` },
      })
      if (error) return toast.error(error.message)
      toast.success("Magic link sent — check your email.")
    } catch (e) {
      toast.error(describeError(e))
    } finally {
      setLoading(null)
    }
  }

  return (
    <div className="flex min-h-svh items-center justify-center bg-muted/30 p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="REBUILD" className="h-10 w-auto object-contain brightness-0 dark:invert" />
          <p className="text-muted-foreground text-sm">Build faster. Scale smarter.</p>
        </div>

        {(reach === "down" || reach === "unset") && (
          <div className="mb-4 flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-400">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <div>
              {reach === "unset" ? (
                <span>
                  Supabase isn&apos;t configured. Set{" "}
                  <code>NEXT_PUBLIC_SUPABASE_URL</code> and{" "}
                  <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code> in{" "}
                  <code>.env.local</code>.
                </span>
              ) : (
                <span>
                  Can&apos;t reach the Supabase project at{" "}
                  <code className="break-all">{supaUrl}</code>. This host
                  doesn&apos;t resolve — sign-in will fail. Copy your real
                  Project URL from Supabase → Settings → API into{" "}
                  <code>NEXT_PUBLIC_SUPABASE_URL</code> and restart{" "}
                  <code>npm run dev</code>.
                </span>
              )}
            </div>
          </div>
        )}

        <Card>
          <CardHeader>
            <CardTitle>{mode === "signin" ? "Sign in" : "Create account"}</CardTitle>
            <CardDescription>
              Engineers use GitHub/Google. Clients use a magic link.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button variant="outline" className="w-full" disabled={!!loading} onClick={google}>
              {loading === "google" ? <Loader2 className="size-4 animate-spin" /> : <Code2 className="size-4" />}
              Continue with Google
            </Button>
            <Button variant="outline" className="w-full" disabled={!!loading} onClick={github}>
              {loading === "github" ? <Loader2 className="size-4 animate-spin" /> : <GitBranch className="size-4" />}
              Continue with GitHub
            </Button>

            <div className="flex items-center gap-3">
              <Separator className="flex-1" />
              <span className="text-muted-foreground text-xs">OR</span>
              <Separator className="flex-1" />
            </div>

            <form
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault()
                emailPassword()
              }}
            >
              <div className="space-y-1.5">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" placeholder="you@company.com" value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password">Password</Label>
                  {mode === "signin" && (
                    <button type="button" className="text-muted-foreground text-xs underline disabled:opacity-50" disabled={!!loading} onClick={forgot}>
                      Forgot password?
                    </button>
                  )}
                </div>
                <Input id="password" type="password" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} />
              </div>
              <Button type="submit" className="w-full" disabled={!!loading}>
                {loading === "pw" && <Loader2 className="size-4 animate-spin" />}
                {mode === "signin" ? "Sign in" : "Create account"}
              </Button>
            </form>

            <Button variant="ghost" className="w-full" disabled={!!loading} onClick={magicLink}>
              {loading === "magic" ? <Loader2 className="size-4 animate-spin" /> : <Mail className="size-4" />}
              Email me a magic link
            </Button>

            <p className="text-muted-foreground text-center text-xs">
              {mode === "signin" ? "No account yet?" : "Already have an account?"}{" "}
              <button
                type="button"
                className="underline"
                onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
              >
                {mode === "signin" ? "Create one" : "Sign in"}
              </button>
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  )
}
