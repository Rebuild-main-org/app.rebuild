import { requireAuth } from "@/lib/auth/guard"
import { SEL, sb } from "@/lib/data"
import { docSubtotal, docTotal, formatMoney } from "@/lib/finance"
import type { FinanceDoc } from "@/lib/types"

// GET /api/finance/:id/pdf — printable invoice/quote (HTML; print to PDF in the
// browser). Avoids a heavy server-side PDF dependency.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth("billing.manage")
  if (auth instanceof Response) return auth
  const { id } = await params
  const { data } = await sb().from("finance_docs").select(SEL.financeDoc).eq("id", id).maybeSingle()
  const doc = data as FinanceDoc | null
  if (!doc) return Response.json({ error: "Not found" }, { status: 404 })

  const cur = doc.currency || "TND"
  const rows = doc.items
    .map(
      (it) =>
        `<tr><td>${it.description}</td><td style="text-align:right">${it.quantity}</td><td style="text-align:right">${formatMoney(it.unitPrice, cur)}</td><td style="text-align:right">${formatMoney(it.quantity * it.unitPrice, cur)}</td></tr>`
    )
    .join("")
  const label = doc.kind === "INVOICE" ? "Invoice" : "Quote"

  const html = `<!doctype html><html><head><meta charset="utf-8"/>
<title>${doc.number}</title>
<style>
  body{font-family:system-ui,sans-serif;color:#111;max-width:720px;margin:40px auto;padding:0 24px}
  h1{font-size:22px;margin:0}
  .muted{color:#666;font-size:13px}
  table{width:100%;border-collapse:collapse;margin-top:24px;font-size:14px}
  th,td{padding:8px;border-bottom:1px solid #eee}
  th{text-align:left;color:#666;font-weight:600}
  .totals{margin-top:16px;float:right;width:260px;font-size:14px}
  .totals div{display:flex;justify-content:space-between;padding:4px 0}
  .grand{font-weight:700;border-top:2px solid #111;margin-top:4px;padding-top:8px}
  @media print{.no-print{display:none}}
</style></head><body>
  <div style="display:flex;justify-content:space-between;align-items:flex-start">
    <div><h1>REBUILD</h1><div class="muted">Engineering OS</div></div>
    <div style="text-align:right"><h1>${label} ${doc.number}</h1>
      <div class="muted">Issued ${new Date(doc.issueDate).toLocaleDateString()}<br/>Due ${new Date(doc.dueDate).toLocaleDateString()}<br/>Status: ${doc.status}</div>
    </div>
  </div>
  <div style="margin-top:24px"><div class="muted">Billed to</div><b>${doc.clientName}</b></div>
  <table><thead><tr><th>Description</th><th style="text-align:right">Qty</th><th style="text-align:right">Unit</th><th style="text-align:right">Amount</th></tr></thead>
  <tbody>${rows}</tbody></table>
  <div class="totals">
    <div><span>Subtotal</span><span>${formatMoney(docSubtotal(doc), cur)}</span></div>
    <div><span>Tax (${doc.taxRate}%)</span><span>${formatMoney(docTotal(doc) - docSubtotal(doc), cur)}</span></div>
    <div class="grand"><span>Total</span><span>${formatMoney(docTotal(doc), cur)}</span></div>
  </div>
  <div style="clear:both"></div>
  ${doc.notes ? `<p class="muted" style="margin-top:32px">${doc.notes}</p>` : ""}
  <button class="no-print" onclick="window.print()" style="margin-top:40px;padding:8px 16px">Print / Save as PDF</button>
</body></html>`

  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } })
}
