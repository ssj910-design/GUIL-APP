// lib/billingInvoiceData.js
// billings 한 건 + units/sites(mapUnit/mapSite로 이미 매핑된 배열)로 청구서 PDF(lib/billingInvoicePdf.js)가
// 바로 쓸 수 있는 invoice 객체를 만든다. 관리자 콘솔(BillingsAdmin.jsx, 클라이언트)과 자동 독촉
// 크론(app/api/cron/check-billing-payment, 서버) 양쪽에서 같은 로직을 쓰기 위해 분리했다 —
// 두 쪽 다 순수 데이터(billing/units/sites)만 넘기면 되고 React·DB 접근에 안 묶인다.
import { BRAND, BANK_ACCOUNT } from "./company.js";
import { shortDate, formatUnitLabel, billingDueAmount, receivedTotalOf } from "./utils.js";

export function buildBillingInvoiceData(billing, units, sites) {
  const unit = (units ?? []).find((u) => u.id === billing.unitId);
  const site = (sites ?? []).find((s) => s.id === unit?.siteId) ?? (sites ?? []).find((s) => s.name === billing.siteName);
  const siteUnits = site ? (units ?? []).filter((u) => u.siteId === site.id && u.isActive !== false) : [];

  const items = (billing.partPhotos?.length > 1 ? billing.partPhotos : null)?.map((p) => ({
    name: p.name,
    unit: p.unit ?? null,
    qty: p.qty,
    amount: p.amount ?? null,
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
    totalCost,
    remainingCost,
    receivedPayments: (billing.receivedPayments ?? []).map((p) => ({ date: shortDate(p.date), amount: Number(p.amount) || 0 })),
    paymentDueDate: shortDate(billing.paymentDueDate),
    bank: BANK_ACCOUNT,
    singleUnitSite: siteUnits.length <= 1,
  };
}
