"use client";

// 이미 발행된 견적서를 다시 이메일/카카오 알림톡으로 재발송 — 품목편집 화면
// (QuoteItemsModal)의 "바로 발송하기"로 처음 발송한 뒤, 나중에 다시 보낼 때 쓴다.
// 두 채널은 독립적으로 시도되고, 실패해도 조용히 숨기지 않고 채널별로 성공/실패를
// 그대로 보여준다. 공급자/고객 정보·안내메시지·첨부파일·채널 체크박스는
// QuoteRecipientFields.jsx로 뽑아 QuoteItemsModal과 공유한다.
import { useState } from "react";
import { Modal } from "@/app/components/admin/adminShared";
import { useQuoteRecipientFields, QuoteRecipientInfo, QuoteRecipientExtras } from "@/app/components/admin/QuoteRecipientFields";

export default function QuoteSendModal({ quote, site, siteManagers, profiles, onClose, onSaved }) {
  const rf = useQuoteRecipientFields(quote, siteManagers, profiles);
  const [sending, setSending] = useState(false);
  const [results, setResults] = useState(null);

  async function handleSend() {
    setSending(true);
    setResults(null);

    const supplierName = rf.supplier?.name || null;
    const supplierPhone = rf.supplier ? (rf.supplier.phone || rf.supplier.tel || null) : null;

    const res = await fetch("/api/send-quote", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        quoteRequestId: quote.id,
        channels: { email: rf.sendEmail, kakao: rf.sendKakao },
        recipientEmail: rf.email,
        recipientPhone: rf.phone,
        senderCcEmail: rf.senderCcEmail || null,
        referenceEmail: rf.referenceEmail || null,
        referencePhone: rf.referencePhone || null,
        supplierName,
        supplierPhone,
        noticeMessage: rf.noticeMessage || null,
        attachmentUrls: rf.attachments,
        quote: {
          siteName: site?.name ?? quote.siteName,
          quoteTitle: quote.quoteTitle,
          quoteDate: quote.quoteIssuedDate,
          pdfUrl: quote.quotePdfUrl,
        },
      }),
    })
      .then((r) => r.json())
      .catch((e) => ({ results: { email: { ok: false, reason: e.message }, kakao: { ok: false, reason: e.message } } }));

    setResults(res.results ?? {});
    setSending(false);

    const now = new Date().toISOString();
    const newLogEntries = [];
    if (res.results?.email?.ok) newLogEntries.push({ channel: "email", sentAt: now, target: rf.email });
    if (res.results?.kakao?.ok) newLogEntries.push({ channel: "kakao", sentAt: now, target: rf.phone });

    const patch = {
      recipientEmail: rf.email,
      recipientPhone: rf.phone,
      senderCcEmail: rf.senderCcEmail || null,
      referenceEmail: rf.referenceEmail || null,
      referencePhone: rf.referencePhone || null,
      noticeMessage: rf.noticeMessage || null,
      attachmentUrls: rf.attachments,
    };
    if (res.results?.email?.ok) patch.emailSentAt = now;
    if (res.results?.kakao?.ok) patch.kakaoSentAt = now;
    if (newLogEntries.length) patch.sendLog = [...(quote.sendLog ?? []), ...newLogEntries];
    if (res.results?.email?.ok || res.results?.kakao?.ok) onSaved(patch);
  }

  return (
    <Modal title={`${site?.name ?? quote.siteName} 견적 재발송`} onClose={onClose} wide="xl">
      <QuoteRecipientInfo rf={rf} siteManagers={siteManagers} />
      <QuoteRecipientExtras rf={rf} />

      {results && (
        <div className="space-y-1.5 mb-4 text-sm">
          {rf.sendEmail && (
            <p className={results.email?.ok ? "text-green-700" : "text-red-600"}>
              이메일: {results.email?.ok ? "✅ 발송 완료" : `❌ 실패 - ${results.email?.reason}`}
            </p>
          )}
          {rf.sendKakao && (
            <p className={results.kakao?.ok ? "text-green-700" : "text-red-600"}>
              카카오 알림톡: {results.kakao?.ok ? "✅ 발송 완료" : `❌ 실패 - ${results.kakao?.reason}`}
            </p>
          )}
        </div>
      )}

      <div className="flex justify-end gap-2">
        <button onClick={onClose} className="text-sm font-bold text-slate-500 border border-slate-200 rounded-xl px-4 py-2.5">
          닫기
        </button>
        <button
          onClick={handleSend}
          disabled={sending || !rf.canSend}
          className="text-sm font-bold text-white bg-blue-700 disabled:bg-slate-300 rounded-xl px-4 py-2.5"
        >
          {sending ? "발송 중..." : "재발송"}
        </button>
      </div>
    </Modal>
  );
}
