"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import gsap from "gsap"
import { useGSAP } from "@gsap/react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { useTheme } from "next-themes"
import { toast } from "sonner"

import { useRealtime } from "@/hooks/use-realtime"
import { can } from "@/lib/auth"
import { SearchCommand } from "@/components/layout/search-command"
import { useT } from "@/components/i18n-provider"
import {
  BarChart3,
  Bell,
  Boxes,
  Calendar,
  FileBarChart,
  FileText,
  GitBranch,
  BookOpen,
  Briefcase,
  ClipboardCheck,
  LayoutDashboard,
  LifeBuoy,
  Menu,
  type LucideIcon,
  MessageSquare,
  Moon,
  Settings,
  Shield,
  ScrollText,
  CircleUser,
  Sun,
  TerminalSquare,
  KanbanSquare,
  Users2,
  X,
} from "lucide-react"

import type { Notification, User, Workspace } from "@/lib/types"
import { cn } from "@/lib/utils"
import { RoleBadge, UserAvatar } from "@/components/shared/badges"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet"

interface NavItem {
  href: string
  label: string
  icon: LucideIcon
  badge?: number
}

function NavLink({ item, active, onClick }: { item: NavItem; active: boolean; onClick?: () => void }) {
  const Icon = item.icon
  const t = useT()
  return (
    <Link
      href={item.href}
      onClick={onClick}
      className={cn(
        "rb-nav-item flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors",
        active
          ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
          : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
      )}
    >
      <Icon className="size-4 shrink-0" />
      <span className="flex-1">{t(item.label)}</span>
      {item.badge ? (
        <span className="bg-destructive text-destructive-foreground flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-semibold">
          {item.badge > 9 ? "9+" : item.badge}
        </span>
      ) : null}
    </Link>
  )
}

