import { notFound } from "next/navigation"

import { getWorkspace } from "@/lib/queries"
import { DocumentManager } from "@/components/documents/document-manager"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

export default async function WorkspaceDocumentsPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const ws = await getWorkspace(id)
  if (!ws) notFound()

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Documents</h1>
        <p className="text-muted-foreground text-sm">
          Shared files for {ws.name} — contracts, specs, assets.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Workspace documents</CardTitle>
          <CardDescription>
            Upload individual files or a whole folder. Drag &amp; drop supported.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DocumentManager workspaceId={id} />
        </CardContent>
      </Card>
    </div>
  )
}
