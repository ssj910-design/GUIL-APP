// 고객이 공개 승인 페이지(app/quote-approve)에서 금액 확인 후 서명을 제출하면 호출된다.
// 서버에서 직접 견적 금액을 다시 계산해 클라이언트가 보낸 승인금액과 대조한 뒤(위변조 방지),
// 발주서 PDF를 생성·저장하고 quote_requests를 승인 처리한다. 로그인 없는 공개 엔드포인트라
// CRON_SECRET이나 로그인 토큰 없이 받되, 승인 가능한 상태(작성)인지는 반드시 서버에서 다시 확인한다.
//
// GET도 같은 라우트에서 처리한다 — quote_requests/units/sites는 RLS가 막혀 있어 로그인 없는
// 클라이언트가 anon key로 직접 못 읽는다(실측 확인: curl로 재현됨). 그래서 화면에 보여줄 요약도
// 서버(service role)가 대신 조회해서 내려준다.
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { mapQuoteRequest, mapUnit, mapSite } from "@/lib/mappers";
import { buildPurchaseOrderData } from "@/lib/purchaseOrderData";
import { buildPurchaseOrderPdfBytes } from "@/lib/purchaseOrderPdf";
import { quoteGrandTotal, quoteDisplayTotal } from "@/lib/utils";

export async function GET(request) {
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return Response.json({ ok: false, reason: "잘못된 요청입니다" }, { status: 200 });
  const db = supabaseAdmin;

  const { data: row } = await db.from("quote_requests").select("*").eq("id", id).single();
  if (!row) return Response.json({ ok: false, reason: "견적을 찾을 수 없습니다" }, { status: 200 });
  const quote = mapQuoteRequest(row);
  if (quote.status !== "작성") {
    return Response.json({ ok: true, status: quote.status, purchaseOrderPdfUrl: quote.purchaseOrderPdfUrl });
  }

  const [{ data: unitRows }, { data: siteRows }] = await Promise.all([
    db.from("units").select("id,site_id,unit_no,is_active"),
    db.from("sites").select("id,name,address"),
  ]);
  const units = (unitRows ?? []).map(mapUnit);
  const sites = (siteRows ?? []).map(mapSite);
  const order = buildPurchaseOrderData(quote, units, sites, { approvedAmount: null, approvedAt: new Date().toISOString(), signatureUrl: null });

  return Response.json({ ok: true, status: quote.status, order, quotePdfUrl: quote.quotePdfUrl ?? null });
}

export async function POST(request) {
  const body = await request.json().catch(() => null);
  if (!body?.quoteId || !body?.signatureUrl || body?.approvedAmountInput == null) {
    return Response.json({ ok: false, reason: "잘못된 요청입니다" }, { status: 200 });
  }
  const { quoteId, signatureUrl, approvedAmountInput } = body;
  const db = supabaseAdmin;

  const { data: row } = await db.from("quote_requests").select("*").eq("id", quoteId).single();
  if (!row) return Response.json({ ok: false, reason: "견적을 찾을 수 없습니다" }, { status: 200 });
  const quote = mapQuoteRequest(row);
  if (quote.status !== "작성") {
    return Response.json({ ok: false, reason: "지금은 승인할 수 없는 상태입니다. 새로고침 후 다시 확인해주세요." }, { status: 200 });
  }

  const grandTotal = quoteGrandTotal(quote.quoteItems, quote.transportCost, quote.safetyCost, quote.profit, quote.discountAmount);
  const displayTotal = quoteDisplayTotal(grandTotal, quote.vatIncluded);
  if (Number(approvedAmountInput) !== displayTotal) {
    return Response.json({ ok: false, reason: "금액이 일치하지 않습니다" }, { status: 200 });
  }

  const [{ data: unitRows }, { data: siteRows }] = await Promise.all([
    db.from("units").select("id,site_id,unit_no,is_active"),
    db.from("sites").select("id,name,address"),
  ]);
  const units = (unitRows ?? []).map(mapUnit);
  const sites = (siteRows ?? []).map(mapSite);

  const now = new Date().toISOString();
  const order = buildPurchaseOrderData(quote, units, sites, { approvedAmount: displayTotal, approvedAt: now, signatureUrl });

  let bytes;
  try {
    bytes = await buildPurchaseOrderPdfBytes(order);
  } catch (err) {
    return Response.json({ ok: false, reason: `발주서 생성 실패: ${err.message}` }, { status: 200 });
  }

  const path = `purchase-orders/${quoteId}/v1/${Date.now()}.pdf`;
  const { error: uploadError } = await db.storage.from("photos").upload(path, Buffer.from(bytes), { contentType: "application/pdf", upsert: true });
  if (uploadError) return Response.json({ ok: false, reason: "발주서 저장 실패: " + uploadError.message }, { status: 200 });
  const pdfUrl = db.storage.from("photos").getPublicUrl(path).data.publicUrl;

  const { error: updateError } = await db.from("quote_requests").update({
    status: "승인",
    approved_date: now.slice(0, 10),
    approved_at: now,
    approved_amount: displayTotal,
    approval_signature_url: signatureUrl,
    purchase_order_pdf_url: pdfUrl,
  }).eq("id", quoteId);
  if (updateError) return Response.json({ ok: false, reason: "승인 처리 실패: " + updateError.message }, { status: 200 });

  const secret = process.env.CRON_SECRET;
  if (secret) {
    const origin = new URL(request.url).origin;
    fetch(`${origin}/api/push/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${secret}` },
      body: JSON.stringify({
        key: "quote_approved_by_customer",
        title: "고객이 견적을 승인했어요",
        body: `${quote.siteName ?? ""} · ${quote.quoteTitle || quote.constructionType || ""} · ${displayTotal.toLocaleString()}원`,
        url: "/",
      }),
    }).catch(() => {});
  }

  return Response.json({ ok: true, approvedAt: now, pdfUrl });
}
