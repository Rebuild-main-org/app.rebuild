import { DocumentManager } from "@/components/documents/document-manager"

export default async function ProjectDocumentsPage({
  params,
}: {
  params: Promise<{ id: string; pid: string }>
}) {
  const { id, pid } = await params
  return (
    <div className="mx-auto max-w-3xl p-4 md:p-6">
      <DocumentManager workspaceId={id} projectId={pid} />
    </div>
  )
}
