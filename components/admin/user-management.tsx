"use client"

import { useCallback, useEffect, useState } from "react"
import { Loader2, Trash2, UserPlus } from "lucide-react"
import { toast } from "sonner"

import { ALL_ROLES, ROLE_LABELS, type Role } from "@/lib/types"
import { UserAvatar } from "@/components/shared/badges"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

interface Profile {
  id: string
  email: string
  name: string
  role: Role
  created_at: string
}

// SUPER_ADMIN is hidden from this panel — it's not assignable here and the
// super-admin account doesn't appear in the list.
const ROLES: Role[] = ALL_ROLES.filter((r) => r !== "SUPER_ADMIN")

export function UserManagement() {
  const [users, setUsers] = useState<Profile[]>([])
  const [state, setState] = useState<"loading" | "ready" | "error">("loading")
  const [errorMsg, setErrorMsg] = useState("")
  const [open, setOpen] = useState(false)

  // create form
  const [email, setEmail] = useState("")
  const [name, setName] = useState("")
  const [role, setRole] = useState<Role>("ENGINEER")
  const [password, setPassword] = useState("")
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setState("loading")
    const res = await fetch("/api/admin/users")
    if (!res.ok) {
      const { error } = await res.json().catch(() => ({ error: "Failed" }))
      setErrorMsg(error ?? "Failed to load users")
      setState("error")
      return
    }
    const all = (await res.json()) as Profile[]
    // Hide the super-admin account(s) from the directory.
    setUsers(all.filter((u) => u.role !== "SUPER_ADMIN"))
    setState("ready")
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load()
  }, [load])

  async function create() {
    if (!email.trim()) return
    setSaving(true)
    const res = await fetch("/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, name, role, password: password || undefined }),
    })
    setSaving(false)
    const data = await res.json().catch(() => ({}))
    if (!res.ok) return toast.error(data.error ?? "Could not create user")
    if (data.tempPassword) {
      toast.success(`User created. Temp password: ${data.tempPassword}`, {
        duration: 15000,
        action: {
          label: "Copy",
          onClick: () => navigator.clipboard?.writeText(data.tempPassword),
        },
      })
    } else {
      toast.success("User created")
    }
    setOpen(false)
    setEmail("")
    setName("")
    setPassword("")
    setRole("ENGINEER")
    load()
  }

  async function changeRole(id: string, next: Role) {
    const res = await fetch(`/api/admin/users/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: next }),
    })
    if (!res.ok) return toast.error("Could not update role")
    setUsers((u) => u.map((x) => (x.id === id ? { ...x, role: next } : x)))
    toast.success("Role updated")
  }

  async function remove(id: string, email: string) {
    if (!confirm(`Remove ${email}? This deletes their account.`)) return
    const res = await fetch(`/api/admin/users/${id}`, { method: "DELETE" })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) return toast.error(data.error ?? "Could not remove user")
    setUsers((u) => u.filter((x) => x.id !== id))
    toast.success("User removed")
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-muted-foreground text-sm">
          Create accounts and assign roles. New users sign in with the temporary
          password (or a magic link).
        </p>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <UserPlus className="size-4" /> Add user
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add a user</DialogTitle>
              <DialogDescription>
                Creates a confirmed Supabase account with the chosen role.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="u-email">Email</Label>
                <Input id="u-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="person@company.com" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="u-name">Name</Label>
                <Input id="u-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Role</Label>
                  <Select value={role} onValueChange={(v) => setRole(v as Role)}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {ROLES.map((r) => (
                        <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="u-pw">Temp password</Label>
                  <Input id="u-pw" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="auto-generated" />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button onClick={create} disabled={saving || !email.trim()}>
                {saving && <Loader2 className="size-4 animate-spin" />} Create
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {state === "loading" && (
        <div className="text-muted-foreground flex items-center gap-2 p-6 text-sm">
          <Loader2 className="size-4 animate-spin" /> Loading users…
        </div>
      )}
      {state === "error" && (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-400">
          {errorMsg}
          <div className="text-muted-foreground mt-1 text-xs">
            User management needs <code>SUPABASE_SERVICE_ROLE_KEY</code> (server only).
          </div>
        </div>
      )}
      {state === "ready" && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>User</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Role</TableHead>
              <TableHead className="w-10"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((u) => (
              <TableRow key={u.id}>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <UserAvatar name={u.name || u.email} />
                    <span className="text-sm font-medium">{u.name || "—"}</span>
                  </div>
                </TableCell>
                <TableCell className="text-muted-foreground text-sm">{u.email}</TableCell>
                <TableCell>
                  <Select value={u.role} onValueChange={(v) => changeRole(u.id, v as Role)}>
                    <SelectTrigger size="sm" className="w-32">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ROLES.map((r) => (
                        <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell>
                  <Button variant="ghost" size="icon" className="text-destructive size-8" onClick={() => remove(u.id, u.email)}>
                    <Trash2 className="size-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {users.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="text-muted-foreground py-6 text-center text-sm">
                  No users yet. Add the first one.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      )}
    </div>
  )
}