export function AppShell({
  user,
  workspaces,
  notifications,
  allowedSections,
  children,
}: {
  user: User
  workspaces: Workspace[]
  notifications: Notification[]
  allowedSections: string[]
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const [mobileNav, setMobileNav] = useState(false)
  const [dmUnread, setDmUnread] = useState(0)
  const sidebarRef = useRef<HTMLElement>(null)
  const mobileNavRef = useRef<HTMLDivElement>(null)
  const mainRef = useRef<HTMLElement>(null)

  // GSAP: fade + lift the page content in on every route change.
  useGSAP(
    () => {
      gsap.from(mainRef.current, {
        autoAlpha: 0,
        y: 14,
        duration: 0.4,
        ease: "power2.out",
      })
    },
    { dependencies: [pathname] }
  )

  // GSAP: stagger the sidebar nav items in (re-runs when the workspace changes).
  useGSAP(
    () => {
      gsap.from(".rb-nav-item", {
        x: -16,
        autoAlpha: 0,
        duration: 0.4,
        stagger: 0.05,
        ease: "power3.out",
      })
    },
    { scope: sidebarRef, dependencies: [pathname.startsWith("/workspace/") ? pathname.split("/")[2] : "global"] }
  )
  // GSAP: animate the mobile drawer items each time it opens.
  useGSAP(
    () => {
      if (!mobileNav) return
      gsap.from(".rb-nav-item", {
        x: -16,
        autoAlpha: 0,
        duration: 0.35,
        stagger: 0.04,
        ease: "power3.out",
      })
    },
    { scope: mobileNavRef, dependencies: [mobileNav] }
  )

  // Presence heartbeat + unread DM badge (polled, like the notification bell).
  useEffect(() => {
    let alive = true
    const beat = () => fetch("/api/presence", { method: "POST" }).catch(() => {})
    const poll = async () => {
      try {
        const r = await fetch("/api/discord/unread")
        if (r.ok && alive) setDmUnread((await r.json()).total ?? 0)
      } catch {
        /* ignore */
      }
    }
    beat()
    poll()
    const iv = setInterval(() => {
      beat()
      poll()
    }, 30_000)
    return () => {
      alive = false
      clearInterval(iv)
    }
  }, [])

  // Derive the active workspace from the URL: /workspace/[id]/...
  const wsMatch = pathname.match(/^\/workspace\/([^/]+)/)
  const activeWsId = wsMatch?.[1]
  const activeWs = workspaces.find((w) => w.id === activeWsId)

  // Sections gated by the super-admin permissions matrix (allowedSections).
  const sec = (key: string) => allowedSections.includes(key)
  const globalNav: NavItem[] = [
    { href: "/how-to-use", label: "How to use?", icon: BookOpen },
    ...(sec("dashboard") ? [{ href: "/dashboard", label: "Dashboard", icon: LayoutDashboard }] : []),
    ...(sec("blueprints") ? [{ href: "/blueprints", label: "Blueprints", icon: ClipboardCheck }] : []),
    ...(sec("workspaces") ? [{ href: "/workspaces", label: "Workspaces", icon: Boxes }] : []),
    ...(sec("crm") ? [{ href: "/crm", label: "CRM", icon: Briefcase }] : []),
    ...(sec("support") ? [{ href: "/support", label: "Support", icon: LifeBuoy }] : []),
    // Discord — community directory + direct messages, open to everyone.
    { href: "/discord", label: "Discord", icon: Users2, badge: dmUnread || undefined },
    // rebuild216 CLI — in-app connection guide.
    { href: "/rebuild216", label: "rebuild216 CLI", icon: TerminalSquare },
    ...(sec("analytics") ? [{ href: "/analytics", label: "Analytics", icon: BarChart3 }] : []),
    ...(sec("reports") ? [{ href: "/reports", label: "Reports", icon: FileBarChart }] : []),
  ]

  // Account / admin shortcuts (also in the avatar menu) — surfaced in the sidebar.
  const bottomNav: NavItem[] = [
    ...(can(user, "admin.panel")
      ? [
          { href: "/admin", label: "Admin", icon: Shield },
          { href: "/admin/audit", label: "Audit", icon: ScrollText },
        ]
      : []),
    { href: "/settings", label: "Settings", icon: Settings },
    { href: "/profile", label: "Profile", icon: CircleUser },
  ]

  // Show the workspace sub-nav whenever the URL is inside a workspace, even if
  // that workspace isn't in the user's list (admins, freshly-created, stale list).
  const wsNav: NavItem[] = activeWsId
    ? [
        { href: `/workspace/${activeWsId}/overview`, label: "Overview", icon: LayoutDashboard },
        { href: `/workspace/${activeWsId}/projects`, label: "Projects", icon: KanbanSquare },
        { href: `/workspace/${activeWsId}/ide`, label: "IDE", icon: TerminalSquare },
        { href: `/workspace/${activeWsId}/git`, label: "Git & CI/CD", icon: GitBranch },
        { href: `/workspace/${activeWsId}/chat`, label: "Team Chat", icon: MessageSquare },
        { href: `/workspace/${activeWsId}/documents`, label: "Documents", icon: FileText },
        { href: `/workspace/${activeWsId}/calendar`, label: "Calendar", icon: Calendar },
        { href: `/workspace/${activeWsId}/settings`, label: "Settings", icon: Settings },
      ]
    : []

  return (
    <div className="flex h-svh overflow-hidden bg-background">
      {/* Sidebar */}
      <aside ref={sidebarRef} className="bg-sidebar text-sidebar-foreground hidden w-60 shrink-0 flex-col border-r md:flex">
        <div className="flex h-14 items-center border-b px-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="REBUILD" className="h-6 w-auto object-contain brightness-0 dark:invert" />
        </div>

        <ScrollArea className="flex-1">
          <nav className="space-y-1 p-3">
            {globalNav.map((item) => (
              <NavLink
                key={item.href}
                item={item}
                active={pathname === item.href || pathname.startsWith(item.href + "/")}
              />
            ))}
          </nav>

          {activeWsId && (
            <div className="px-3 pb-3">
              <div className="text-muted-foreground px-3 pb-1 text-[11px] font-medium tracking-wide uppercase">
                {activeWs?.name ?? "Workspace"}
              </div>
              <nav className="space-y-1">
                {wsNav.map((item) => (
                  <NavLink
                    key={item.href}
                    item={item}
                    active={pathname.startsWith(item.href)}
                  />
                ))}
              </nav>
            </div>
          )}

          <div className="mt-2 border-t px-3 py-3">
            <nav className="space-y-1">
              {bottomNav.map((item) => (
                <NavLink
                  key={item.href}
                  item={item}
                  active={pathname === item.href || pathname.startsWith(item.href + "/")}
                />
              ))}
            </nav>
          </div>
        </ScrollArea>
      </aside>

      {/* Mobile nav drawer */}
      <Sheet open={mobileNav} onOpenChange={setMobileNav}>
        <SheetContent side="left" className="w-64 p-0">
          <div ref={mobileNavRef} className="contents">
          <SheetTitle className="flex h-14 items-center border-b px-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" alt="REBUILD" className="h-6 w-auto object-contain brightness-0 dark:invert" />
          </SheetTitle>
          <ScrollArea className="h-[calc(100svh-3.5rem)]">
            <nav className="space-y-1 p-3">
              {globalNav.map((item) => (
                <NavLink
                  key={item.href}
                  item={item}
                  active={pathname === item.href || pathname.startsWith(item.href + "/")}
                  onClick={() => setMobileNav(false)}
                />
              ))}
            </nav>
            {activeWsId && (
              <div className="px-3 pb-3">
                <div className="text-muted-foreground px-3 pb-1 text-[11px] font-medium uppercase">
                  {activeWs?.name ?? "Workspace"}
                </div>
                <nav className="space-y-1">
                  {wsNav.map((item) => (
                    <NavLink
                      key={item.href}
                      item={item}
                      active={pathname.startsWith(item.href)}
                      onClick={() => setMobileNav(false)}
                    />
                  ))}
                </nav>
              </div>
            )}
          </ScrollArea>
          </div>
        </SheetContent>
      </Sheet>

      {/* Main column */}
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar user={user} notifications={notifications} onMenu={() => setMobileNav(true)} />
        <main ref={mainRef} className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  )
}

function Topbar({
  user,
  notifications,
  onMenu,
}: {
  user: User
  notifications: Notification[]
  onMenu: () => void
}) {
  const router = useRouter()
  const t = useT()
  const { resolvedTheme, setTheme } = useTheme()
  const [items, setItems] = useState(notifications)
  const unread = items.filter((n) => !n.read)

  // Reliable refresh: poll the bell every 20s (works on serverless where the
  // SSE stream may not persist). Realtime below is the instant-path enhancement.
  useEffect(() => {
    const tick = async () => {
      try {
        const r = await fetch("/api/notifications")
        if (!r.ok) return
        const d = await r.json()
        const next: Notification[] = Array.isArray(d) ? d : (d.items ?? [])
        setItems(next)
      } catch {
        /* ignore */
      }
    }
    const iv = setInterval(tick, 20_000)
    return () => clearInterval(iv)
  }, [])

  // Live notifications pushed to this user's room.
  useRealtime(useMemo(() => [`user:${user.id}`], [user.id]), (event) => {
    if (event.type !== "notification") return
    const { notification } = event.payload as { notification: Notification }
    setItems((prev) =>
      prev.some((n) => n.id === notification.id)
        ? prev
        : [notification, ...prev]
    )
    toast(notification.content)
  })

  async function markAllRead() {
    if (unread.length === 0) return
    setItems((prev) => prev.map((n) => ({ ...n, read: true })))
    await fetch("/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ all: true }),
    })
  }

  async function removeNotification(id: string) {
    setItems((prev) => prev.filter((n) => n.id !== id))
    await fetch("/api/notifications", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    })
  }

  async function clearAll() {
    setItems([])
    await fetch("/api/notifications", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ all: true }),
    })
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" })
    router.push("/login")
    router.refresh()
  }

  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b px-4 md:px-6">
      <div className="flex items-center gap-2">
        <button
          onClick={onMenu}
          className="hover:bg-muted -ml-1 rounded-md p-2 md:hidden"
          aria-label="Open menu"
        >
          <Menu className="size-5" />
        </button>
        <SearchCommand />
      </div>

      <div className="flex items-center gap-1">
        {/* Notifications */}
        <DropdownMenu
          onOpenChange={(open) => {
            if (!open) markAllRead()
          }}
        >
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="relative">
              <Bell className="size-4" />
              {unread.length > 0 && (
                <span className="bg-destructive text-destructive-foreground absolute -top-0.5 -right-0.5 flex size-4 items-center justify-center rounded-full text-[9px] font-semibold">
                  {unread.length}
                </span>
              )}
              <span className="sr-only">Notifications</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-80 p-0">
            <div className="flex items-center justify-between px-3 py-2">
              <span className="text-sm font-medium">
                Notifications {unread.length > 0 && <span className="text-muted-foreground font-normal">· {unread.length} new</span>}
              </span>
              {items.length > 0 && (
                <button
                  onClick={(e) => {
                    e.preventDefault()
                    clearAll()
                  }}
                  className="text-muted-foreground hover:text-foreground text-xs"
                >
                  Clear all
                </button>
              )}
            </div>
            <DropdownMenuSeparator className="my-0" />
            {items.length === 0 ? (
              <div className="text-muted-foreground px-2 py-8 text-center text-sm">
                You&apos;re all caught up.
              </div>
            ) : (
              <div className="max-h-96 overflow-y-auto py-1">
                {items.map((n) => (
                  <div
                    key={n.id}
                    className="group hover:bg-muted/60 flex items-start gap-2 px-3 py-2"
                  >
                    <button
                      onClick={() => {
                        if (!n.read) {
                          setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, read: true } : x)))
                          fetch("/api/notifications", {
                            method: "PATCH",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ id: n.id }),
                          })
                        }
                        if (n.linkUrl) router.push(n.linkUrl)
                      }}
                      className="flex min-w-0 flex-1 flex-col items-start gap-0.5 text-left"
                    >
                      <span className="flex w-full items-start gap-1.5">
                        {!n.read && <span className="bg-primary mt-1.5 size-1.5 shrink-0 rounded-full" />}
                        <span className={cn("text-sm", !n.read && "font-medium")}>{n.content}</span>
                      </span>
                      <span className="text-muted-foreground text-[11px]">
                        {new Date(n.createdAt).toLocaleString()}
                      </span>
                    </button>
                    <button
                      onClick={() => removeNotification(n.id)}
                      aria-label="Dismiss"
                      className="text-muted-foreground hover:text-destructive shrink-0 rounded p-0.5 opacity-0 group-hover:opacity-100"
                    >
                      <X className="size-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Theme toggle */}
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
        >
          <Sun className="size-4 dark:hidden" />
          <Moon className="hidden size-4 dark:block" />
          <span className="sr-only">Toggle theme</span>
        </Button>

        {/* User menu / role switcher */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="gap-2 pl-1.5">
              <UserAvatar name={user.name} src={user.avatarUrl} />
              <div className="hidden text-left leading-tight sm:block">
                <div className="text-sm font-medium">{user.name}</div>
              </div>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel className="flex items-center justify-between">
              {user.name} <RoleBadge role={user.role} />
            </DropdownMenuLabel>
            <div className="text-muted-foreground px-2 pb-1 text-xs">
              {user.email}
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/profile">{t("Profile")}</Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/settings">{t("Settings")}</Link>
            </DropdownMenuItem>
            {can(user, "admin.panel") && (
              <>
                <DropdownMenuItem asChild>
                  <Link href="/admin">{t("Admin panel")}</Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/admin/audit">{t("Audit log")}</Link>
                </DropdownMenuItem>
              </>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={logout}>{t("Log out")}</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}
