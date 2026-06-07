"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

import type { User, UserPreferences } from "@/lib/types"
import { RoleBadge, UserAvatar } from "@/components/shared/badges"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"

export function ProfileForm({
  user,
  preferences,
  githubUsername = "",
}: {
  user: User
  preferences: UserPreferences
  githubUsername?: string
}) {
  const router = useRouter()
  const [name, setName] = useState(user.name)
  const [title, setTitle] = useState(preferences.title ?? "")
  const [bio, setBio] = useState(preferences.bio ?? "")
  const [github, setGithub] = useState(githubUsername)
  const [saving, setSaving] = useState(false)

  async function save() {
    setSaving(true)
    const res = await fetch("/api/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, githubUsername: github, preferences: { title, bio } }),
    })
    setSaving(false)
    if (!res.ok) return toast.error("Could not save profile")
    toast.success("Profile updated")
    router.refresh()
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-4">
        <UserAvatar name={name || user.name} size="md" className="size-14 text-base" />
        <div>
          <div className="flex items-center gap-2">
            <span className="text-lg font-semibold">{name || user.name}</span>
            <RoleBadge role={user.role} />
          </div>
          <div className="text-muted-foreground text-sm">{user.email}</div>
        </div>
      </div>

      <div className="grid max-w-lg gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="name">Display name</Label>
          <Input id="name" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="title">Job title</Label>
          <Input
            id="title"
            placeholder="e.g. Senior Engineer"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="github">GitHub username</Label>
          <Input
            id="github"
            placeholder="e.g. octocat"
            value={github}
            onChange={(e) => setGithub(e.target.value)}
          />
          <p className="text-muted-foreground text-xs">
            Links your commits and pull requests to your dashboard. Just the username (no @ or URL).
          </p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="bio">Bio</Label>
          <Textarea id="bio" value={bio} onChange={(e) => setBio(e.target.value)} />
        </div>
        <div>
          <Button onClick={save} disabled={saving}>
            Save profile
          </Button>
        </div>
      </div>
    </div>
  )
}
