// lib/purchaseOrderData.js
// quote_requests 한 건(+units/sites, mapUnit/mapSite로 매핑된 배열) + 승인 정보(승인금액·서명)로
// 발주서 PDF(lib/purchaseOrderPdf.js)가 바로 쓸 수 있는 order 객체를 만든다.
// lib/billingInvoiceData.js와 같은 이유로 분리 — 공개 승인 페이지(app/quote-approve)와
// 승인 처리 서버 라우트(app/api/approve-quote) 양쪽에서 같은 로직을 쓴다.
import { BRAND, COMPANY, QUOTE_NOTES } from "./company.js";
import { shortDate, quoteGrandTotal, quoteDisplayTotal, quoteUnitLabel } from "./utils.js";

// 승인 시각은 UTC ISO 문자열로 들어온다 — 문자열을 그냥 잘라 쓰면 발주서에 9시간 이른
// 시각이 찍히고(16:57 승인 → 07:57), KST 새벽 승인은 날짜까지 전날로 나온다. 한국 시간으로 변환해 쓴다.
export function kstDateTime(iso) {
  const d = iso ? new Date(iso) : null;
  if (!d || Number.isNaN(d.getTime())) return { date: "", time: "" };
  return {
    date: d.toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" }), // 2026-11-10
    time: d.toLocaleTimeString("en-GB", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit" }), // 16:57
  };
}

export function buildPurchaseOrderData(quote, units, sites, { approvedAmount, approvedAt, signatureUrl, approverName }) {
  const approvedKst = kstDateTime(approvedAt);
  const site = (sites ?? []).find((s) => s.id === quote.siteId) ?? (sites ?? []).find((s) => s.name === quote.siteName);
  const siteName = site?.name ?? quote.siteName ?? "-";
  const unitLabel = quoteUnitLabel(units, quote, quote.unitId);

  const items = (quote.quoteItems ?? [])
    .filter((it) => it.name?.trim())
    .map((it) => ({
      name: it.name,
      qty: it.qty || 1,
      unit: it.unit || null,
      unitPrice: Number(it.unitPrice) || 0,
      amount: (Number(it.qty) || 1) * (Number(it.unitPrice) || 0),
    }));
  if (Number(quote.transportCost) > 0) items.push({ name: "운반비", qty: null, unitPrice: null, amount: Number(quote.transportCost) });
  if (Number(quote.safetyCost) > 0) items.push({ name: "안전관리비 및 기타", qty: null, unitPrice: null, amount: Number(quote.safetyCost) });
  if (Number(quote.profit) > 0) items.push({ name: "이윤", qty: null, unitPrice: null, amount: Number(quote.profit) });
  if (Number(quote.discountAmount) > 0) items.push({ name: "할인", qty: null, unitPrice: null, amount: -Number(quote.discountAmount) });

  const grandTotal = quoteGrandTotal(quote.quoteItems, quote.transportCost, quote.safetyCost, quote.profit, quote.discountAmount);
  const displayTotal = quoteDisplayTotal(grandTotal, quote.vatIncluded);

  return {
    quoteId: quote.id,
    docNumber: `${BRAND.code}-PO${quote.id.slice(-8).toUpperCase()}`,
    quoteDocNumber: `${BRAND.code}-Q${quote.id.slice(-8).toUpperCase()}`,
    issuedDate: shortDate(approvedKst.date),
    siteUnit: unitLabel ? `${siteName} · ${unitLabel}` : siteName,
    address: site?.address ?? "-",
    quoteTitle: quote.quoteTitle || quote.constructionType || "-",
    noticeMessage: quote.noticeMessage || null,
    quoteNotes: QUOTE_NOTES, // 견적서 양식 고정 특이사항(보증기간 등) — 관리자 자유 입력과 별개
    items,
    totalCost: displayTotal,
    vatIncluded: !!quote.vatIncluded,
    approvedAmount: approvedAmount ?? displayTotal,
    approvedAt: shortDate(approvedKst.date),
    approvedTime: approvedKst.time,
    signatureUrl,
    approverName: approverName ?? quote.approverName ?? null,
    company: COMPANY,
  };
}
