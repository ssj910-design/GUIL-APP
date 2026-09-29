// 청구서(무자료)를 이메일/카카오 알림톡으로 발송한다. app/api/send-quote/route.js와 같은
// 구조 — 두 채널은 독립적으로 시도, 성공한 채널만 발송시각을 기록한다.
// reminder=false(관리자가 누른 최초/수동 재발송)와 reminder=true(크론의 자동 독촉)를 같이
// 처리한다 — 크론은 CRON_SECRET으로, 관리자 화면은 로그인 토큰으로 인증한다.
import { sendBillingInvoiceEmail } from "@/lib/email";
import { sendBillingInvoiceAlimtalk } from "@/lib/alimtalk";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { verifyAuthToken } from "@/lib/verifyToken";

export async function POST(request) {
  const cronSecret = process.env.CRON_SECRET;
  const isCron = !!cronSecret && request.headers.get("authorization") === `Bearer ${cronSecret}`;
  if (!isCron) {
    const auth = verifyAuthToken(request);
    if (!auth || auth.appRole !== "admin") return Response.json({ results: {}, reason: "unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  if (!body?.billingId) {
    return Response.json({ results: {} }, { status: 200 });
  }

  const {
    billingId, channels, recipientEmail, recipientPhone,
    invoice, pdfUrl, reminder,
    paymentDueDate, reminderEnabled,
  } = body;
  const results = {};
  const now = new Date().toISOString();
  const newLogEntries = [];
  const patch = {
    recipient_email: recipientEmail || null,
    recipient_phone: recipientPhone || null,
    invoice_pdf_url: pdfUrl || null,
    ...(paymentDueDate !== undefined ? { payment_due_date: paymentDueDate || null } : {}),
    ...(reminderEnabled !== undefined ? { reminder_enabled: !!reminderEnabled } : {}),
  };

  if (channels?.email) {
    try {
      await sendBillingInvoiceEmail({ to: recipientEmail, invoice, pdfUrl, reminder });
      results.email = { ok: true };
      newLogEntries.push({ channel: "email", sentAt: now, target: recipientEmail, reminder: !!reminder });
    } catch (err) {
      results.email = { ok: false, reason: err.message };
    }
  }

  if (channels?.kakao) {
    try {
      await sendBillingInvoiceAlimtalk({ to: recipientPhone, invoice, pdfUrl, reminder });
      results.kakao = { ok: true };
      newLogEntries.push({ channel: "kakao", sentAt: now, target: recipientPhone, reminder: !!reminder });
    } catch (err) {
      results.kakao = { ok: false, reason: err.message };
    }
  }

  const anyOk = results.email?.ok || results.kakao?.ok;
  if (anyOk) {
    if (reminder) patch.last_reminder_sent_at = now;
    else patch.invoice_sent_at = now;
  }

  if (newLogEntries.length) {
    const { data: existing } = await supabaseAdmin.from("billings").select("send_log").eq("id", billingId).single();
    patch.send_log = [...(existing?.send_log ?? []), ...newLogEntries];
  }

  const { error } = await supabaseAdmin.from("billings").update(patch).eq("id", billingId);
  if (error) {
    console.error(`Failed to update billings id=${billingId}:`, error.message);
  }

  return Response.json({ results });
}
