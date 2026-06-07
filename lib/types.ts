// Domain types for REBUILD Engineering OS — mirrors the data model in the spec (section 14).

export type Role =
  | "SUPER_ADMIN"
  | "ADMIN"
  | "LEAD"
  | "PM"
  | "ENGINEER"
  | "QA"
  | "DESIGNER"
  | "SALES"
  | "FINANCE"
  | "SUPPORT"
  | "CLIENT"

export const ALL_ROLES: Role[] = [
  "SUPER_ADMIN",
  "ADMIN",
  "LEAD",
  "PM",
  "ENGINEER",
  "QA",
  "DESIGNER",
  "SALES",
  "FINANCE",
  "SUPPORT",
  "CLIENT",
]

export const ROLE_LABELS: Record<Role, string> = {
  SUPER_ADMIN: "Super Admin",
  ADMIN: "Admin",
  LEAD: "Lead",
  PM: "Product Manager",
  ENGINEER: "Engineer",
  QA: "QA",
  DESIGNER: "Designer",
  SALES: "Sales",
  FINANCE: "Finance",
  SUPPORT: "Support",
  CLIENT: "Client",
}

export type WorkspaceStatus = "ACTIVE" | "PAUSED" | "ARCHIVED"

export type ProjectStatus =
  | "PLANNING"
  | "ACTIVE"
  | "REVIEW"
  | "ON_HOLD"
  | "DONE"
  | "CANCELLED"

export type TicketType =
  | "TASK"
  | "BUG"
  | "FEATURE"
  | "REVIEW"
  | "EPIC"
  | "SPIKE"
  | "SUBTASK"

export type LinkType = "BLOCKS" | "RELATES" | "DUPLICATES"

export interface TicketLink {
  id: string
  fromTicketId: string
  toTicketId: string
  type: LinkType
  createdAt: string
}

export interface TicketAttachment {
  id: string
  ticketId: string
  name: string
  mimeType: string
  size: number
  uploadedById?: string
  createdAt: string
}

export const LINK_LABELS: Record<LinkType, { label: string; inverse: string }> = {
  BLOCKS: { label: "blocks", inverse: "is blocked by" },
  RELATES: { label: "relates to", inverse: "relates to" },
  DUPLICATES: { label: "duplicates", inverse: "is duplicated by" },
}

export type TicketPriority = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW"

export type TicketStatus =
  | "BACKLOG"
  | "TODO"
  | "IN_PROGRESS"
  | "IN_REVIEW"
  | "DONE"

export type SprintStatus = "PLANNED" | "ACTIVE" | "COMPLETED"

export type StoryPoints = 1 | 2 | 3 | 5 | 8 | 13

export interface User {
  id: string
  email: string
  name: string
  role: Role
  githubId?: string
  avatarUrl?: string
}

export interface Workspace {
  id: string
  name: string
  slug: string
  githubRepo: string
  status: WorkspaceStatus
  clientName: string
  clientEmail: string
  startDate: string
  technologies: string[]
}

export interface WorkspaceMember {
  id: string
  userId: string
  workspaceId: string
  role: Role
  joinedAt: string
}

export interface Project {
  id: string
  name: string
  shortCode: string // ticket prefix, e.g. "ACME"
  status: ProjectStatus
  workspaceId: string
  description: string
  startDate: string
  endDate?: string
  groupId?: string // optional project group within the workspace
}

export interface ProjectGroup {
  id: string
  workspaceId: string
  name: string
  position: number
  createdAt: string
}

export interface Ticket {
  id: string
  shortId: string // e.g. "ACME-142"
  title: string
  description: string
  type: TicketType
  priority: TicketPriority
  status: TicketStatus
  projectId: string
  assigneeId?: string
  reporterId: string
  labels: string[]
  epicId?: string
  parentId?: string
  milestoneId?: string
  sprintId?: string
  points?: StoryPoints
  dueDate?: string
  commitRef?: string
  branch?: string
  createdAt: string
  updatedAt: string
  order: number // ordering within a status column
}

// --- Custom fields (COULD) ---------------------------------------------------

export type CustomFieldType = "TEXT" | "NUMBER" | "SELECT" | "DATE"

export interface CustomField {
  id: string
  projectId: string
  name: string
  type: CustomFieldType
  options: string[] // for SELECT
  createdAt: string
}

export interface CustomFieldValue {
  fieldId: string
  ticketId: string
  value: string
}

// --- QA (test management, SHOULD) --------------------------------------------

export type TestRunStatus = "PASS" | "FAIL" | "BLOCKED" | "SKIPPED" | "UNTESTED"

export interface TestCase {
  id: string
  projectId: string
  title: string
  steps: string
  expected: string
  createdById: string
  createdAt: string
}

