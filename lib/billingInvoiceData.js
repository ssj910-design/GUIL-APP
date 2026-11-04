// lib/billingInvoiceData.js
// billings 한 건 + units/sites(mapUnit/mapSite로 이미 매핑된 배열)로 청구서 PDF(lib/billingInvoicePdf.js)가
// 바로 쓸 수 있는 invoice 객체를 만든다. 관리자 콘솔(BillingsAdmin.jsx, 클라이언트)과 자동 독촉
// 크론(app/api/cron/check-billing-payment, 서버) 양쪽에서 같은 로직을 쓰기 위해 분리했다 —
// 두 쪽 다 순수 데이터(billing/units/sites)만 넘기면 되고 React·DB 접근에 안 묶인다.
import { BRAND, BANK_ACCOUNT } from "./company.js";
import { shortDate, formatUnitLabel, billingDueAmount, receivedTotalOf, normalizeAmount, quoteGrandTotal } from "./utils.js";

// 견적 연동 청구의 "청구 내역" 줄 — 견적서와 같은 구성(자재비·인건비 품목 + 운반비·안전관리비·
// 이윤·할인)으로 만든다. 예전엔 자재 품목만 실어서 줄 합과 합계(견적 승인 금액)가 안 맞았다.
// 0원 항목은 줄을 만들지 않는다. 합이 청구금액과 다르면(외주 등 금액을 따로 정한 건) 쓰지 않는다.
function quoteInvoiceLines(quote, totalCost) {
  if (!quote) return null;
  const lines = [];
  for (const it of quote.quoteItems ?? []) {
    const name = (it.name ?? "").trim();
    const amount = Math.round(Number(it.qty || 0) * Number(it.unitPrice || 0));
    if (!name || !amount) continue;
    lines.push({ name, unit: it.unitNo ? formatUnitLabel(it.unitNo) : null, qty: it.qty ?? null, amount });
  }
  const extras = [
    ["운반비 및 폐자재수거", Number(quote.transportCost || 0)],
    ["안전관리비 및 기타", Number(quote.safetyCost || 0)],
    ["이윤", Number(quote.profit || 0)],
    ["할인", -Number(quote.discountAmount || 0)],
  ];
  for (const [name, amount] of extras) {
    if (amount) lines.push({ name, unit: null, qty: null, amount });
  }
  if (!lines.length) return null;
  // 천단위 절사(quoteGrandTotal)까지 반영한 값과 맞아야 "줄 합 = 합계"가 성립한다.
  const grand = quoteGrandTotal(quote.quoteItems, quote.transportCost, quote.safetyCost, quote.profit, quote.discountAmount);
  const sum = lines.reduce((s, l) => s + l.amount, 0);
  if (Math.abs(grand - Number(totalCost || 0)) > 10) return null;
  // 견적 합계는 천원 단위로 절사한다(quoteGrandTotal) — 그 차액을 견적서와 같은 이름의 줄로 남겨
  // 줄 합과 합계가 어긋나지 않게 한다.
  if (sum !== grand) lines.push({ name: "천단위 절사", unit: null, qty: null, amount: grand - sum });
  return lines;
}

export function buildBillingInvoiceData(billing, units, sites, quoteRequests) {
  const unit = (units ?? []).find((u) => u.id === billing.unitId);
  const site = (sites ?? []).find((s) => s.id === unit?.siteId) ?? (sites ?? []).find((s) => s.name === billing.siteName);
  const siteUnits = site ? (units ?? []).filter((u) => u.siteId === site.id && u.isActive !== false) : [];

  const items = (billing.partPhotos?.length > 1 ? billing.partPhotos : null)?.map((p) => ({
    name: p.name,
    unit: p.unit ?? null,
    qty: p.qty,
    amount: normalizeAmount(p.amount),
    beforeUrls: p.beforeUrls ?? [],
    afterUrls: p.afterUrls ?? [],
  })) ?? [{
    name: billing.part,
    unit: null,
    qty: null,
    amount: billing.isFree ? null : billing.cost,
    beforeUrls: billing.beforePhotoUrls ?? [],
    afterUrls: billing.afterPhotoUrls ?? [],
  }];

  const unitLabel = billing.elevatorNos?.length > 1
    ? formatUnitLabel(billing.elevatorNos)
    : (unit?.unitNo ?? billing.elevatorNo ?? null);
  const siteName = site?.name ?? billing.siteName ?? "-";
  const totalCost = billing.cost ?? items.reduce((sum, it) => sum + (Number(it.amount) || 0), 0);

  // 부분입금(receivedPayments)이 있으면 알림톡의 "청구금액" 자리에 잔금을 대신 넣는다
  // (승인된 템플릿엔 변수가 #{청구금액} 하나뿐이라 별도 줄을 새로 추가하려면 카카오 재승인이
  // 필요함 — 값만 잔금으로 바꾸는 쪽을 택함). 입금이 없으면 null이라 원래 총액을 그대로 쓴다.
  // 금액 표(청구 내역)에 쓸 줄 — 견적 연동 건만 견적서와 같은 구성으로 바꾸고, 직접입력 건은
  // 지금처럼 입력한 품목 그대로 쓴다. 증빙 사진은 items(부품별 전/후 사진)를 계속 쓴다.
  const quote = billing.quoteRequestId ? (quoteRequests ?? []).find((q) => q.id === billing.quoteRequestId) : null;
  const lines = quoteInvoiceLines(quote, totalCost) ?? items.map(({ name, unit, qty, amount }) => ({ name, unit, qty, amount }));

  const receivedTotal = receivedTotalOf(billing);
  const remainingCost = receivedTotal > 0 ? Math.max(billingDueAmount({ ...billing, cost: totalCost }) - receivedTotal, 0) : null;

  return {
    billingId: billing.id,
    siteName,
    docNumber: `${BRAND.code}-BILL${billing.id.slice(0, 8).toUpperCase()}`,
    issuedDate: shortDate(new Date().toISOString().slice(0, 10)),
    siteUnit: unitLabel ? `${siteName} · ${unitLabel}` : siteName,
    address: site?.address ?? "-",
    billingDate: shortDate(billing.billingDate ?? billing.replaceDate),
    items,
    lines,
    totalCost,
    remainingCost,
    receivedPayments: (billing.receivedPayments ?? []).map((p) => ({ date: shortDate(p.date), amount: Number(p.amount) || 0 })),
    paymentDueDate: shortDate(billing.paymentDueDate),
    bank: BANK_ACCOUNT,
    singleUnitSite: siteUnits.length <= 1,
  };
}
