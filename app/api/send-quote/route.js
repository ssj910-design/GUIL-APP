// 견적서를 이메일/카카오 알림톡으로 발송한다. 두 채널은 서로 독립적으로 시도해서 하나가
// 실패해도 다른 하나의 발송은 그대로 진행하고, 성공한 채널만 발송시각을 기록한다.
import { sendQuoteEmail } from "@/lib/email";
import { sendQuoteAlimtalk } from "@/lib/alimtalk";
import { supabase } from "@/lib/supabaseClient";

export async function POST(request) {
  const body = await request.json().catch(() => null);
  if (!body?.quoteRequestId) {
    return Response.json({ results: {} }, { status: 200 });
  }

  const {
    quoteRequestId, channels, recipientEmail, recipientPhone,
    senderCcEmail, referenceEmail, referencePhone, quote,
  } = body;
  const results = {};
  const patch = {
    recipient_email: recipientEmail || null,
    recipient_phone: recipientPhone || null,
    sender_cc_email: senderCcEmail || null,
    reference_email: referenceEmail || null,
    reference_phone: referencePhone || null,
  };

  if (channels?.email) {
    try {
      const cc = [senderCcEmail, referenceEmail].filter(Boolean);
      await sendQuoteEmail({ to: recipientEmail, cc, quote, pdfUrl: quote?.pdfUrl });
      results.email = { ok: true };
      patch.email_sent_at = new Date().toISOString();
    } catch (err) {
      results.email = { ok: false, reason: err.message };
    }
  }

  if (channels?.kakao) {
    try {
      await sendQuoteAlimtalk({ to: recipientPhone, quote, pdfUrl: quote?.pdfUrl });
      results.kakao = { ok: true };
      patch.kakao_sent_at = new Date().toISOString();
    } catch (err) {
      results.kakao = { ok: false, reason: err.message };
    }

    // 참조인 카카오 발송은 최선노력 — 실패해도 위 results.kakao(주 수신인 결과)에는
    // 영향을 주지 않고 서버 로그에만 남긴다(주 수신인이 못 받은 것과 무게가 다른 문제).
    if (referencePhone) {
      try {
        await sendQuoteAlimtalk({ to: referencePhone, quote, pdfUrl: quote?.pdfUrl });
      } catch (err) {
        console.error(`참조인 카카오 발송 실패 (quoteRequestId=${quoteRequestId}):`, err.message);
      }
    }
  }

  const { error } = await supabase.from("quote_requests").update(patch).eq("id", quoteRequestId);
  if (error) {
    console.error(`Failed to update quote_requests id=${quoteRequestId}:`, error.message);
  }

  return Response.json({ results });
}