export interface TestRun {
  id: string
  testCaseId: string
  status: TestRunStatus
  notes?: string
  runById: string
  ticketId?: string // bug filed on failure
  createdAt: string
}

export const TEST_RUN_META: Record<TestRunStatus, { label: string; color: string }> = {
  PASS: { label: "Pass", color: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" },
  FAIL: { label: "Fail", color: "bg-red-500/15 text-red-600 dark:text-red-400" },
  BLOCKED: { label: "Blocked", color: "bg-amber-500/15 text-amber-600 dark:text-amber-400" },
  SKIPPED: { label: "Skipped", color: "bg-zinc-500/15 text-zinc-600 dark:text-zinc-300" },
  UNTESTED: { label: "Untested", color: "bg-zinc-500/10 text-zinc-500" },
}

// --- Support (helpdesk + SLA, SHOULD) ----------------------------------------

export type SupportStatus = "NEW" | "OPEN" | "PENDING" | "RESOLVED" | "CLOSED"

export interface SupportTicket {
  id: string
  subject: string
  body: string
  requesterEmail: string
  requesterId?: string
  status: SupportStatus
  priority: TicketPriority
  workspaceId?: string
  assigneeId?: string
  resolvedById?: string
  resolvedAt?: string
  slaDueAt?: string
  createdAt: string
  updatedAt: string
}

export interface SupportComment {
  id: string
  ticketId: string
  authorId: string
  authorName?: string
  content: string
  createdAt: string
}

export const SUPPORT_STATUS_META: Record<SupportStatus, { label: string; color: string }> = {
  NEW: { label: "New", color: "bg-blue-500/15 text-blue-600 dark:text-blue-400" },
  OPEN: { label: "Open", color: "bg-violet-500/15 text-violet-600 dark:text-violet-400" },
  PENDING: { label: "Pending", color: "bg-amber-500/15 text-amber-600 dark:text-amber-400" },
  RESOLVED: { label: "Resolved", color: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" },
  CLOSED: { label: "Closed", color: "bg-zinc-500/15 text-zinc-600 dark:text-zinc-300" },
}

// SLA target hours by priority (first response / resolution).
export const SLA_HOURS: Record<TicketPriority, number> = {
  CRITICAL: 4,
  HIGH: 8,
  MEDIUM: 24,
  LOW: 72,
}

// --- Time tracking (SHOULD) --------------------------------------------------

export interface TimeEntry {
  id: string
  ticketId: string
  userId: string
  minutes: number
  note?: string
  spentOn: string // date (YYYY-MM-DD)
  createdAt: string
}

export interface Comment {
  id: string
  content: string
  ticketId: string
  authorId: string
  createdAt: string
  updatedAt: string
}

export type ActivityKind =
  | "created"
  | "status_changed"
  | "assigned"
  | "commented"
  | "priority_changed"
  | "commit_linked"
  | "pr_linked"

export interface Activity {
  id: string
  ticketId: string
  kind: ActivityKind
  actorId: string
  message: string
  createdAt: string
}

export interface Milestone {
  id: string
  title: string
  description: string
  dueDate: string
  projectId: string
  done: boolean
  validatedByClient: boolean
  clientFeedback?: string
  validatedAt?: string
}

export interface Sprint {
  id: string
  name: string
  goal: string
  startDate: string
  endDate: string
  projectId: string
  status: SprintStatus
}

export interface GitCommit {
  id: string
  hash: string
  message: string
  authorId: string
  date: string
  workspaceId: string
  ticketId?: string
  branch: string
}

export type PRStatus = "OPEN" | "MERGED" | "CLOSED"
export type CIStatus = "PASSING" | "FAILING" | "RUNNING" | "NONE"

export interface PullRequest {
  id: string
  number: number
  title: string
  status: PRStatus
  ci: CIStatus
  branchFrom: string
  branchTo: string
  workspaceId: string
  ticketId?: string
  authorId: string
  createdAt: string
}

export type ReviewState = "APPROVED" | "CHANGES_REQUESTED" | "COMMENTED"

export interface PRReview {
  id: string
  prId: string
  reviewerId: string
  state: ReviewState
  body?: string
  createdAt: string
}

export interface PRComment {
  id: string
  prId: string
  authorId: string
  path?: string
  line?: number
  body: string
  createdAt: string
}

export type DeployEnv = "STAGING" | "PRODUCTION"
export type DeployStatus = "SUCCESS" | "FAILED" | "IN_PROGRESS"

export interface Deployment {
  id: string
  env: DeployEnv
  commitHash: string
  status: DeployStatus
  deployedAt: string
  workspaceId: string
  branch: string
  authorId: string
}

export interface Notification {
  id: string
  type: string
  content: string
  userId: string
  read: boolean
  createdAt: string
  linkUrl?: string
}

export interface Message {
  id: string
  content: string
  authorId: string
  workspaceId: string
  isFromClient: boolean
  createdAt: string
}

// --- Git / IDE (Phase 2) ----------------------------------------------------

export type FileStatus = "unmodified" | "modified" | "added" | "untracked"

export interface RepoFile {
  id: string
  workspaceId: string
  path: string // e.g. "app/page.tsx"
  content: string
  originalContent: string // committed version, for diffing
  status: FileStatus
}

export interface Branch {
  id: string
  workspaceId: string
  name: string
  ahead: number
  behind: number
  protected: boolean
  lastCommitHash: string
  lastCommitDate: string
  lastAuthorId: string
}

export interface TreeNode {
  name: string
  path: string
  type: "file" | "dir"
  status?: FileStatus
  children?: TreeNode[]
}

export const FILE_STATUS_META: Record<
  FileStatus,
  { letter: string; color: string }
> = {
  unmodified: { letter: "", color: "" },
  modified: { letter: "M", color: "text-amber-500" },
  added: { letter: "A", color: "text-emerald-500" },
  untracked: { letter: "U", color: "text-emerald-500" },
}

export interface AuditLog {
  id: string
  action: string
  entityType: string
  entityId: string
  userId: string
  meta?: Record<string, unknown>
  createdAt: string
}

// --- User preferences (profile & settings) ----------------------------------

export type ThemePref = "light" | "dark" | "system"
export type Density = "comfortable" | "compact"
export type Language = "en" | "fr" | "ar"

// Self-set availability shown in the Discord directory (distinct from live
// presence). "INVISIBLE" hides the online dot from others.
export type Availability = "AVAILABLE" | "BUSY" | "INVISIBLE" | "AWAY"

export const AVAILABILITY_META: Record<Availability, { label: string; dot: string }> = {
  AVAILABLE: { label: "Available", dot: "bg-emerald-500" },
  BUSY: { label: "Busy", dot: "bg-red-500" },
  AWAY: { label: "Away", dot: "bg-amber-500" },
  INVISIBLE: { label: "Invisible", dot: "bg-zinc-400" },
}

export interface UserPreferences {
  userId: string
  theme: ThemePref
  density: Density
  language: Language
  accent: string // hex
  emailDigest: boolean
  title?: string // job title
  bio?: string
  availability: Availability
  skills: string[]
  tags: string[]
  openToTalk: boolean
  dnd: boolean
  visibility: ProfileVisibility
}

export type ProfileVisibility = "everyone" | "team" | "nobody"

// --- AI Agents library (Super Admin) ----------------------------------------

export type AgentFileKind = "doc" | "ui" | "language" | "rule" | "knowledge" | "config"

export const AGENT_FILE_KINDS: AgentFileKind[] = ["doc", "ui", "language", "rule", "knowledge", "config"]

export interface Agent {
  id: string
  name: string
  description: string
  createdAt?: string
  updatedAt?: string
  fileCount?: number
}

export interface AgentFile {
  id: string
  agentId: string
  name: string
  kind: AgentFileKind
  content: string
  updatedAt?: string
}

// --- Discord (community directory + direct messages) -------------------------

export interface DiscordMember {
  id: string
  name: string
  email: string
  role: Role
  avatarUrl?: string
  title?: string
  bio?: string
  skills: string[]
  tags: string[]
  availability: Availability
  openToTalk: boolean
  online?: boolean
}

export interface MessageReaction {
  emoji: string
  count: number
  mine: boolean
}

export interface MessageAttachment {
  url: string // base64 data URL
  name: string
  type: string // mime type
}

export interface DirectMessage {
  id: string
  threadId: string
  senderId: string
  senderName?: string
  content: string
  createdAt: string
  readAt?: string | null
  reactions?: MessageReaction[]
  attachment?: MessageAttachment | null
}

// Relationship flags toward another member (for the directory / profile UI).
export interface MemberRelationship {
  blocked: boolean // I blocked them
  muted: boolean // I muted their DM notifications
}

export interface DmThread {
  threadId: string
  isGroup: boolean
  otherId: string // "" for groups
  name: string // other user's name, or the group name
  avatarUrl?: string
  availability: Availability
  online: boolean
  members?: { id: string; name: string; avatarUrl?: string }[] // groups
  createdBy?: string // groups
  lastMessage: string
  lastAt: string
  unread: number
}

// --- Admin finance (devis / factures / charges & revenus) --------------------

export type DocStatus = "DRAFT" | "SENT" | "ACCEPTED" | "PAID" | "REJECTED"

export interface LineItem {
  description: string
  quantity: number
  unitPrice: number
}

export interface FinanceDoc {
  id: string
  kind: "QUOTE" | "INVOICE" // devis | facture
  number: string // e.g. DEV-2026-001 / FAC-2026-001
  workspaceId?: string
  clientName: string
  issueDate: string
  dueDate: string
  status: DocStatus
  items: LineItem[]
  taxRate: number // %
  currency: string
  notes?: string
}

export type TxnKind = "REVENUE" | "EXPENSE" // revenu | charge

export interface Transaction {
  id: string
  kind: TxnKind
  label: string
  category: string
  amount: number
  date: string
  workspaceId?: string
}

// --- CRM / pre-sales pipeline -------------------------------------------------

export type LeadStage = "LEAD" | "QUALIFIED" | "PROPOSAL" | "WON" | "LOST"

export interface Lead {
  id: string
  company: string
  contactName: string
  contactEmail: string
  stage: LeadStage
  value: number
  currency: string
  source: string
  ownerId?: string
  notes?: string
  workspaceId?: string // set when converted to a workspace
  createdAt: string
  updatedAt: string
}

export const LEAD_STAGES: LeadStage[] = [
  "LEAD",
  "QUALIFIED",
  "PROPOSAL",
  "WON",
  "LOST",
]

export const LEAD_STAGE_META: Record<
  LeadStage,
  { label: string; color: string }
> = {
  LEAD: { label: "Lead", color: "bg-zinc-500/15 text-zinc-600 dark:text-zinc-300" },
  QUALIFIED: { label: "Qualified", color: "bg-blue-500/15 text-blue-600 dark:text-blue-400" },
  PROPOSAL: { label: "Proposal", color: "bg-amber-500/15 text-amber-600 dark:text-amber-400" },
  WON: { label: "Won", color: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" },
  LOST: { label: "Lost", color: "bg-red-500/15 text-red-600 dark:text-red-400" },
}

// --- Documents (uploads per workspace / project) -----------------------------

export interface DocFile {
  id: string
  name: string
  mimeType: string
  size: number
  dataUrl: string // base64 data URL (no object store in this env)
  workspaceId: string
  projectId?: string
  uploadedById: string
  createdAt: string
}

// --- Calendar & Meet ---------------------------------------------------------

export interface Meeting {
  id: string
  title: string
  start: string
  end: string
  workspaceId?: string
  meetLink: string
  attendeeIds: string[]
  createdById: string
}

// --- UI helper metadata -----------------------------------------------------

export const TICKET_STATUSES: TicketStatus[] = [
  "BACKLOG",
  "TODO",
  "IN_PROGRESS",
  "IN_REVIEW",
  "DONE",
]

export const STATUS_LABELS: Record<TicketStatus, string> = {
  BACKLOG: "Backlog",
  TODO: "To Do",
  IN_PROGRESS: "In Progress",
  IN_REVIEW: "In Review",
  DONE: "Done",
}

export const TYPE_META: Record<
  TicketType,
  { label: string; icon: string; color: string }
> = {
  TASK: { label: "Task", icon: "✓", color: "text-blue-500" },
  BUG: { label: "Bug", icon: "✗", color: "text-red-500" },
  FEATURE: { label: "Feature", icon: "★", color: "text-emerald-500" },
  REVIEW: { label: "Review", icon: "◎", color: "text-orange-500" },
  EPIC: { label: "Epic", icon: "⬡", color: "text-violet-500" },
  SPIKE: { label: "Spike", icon: "?", color: "text-zinc-500" },
  SUBTASK: { label: "Sub-task", icon: "↳", color: "text-sky-500" },
}

export const PRIORITY_META: Record<
  TicketPriority,
  { label: string; color: string; rank: number }
> = {
  CRITICAL: { label: "Critical", color: "bg-red-500/15 text-red-600 dark:text-red-400", rank: 0 },
  HIGH: { label: "High", color: "bg-orange-500/15 text-orange-600 dark:text-orange-400", rank: 1 },
  MEDIUM: { label: "Medium", color: "bg-amber-500/15 text-amber-600 dark:text-amber-400", rank: 2 },
  LOW: { label: "Low", color: "bg-zinc-500/15 text-zinc-600 dark:text-zinc-400", rank: 3 },
}

export const PROJECT_STATUS_META: Record<
  ProjectStatus,
  { label: string; color: string }
> = {
  PLANNING: { label: "Planning", color: "bg-zinc-500/15 text-zinc-600 dark:text-zinc-300" },
  ACTIVE: { label: "Active", color: "bg-blue-500/15 text-blue-600 dark:text-blue-400" },
  REVIEW: { label: "Review", color: "bg-orange-500/15 text-orange-600 dark:text-orange-400" },
  ON_HOLD: { label: "On Hold", color: "bg-amber-500/15 text-amber-600 dark:text-amber-400" },
  DONE: { label: "Done", color: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" },
  CANCELLED: { label: "Cancelled", color: "bg-red-500/15 text-red-600 dark:text-red-400" },
}
