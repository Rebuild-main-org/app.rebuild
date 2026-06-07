import { TestPanel } from "@/components/qa/test-panel"

export default async function TestsPage({
  params,
}: {
  params: Promise<{ pid: string }>
}) {
  const { pid } = await params
  return <TestPanel projectId={pid} />
}
