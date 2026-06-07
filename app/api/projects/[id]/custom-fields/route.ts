import { randomUUID } from "crypto"

import { SEL, sb } from "@/lib/data"
import { requireProject } from "@/lib/auth/guard"
import type { CustomField, CustomFieldType } from "@/lib/types"

const TYPES: CustomFieldType[] = ["TEXT", "NUMBER", "SELECT", "DATE"]

// GET /api/projects/:id/custom-fields — field definitions for the project.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const access = await requireProject(id)
  if (access instanceof Response) return access
  const { data } = await sb()
    .from("custom_fields")
    .select(SEL.customField)
    .eq("project_id", id)
    .order("created_at")
  return Response.json((data ?? []) as CustomField[])
}

// POST /api/projects/:id/custom-fields — define a new field (project.create).
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const access = await requireProject(id, "project.create")
  if (access instanceof Response) return access
  const { name, type, options } = (await request.json()) as {
    name?: string
    type?: CustomFieldType
    options?: string[]
  }
  if (!name?.trim() || !type || !TYPES.includes(type)) {
    return Response.json({ error: "name and a valid type are required" }, { status: 400 })
  }
  const row = {
    id: randomUUID(),
    project_id: id,
    name: name.trim(),
    type,
    options: type === "SELECT" ? (options ?? []) : [],
    created_at: new Date().toISOString(),
  }
  const { error } = await sb().from("custom_fields").insert(row)
  if (error) return Response.json({ error: error.message }, { status: 400 })
  return Response.json(row, { status: 201 })
}
