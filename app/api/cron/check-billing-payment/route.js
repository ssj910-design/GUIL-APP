// 무자료 청구서 자동 독촉 — pg_cron이 매분 호출, 09:00(KST)에만 동작.
// reminder_enabled=true이고 아직 완납 확인이 안 된 결제기한 경과 건을 7일 간격으로
// 재발송한다. 결제기한으로부터 60일이 지나면 자동 재발송을 멈추고 관리자에게만
// "독촉 만료" 알림을 보낸다(N=2달, M=7일 — 사용자 확정값).
// 완납 여부는 received_date 하나로 안 본다 — 분할납부(receivedPayments)로 전액을 다 낸
// 건은 received_date가 끝까지 안 채워질 수 있어(ReceivedPaymentsCell이 그 컬럼을 안 건드림),
// billingDueAmount/receivedTotalOf(입금 현황 판정에 이미 쓰는 기준, lib/utils.js)로 직접 비교한다.
// 최초 발송 PDF(billings.invoice_pdf_url)를 그대로 재사용한다 — 청구 내용은 안 바뀌므로
// 재발송 때마다 새로 만들 필요가 없다.
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { mapBilling, mapUnit, mapSite } from "@/lib/mappers";
import { buildBillingInvoiceData } from "@/lib/billingInvoiceData";
import { billingDueAmount, receivedTotalOf } from "@/lib/utils";
import { sendBillingInvoiceEmail } from "@/lib/email";
import { sendBillingInvoiceAlimtalk } from "@/lib/alimtalk";

const REMINDER_INTERVAL_DAYS = 7;
const REMINDER_EXPIRE_DAYS = 60;
const DAY_MS = 86400000;

async function handle(request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ ok: false, reason: "unauthorized" }, { status: 401 });
  }

  const nowKst = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Seoul" }));
  const kstMins = nowKst.getHours() * 60 + nowKst.getMinutes();
  if (kstMins !== 540) return Response.json({ ok: true, skipped: "시간대 아님" }); // 09:00

  const todayStr = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });
  const db = supabaseAdmin;
  const origin = new URL(request.url).origin;
  const notifyAdmin = (body) =>
    fetch(`${origin}/api/push/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${secret}` },
      body: JSON.stringify(body),
    }).catch(() => {});

  const { data: rows } = await db.from("billings").select("*")
    .eq("billing_method", "무자료")
    .eq("reminder_enabled", true)
    .not("payment_due_date", "is", null)
    .lte("payment_due_date", todayStr);
  if (!rows?.length) return Response.json({ ok: true, targets: 0 });

  const [{ data: unitRows }, { data: siteRows }] = await Promise.all([
    db.from("units").select("id,site_id,unit_no,is_active"),
    db.from("sites").select("id,name,address"),
  ]);
  const units = (unitRows ?? []).map(mapUnit);
  const sites = (siteRows ?? []).map(mapSite);

  let sent = 0, expired = 0, paid = 0;
  for (const row of rows) {
    const billing = mapBilling(row);

    // 완납이면(분할납부 전액 포함) 자동 독촉을 그냥 끄고 넘어간다 — 다음 날부터는 쿼리에도 안 걸림.
    if (billingDueAmount(billing) - receivedTotalOf(billing) <= 0) {
      await db.from("billings").update({ reminder_enabled: false }).eq("id", billing.id);
      paid++;
      continue;
    }

    const daysOverdue = Math.floor(
      (new Date(`${todayStr}T00:00:00+09:00`) - new Date(`${billing.paymentDueDate}T00:00:00+09:00`)) / DAY_MS
    );

    if (daysOverdue > REMINDER_EXPIRE_DAYS) {
      await db.from("billings").update({ reminder_enabled: false }).eq("id", billing.id);
      await notifyAdmin({
        key: "billing_reminder_expired",
        title: "청구서 자동 독촉 만료 — 수동 확인 필요",
        body: `${billing.siteName ?? "-"} · ${billing.part ?? ""} — 결제기한 ${REMINDER_EXPIRE_DAYS}일 경과, 자동 발송 중단됨`,
        url: "/",
      });
      expired++;
      continue;
    }

    const lastMs = billing.lastReminderSentAt ? new Date(billing.lastReminderSentAt).getTime() : null;
    if (lastMs != null && Date.now() - lastMs < REMINDER_INTERVAL_DAYS * DAY_MS) continue;
    if (!billing.recipientEmail && !billing.recipientPhone) continue; // 발송 대상 없음
    const pdfUrl = billing.invoicePdfUrl;
    if (!pdfUrl) continue; // 최초 발송이 아직 안 된 건(PDF 없음)은 자동 독촉 대상이 아니다

    const invoice = buildBillingInvoiceData(billing, units, sites);
    let ok = false;
    if (billing.recipientEmail) {
      try { await sendBillingInvoiceEmail({ to: billing.recipientEmail, invoice, pdfUrl, reminder: true }); ok = true; }
      catch (err) { console.error(`청구서 재발송 이메일 실패 (billingId=${billing.id}):`, err.message); }
    }
    if (billing.recipientPhone) {
      try { await sendBillingInvoiceAlimtalk({ to: billing.recipientPhone, invoice, pdfUrl, reminder: true }); ok = true; }
      catch (err) { console.error(`청구서 재발송 알림톡 실패 (billingId=${billing.id}):`, err.message); }
    }
    if (ok) {
      await db.from("billings").update({ last_reminder_sent_at: new Date().toISOString() }).eq("id", billing.id);
      sent++;
    }
  }

  return Response.json({ ok: true, targets: rows.length, sent, expired, paid });
}

export async function GET(request) { return handle(request); }
export async function POST(request) { return handle(request); }
