// 견적서를 이메일/카카오 알림톡으로 발송한다. 두 채널은 서로 독립적으로 시도해서 하나가
// 실패해도 다른 하나의 발송은 그대로 진행하고, 성공한 채널만 발송시각을 기록한다.
import { sendQuoteEmail } from "@/lib/email";
import { sendQuoteAlimtalk } from "@/lib/alimtalk";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { verifyAuthToken } from "@/lib/verifyToken";

export async function POST(request) {
  const auth = verifyAuthToken(request);
  if (!auth || auth.appRole !== "admin") return Response.json({ results: {}, reason: "unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  if (!body?.quoteRequestId) {
    return Response.json({ results: {} }, { status: 200 });
  }

  const {
    quoteRequestId, channels, recipientEmail, recipientPhone,
    senderCcEmail, referenceEmail, referencePhone, quote,
    supplierName, supplierPhone, noticeMessage, attachmentUrls,
  } = body;
  const results = {};
  const now = new Date().toISOString();
  const newLogEntries = [];
  const patch = {
    recipient_email: recipientEmail || null,
    recipient_phone: recipientPhone || null,
    sender_cc_email: senderCcEmail || null,
    reference_email: referenceEmail || null,
    reference_phone: referencePhone || null,
    notice_message: noticeMessage || null,
    attachment_urls: attachmentUrls && attachmentUrls.length ? attachmentUrls : [],
  };

  if (channels?.email) {
    try {
      const cc = [senderCcEmail, referenceEmail].filter(Boolean);
      await sendQuoteEmail({ to: recipientEmail, cc, quote, pdfUrl: quote?.pdfUrl, supplierName, supplierPhone, noticeMessage, attachmentUrls });
      results.email = { ok: true };
      patch.email_sent_at = now;
      newLogEntries.push({ channel: "email", sentAt: now, target: recipientEmail });
    } catch (err) {
      results.email = { ok: false, reason: err.message };
    }
  }

  if (channels?.kakao) {
    try {
      const sent = await sendQuoteAlimtalk({ to: recipientPhone, quote, pdfUrl: quote?.pdfUrl, noticeMessage });
      results.kakao = { ok: true };
      patch.kakao_sent_at = now;
      // messageId를 남겨야 웹훅이 "이 발송의 결과"를 찾아 상태(수신완료/실패)를 채울 수 있다.
      newLogEntries.push({ channel: "kakao", sentAt: now, target: recipientPhone, messageId: sent?.messageId ?? null, status: "pending" });
    } catch (err) {
      results.kakao = { ok: false, reason: err.message };
    }

    // 참조인 카카오 발송은 최선노력 — 실패해도 위 results.kakao(주 수신인 결과)에는
    // 영향을 주지 않고 서버 로그에만 남긴다(주 수신인이 못 받은 것과 무게가 다른 문제).
    // 발송 이력(send_log)에도 남기지 않는다 — 참조인은 부수적 대상이라 주 수신인 발송
    // 이력만 추적한다.
    if (referencePhone) {
      try {
        await sendQuoteAlimtalk({ to: referencePhone, quote, pdfUrl: quote?.pdfUrl, noticeMessage });
      } catch (err) {
        console.error(`참조인 카카오 발송 실패 (quoteRequestId=${quoteRequestId}):`, err.message);
      }
    }
  }

  if (newLogEntries.length) {
    const { data: existing } = await supabaseAdmin
      .from("quote_requests")
      .select("send_log")
      .eq("id", quoteRequestId)
      .single();
    patch.send_log = [...(existing?.send_log ?? []), ...newLogEntries];
  }

  const { error } = await supabaseAdmin.from("quote_requests").update(patch).eq("id", quoteRequestId);
  if (error) {
    console.error(`Failed to update quote_requests id=${quoteRequestId}:`, error.message);
  }

  return Response.json({ results });
}
