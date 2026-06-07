"use client"

// Two-factor authentication (TOTP) via Supabase Auth MFA. Enroll → scan QR →
// verify a 6-digit code. Lists and lets you remove existing factors.

import { useCallback, useEffect, useState } from "react"
import { Loader2, ShieldCheck, ShieldOff } from "lucide-react"
import { toast } from "sonner"

import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

interface Factor {
  id: string
  status: string
  friendly_name?: string
}

export function MfaSetup() {
  const [factors, setFactors] = useState<Factor[]>([])
  const [loading, setLoading] = useState(true)
  const [enroll, setEnroll] = useState<{ factorId: string; qr: string; secret: string } | null>(null)
  const [code, setCode] = useState("")
  const [busy, setBusy] = useState(false)

  function sb() {
    try {
      return createClient()
    } catch {
      return null
    }
  }

  const refresh = useCallback(async () => {
    const client = sb()
    if (!client) return setLoading(false)
    const { data } = await client.auth.mfa.listFactors()
    setFactors([...(data?.totp ?? [])] as Factor[])
    setLoading(false)
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh()
  }, [refresh])

  const verified = factors.some((f) => f.status === "verified")

  async function startEnroll() {
    const client = sb()
    if (!client) return
    setBusy(true)
    const { data, error } = await client.auth.mfa.enroll({ factorType: "totp" })
    setBusy(false)
    if (error) return toast.error(error.message)
    setEnroll({ factorId: data.id, qr: data.totp.qr_code, secret: data.totp.secret })
  }

  async function confirm() {
    const client = sb()
    if (!client || !enroll || code.length < 6) return
    setBusy(true)
    const ch = await client.auth.mfa.challenge({ factorId: enroll.factorId })
    if (ch.error) {
      setBusy(false)
      return toast.error(ch.error.message)
    }
    const v = await client.auth.mfa.verify({
      factorId: enroll.factorId,
      challengeId: ch.data.id,
      code,
    })
    setBusy(false)
    if (v.error) return toast.error(v.error.message)
    toast.success("Two-factor authentication enabled")
    setEnroll(null)
    setCode("")
    refresh()
  }

  async function remove(factorId: string) {
    const client = sb()
    if (!client) return
    if (!confirm) return
    const { error } = await client.auth.mfa.unenroll({ factorId })
    if (error) return toast.error(error.message)
    toast.success("2FA removed")
    refresh()
  }

  if (loading) return <p className="text-muted-foreground text-sm">Loading…</p>

  return (
    <div className="space-y-3">
      {verified ? (
        <div className="flex items-center justify-between rounded-md border p-3">
          <div className="flex items-center gap-2 text-sm">
            <ShieldCheck className="size-4 text-emerald-500" />
            Two-factor authentication is <b>enabled</b>.
          </div>
          <Button
            size="sm"
            variant="ghost"
            className="text-destructive"
            onClick={() => factors[0] && remove(factors[0].id)}
          >
            <ShieldOff className="size-4" /> Disable
          </Button>
        </div>
      ) : enroll ? (
        <div className="space-y-3 rounded-md border p-4">
          <p className="text-sm">Scan this QR code with your authenticator app, then enter the 6-digit code.</p>
          {/* Supabase returns an SVG data URL */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={enroll.qr} alt="TOTP QR code" className="size-44" />
          <p className="text-muted-foreground text-xs">
            Or enter this secret manually: <code className="break-all">{enroll.secret}</code>
          </p>
          <div className="flex gap-2">
            <Input
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="123456"
              inputMode="numeric"
              className="w-32"
            />
            <Button onClick={confirm} disabled={busy || code.length < 6}>
              {busy && <Loader2 className="size-4 animate-spin" />} Verify & enable
            </Button>
            <Button variant="ghost" onClick={() => setEnroll(null)}>Cancel</Button>
          </div>
        </div>
      ) : (
        <Button onClick={startEnroll} disabled={busy} className="gap-2">
          {busy ? <Loader2 className="size-4 animate-spin" /> : <ShieldCheck className="size-4" />}
          Enable two-factor authentication
        </Button>
      )}
    </div>
  )
}
