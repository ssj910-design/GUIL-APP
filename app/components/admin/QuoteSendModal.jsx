"use client";

// 발행된 견적서를 이메일/카카오 알림톡으로 발송 — 발행과는 분리된 별도 동작(관리자가
// PDF 확인 후 직접 발송 버튼을 눌러야 나간다). 두 채널은 독립적으로 시도되고, 실패해도
// 조용히 숨기지 않고 채널별로 성공/실패를 그대로 보여준다.
import { useState } from "react";
import { Modal, inputCls } from "@/app/components/admin/adminShared";

export default function QuoteSendModal({ quote, site, siteManagers, onClose, onSaved }) {
  const primaryManager = (siteManagers ?? []).find((m) => m.isPrimary) ?? (siteManagers ?? [])[0];
  const [email, setEmail] = useState(quote.recipientEmail || primaryManager?.email || "");
  const [phone, setPhone] = useState(quote.recipientPhone || primaryManager?.phone || "");
  const [senderCcEmail, setSenderCcEmail] = useState("");
  const [referenceEmail, setReferenceEmail] = useState("");
  const [referencePhone, setReferencePhone] = useState("");
  const [sendEmail, setSendEmail] = useState(true);
  const [sendKakao, setSendKakao] = useState(true);
  const [sending, setSending] = useState(false);
  const [results, setResults] = useState(null);

  async function handleSend() {
    setSending(true);
    setResults(null);

    const res = await fetch("/api/send-quote", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        quoteRequestId: quote.id,
        channels: { email: sendEmail, kakao: sendKakao },
        recipientEmail: email,
        recipientPhone: phone,
        senderCcEmail: senderCcEmail || null,
        referenceEmail: referenceEmail || null,
        referencePhone: referencePhone || null,
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
    if (res.results?.email?.ok) newLogEntries.push({ channel: "email", sentAt: now, target: email });
    if (res.results?.kakao?.ok) newLogEntries.push({ channel: "kakao", sentAt: now, target: phone });

    const patch = {
      recipientEmail: email,
      recipientPhone: phone,
      senderCcEmail: senderCcEmail || null,
      referenceEmail: referenceEmail || null,
      referencePhone: referencePhone || null,
    };
    if (res.results?.email?.ok) patch.emailSentAt = now;
    if (res.results?.kakao?.ok) patch.kakaoSentAt = now;
    if (newLogEntries.length) patch.sendLog = [...(quote.sendLog ?? []), ...newLogEntries];
    if (res.results?.email?.ok || res.results?.kakao?.ok) onSaved(patch);
  }

  const canSend = (sendEmail || sendKakao) && (!sendEmail || email) && (!sendKakao || phone);

  return (
    <Modal title={`${site?.name ?? quote.siteName} 견적 발송`} onClose={onClose} wide="xl">
      <div className="space-y-3 mb-4">
        <div>
          <p className="text-xs font-bold text-slate-500 mb-1">받는사람 이메일</p>
          <input className={inputCls} value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div>
          <p className="text-xs font-bold text-slate-500 mb-1">받는사람 전화번호</p>
          <input className={inputCls} value={phone} onChange={(e) => setPhone(e.target.value)} />
        </div>
        <div>
          <p className="text-xs font-bold text-slate-500 mb-1">발신측 CC 이메일 (선택)</p>
          <input className={inputCls} value={senderCcEmail} onChange={(e) => setSenderCcEmail(e.target.value)} />
        </div>
        <div>
          <p className="text-xs font-bold text-slate-500 mb-1">참조인 이메일 (선택)</p>
          <input className={inputCls} value={referenceEmail} onChange={(e) => setReferenceEmail(e.target.value)} />
        </div>
        <div>
          <p className="text-xs font-bold text-slate-500 mb-1">참조인 전화번호 (선택)</p>
          <input className={inputCls} value={referencePhone} onChange={(e) => setReferencePhone(e.target.value)} />
        </div>
      </div>

      <div className="flex gap-4 mb-4">
        <label className="flex items-center gap-1.5 text-sm font-semibold text-slate-700">
          <input type="checkbox" checked={sendEmail} onChange={(e) => setSendEmail(e.target.checked)} />
          이메일
        </label>
        <label className="flex items-center gap-1.5 text-sm font-semibold text-slate-700">
          <input type="checkbox" checked={sendKakao} onChange={(e) => setSendKakao(e.target.checked)} />
          카카오 알림톡
        </label>
      </div>

      {results && (
        <div className="space-y-1.5 mb-4 text-sm">
          {sendEmail && (
            <p className={results.email?.ok ? "text-green-700" : "text-red-600"}>
              이메일: {results.email?.ok ? "✅ 발송 완료" : `❌ 실패 - ${results.email?.reason}`}
            </p>
          )}
          {sendKakao && (
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
          disabled={sending || !canSend}
          className="text-sm font-bold text-white bg-blue-700 disabled:bg-slate-300 rounded-xl px-4 py-2.5"
        >
          {sending ? "발송 중..." : "발송"}
        </button>
      </div>
    </Modal>
  );
}
