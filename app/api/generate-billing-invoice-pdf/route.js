// app/api/generate-billing-invoice-pdf/route.js
// 청구서 PDF를 만들어 그대로 돌려주면서, 동시에 Storage에도 올려 URL을 헤더로 함께 준다.
// app/api/generate-replacement-certificate-pdf/route.js와 동일한 캐싱 패턴 — 호출부
// (BillingsAdmin)가 이 URL을 billings.invoice_pdf_url에 저장해두면 다음부터는 재생성을 건너뛴다.
import { buildBillingInvoicePdfBytes } from "@/lib/billingInvoicePdf";
import { supabase } from "@/lib/supabaseClient";

export async function POST(request) {
  const invoice = await request.json().catch(() => null);
  if (!invoice) {
    return Response.json({ ok: false, reason: "요청 본문이 올바르지 않습니다" }, { status: 200 });
  }

  let bytes;
  try {
    bytes = await buildBillingInvoicePdfBytes(invoice);
  } catch (err) {
    return Response.json({ ok: false, reason: `PDF 생성 실패: ${err.message}` }, { status: 200 });
  }

  let invoiceUrl = null;
  if (invoice.billingId) {
    const path = `billing-invoices/${invoice.billingId}/v1/${Date.now()}.pdf`;
    const { error: uploadError } = await supabase.storage
      .from("photos")
      .upload(path, Buffer.from(bytes), { contentType: "application/pdf", upsert: true });
    if (!uploadError) {
      invoiceUrl = supabase.storage.from("photos").getPublicUrl(path).data.publicUrl;
    }
  }

  return new Response(Buffer.from(bytes), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      ...(invoiceUrl ? { "X-Invoice-Url": invoiceUrl } : {}),
    },
  });
}
