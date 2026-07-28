"use client";

// 발행된 견적서를 이메일/카카오 알림톡으로 발송 — 발행과는 분리된 별도 동작(관리자가
// PDF 확인 후 직접 발송 버튼을 눌러야 나간다). 두 채널은 독립적으로 시도되고, 실패해도
// 조용히 숨기지 않고 채널별로 성공/실패를 그대로 보여준다.
//
// 공급자/고객 정보 2단 레이아웃 — 청구스(chungoose.ai) 참고 2단계(설계:
// docs/superpowers/specs/2026-07-28-quote-send-two-column-design.md). 담당자 드롭다운은
// 기존 텍스트 입력을 채워주는 편의 기능일 뿐, 실제 전송 값은 여전히 텍스트 입력이다.
import { useState, useRef } from "react";
import { Modal, inputCls } from "@/app/components/admin/adminShared";
import { COMPANY } from "@/lib/company";
import { uploadPhoto } from "@/lib/photos";

const MAX_ATTACHMENTS = 10;
const MAX_ATTACHMENT_MB = 25;

export default function QuoteSendModal({ quote, site, siteManagers, profiles, onClose, onSaved }) {
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
  const [noticeMessage, setNoticeMessage] = useState("");
  const [attachments, setAttachments] = useState([]); // { name, url }[]
  const [uploading, setUploading] = useState(false);
  const [attachError, setAttachError] = useState("");
  const fileInputRef = useRef(null);

  const activeStaff = (profiles ?? []).filter((p) => p.is_active !== false && !p.deleted_at);
  const staffByName = [...activeStaff].sort((a, b) => (a.name ?? "").localeCompare(b.name ?? "", "ko"));
  const staffWithEmail = staffByName.filter((p) => p.email);
  // 전화번호 없는 직원을 고르면 서명이 그 사람이 아니라 폴백(신석주)으로 조용히 바뀌어
  // 드롭다운 표시와 실제 서명이 어긋난다 — 그 상황 자체를 만들지 않도록 후보를 좁힌다.
  const staffWithPhone = staffByName.filter((p) => p.phone || p.tel);
  const defaultSupplier = staffByName.find((p) => p.name === "신석주" && p.phone) ?? null;

  const [supplierId, setSupplierId] = useState(defaultSupplier?.id ?? "");
  const [supplierCcId, setSupplierCcId] = useState("");
  const [customerManagerId, setCustomerManagerId] = useState(primaryManager?.id ?? "");
  const [customerCcId, setCustomerCcId] = useState("");

  const supplier = staffByName.find((p) => p.id === supplierId);
  const otherManagers = (siteManagers ?? []).filter((m) => m.id !== customerManagerId);

  function selectCustomerManager(id) {
    setCustomerManagerId(id);
    const m = (siteManagers ?? []).find((x) => x.id === id);
    if (m) { setEmail(m.email || ""); setPhone(m.phone || ""); }
  }
  function selectCustomerCc(id) {
    setCustomerCcId(id);
    const m = (siteManagers ?? []).find((x) => x.id === id);
    if (m) { setReferenceEmail(m.email || ""); setReferencePhone(m.phone || ""); }
  }
  function selectSupplierCc(id) {
    setSupplierCcId(id);
    const p = staffWithEmail.find((x) => x.id === id);
    if (p) setSenderCcEmail(p.email || "");
  }

  async function handleFiles(fileList) {
    setAttachError("");
    const files = Array.from(fileList ?? []);
    if (files.length === 0) return;
    if (attachments.length + files.length > MAX_ATTACHMENTS) {
      setAttachError(`첨부파일은 최대 ${MAX_ATTACHMENTS}개까지 가능합니다.`);
      return;
    }
    const tooBig = files.find((f) => f.size > MAX_ATTACHMENT_MB * 1024 * 1024);
    if (tooBig) {
      setAttachError(`"${tooBig.name}" 파일이 ${MAX_ATTACHMENT_MB}MB를 초과합니다.`);
      return;
    }
    setUploading(true);
    try {
      const uploaded = [];
      for (const file of files) {
        const url = await uploadPhoto(file, `quotes/${quote.id}/attachments`);
        uploaded.push({ name: file.name, url });
      }
      setAttachments((prev) => [...prev, ...uploaded]);
    } catch (e) {
      setAttachError(`업로드 실패: ${e.message}`);
    }
    setUploading(false);
  }
  function removeAttachment(idx) {
    setAttachments((prev) => prev.filter((_, i) => i !== idx));
  }

  async function handleSend() {
    setSending(true);
    setResults(null);

    const supplierName = supplier?.name || null;
    const supplierPhone = supplier ? (supplier.phone || supplier.tel || null) : null;

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
        supplierName,
        supplierPhone,
        noticeMessage: noticeMessage || null,
        attachmentUrls: attachments,
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
      noticeMessage: noticeMessage || null,
      attachmentUrls: attachments,
    };
    if (res.results?.email?.ok) patch.emailSentAt = now;
    if (res.results?.kakao?.ok) patch.kakaoSentAt = now;
    if (newLogEntries.length) patch.sendLog = [...(quote.sendLog ?? []), ...newLogEntries];
    if (res.results?.email?.ok || res.results?.kakao?.ok) onSaved(patch);
  }

  const canSend = (sendEmail || sendKakao) && (!sendEmail || email) && (!sendKakao || phone);

  return (
    <Modal title={`${site?.name ?? quote.siteName} 견적 발송`} onClose={onClose} wide="xl">
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div className="border border-slate-200 rounded-xl p-3">
          <p className="text-xs font-bold text-slate-600 mb-2">공급자 정보</p>
          <div className="space-y-2 text-sm mb-3">
            <div><p className="text-xs text-slate-400">회사명</p><p className="font-semibold">{COMPANY.name}</p></div>
            <div><p className="text-xs text-slate-400">주소</p><p className="font-semibold">{COMPANY.address}</p></div>
          </div>
          <div className="mb-2">
            <p className="text-xs font-bold text-slate-500 mb-1">담당자</p>
            <select className={inputCls} value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
              <option value="">선택 안 함</option>
              {staffWithPhone.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div>
            <p className="text-xs font-bold text-slate-500 mb-1">참조(CC) 이메일 (선택)</p>
            <select className={`${inputCls} mb-1.5`} value={supplierCcId} onChange={(e) => selectSupplierCc(e.target.value)}>
              <option value="">직원 목록에서 선택</option>
              {staffWithEmail.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.email})</option>)}
            </select>
            <input className={inputCls} value={senderCcEmail} onChange={(e) => setSenderCcEmail(e.target.value)} placeholder="직접 입력도 가능" />
          </div>
        </div>

        <div className="border border-slate-200 rounded-xl p-3">
          <p className="text-xs font-bold text-slate-600 mb-2">고객 정보</p>
          <div className="mb-2">
            <p className="text-xs font-bold text-slate-500 mb-1">담당자(받는사람)</p>
            <select className={inputCls} value={customerManagerId} onChange={(e) => selectCustomerManager(e.target.value)}>
              <option value="">선택 안 함</option>
              {(siteManagers ?? []).map((m) => <option key={m.id} value={m.id}>{m.name}{m.isPrimary ? " (대표)" : ""}</option>)}
            </select>
          </div>
          <div className="space-y-2 mb-3">
            <div>
              <p className="text-xs font-bold text-slate-500 mb-1">받는사람 이메일</p>
              <input className={inputCls} value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div>
              <p className="text-xs font-bold text-slate-500 mb-1">받는사람 전화번호</p>
              <input className={inputCls} value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
          </div>
          <div>
            <p className="text-xs font-bold text-slate-500 mb-1">참조인 (선택)</p>
            <select className={`${inputCls} mb-1.5`} value={customerCcId} onChange={(e) => selectCustomerCc(e.target.value)}>
              <option value="">현장담당자 목록에서 선택</option>
              {otherManagers.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
            <input className={`${inputCls} mb-1.5`} value={referenceEmail} onChange={(e) => setReferenceEmail(e.target.value)} placeholder="참조인 이메일 (직접 입력 가능)" />
            <input className={inputCls} value={referencePhone} onChange={(e) => setReferencePhone(e.target.value)} placeholder="참조인 전화번호 (직접 입력 가능)" />
          </div>
        </div>
      </div>

      <div className="mb-4">
        <p className="text-xs font-bold text-slate-500 mb-1">안내메시지 (선택, 이메일 본문에만 반영)</p>
        <textarea
          className={`${inputCls} min-h-20`}
          value={noticeMessage}
          onChange={(e) => setNoticeMessage(e.target.value)}
          placeholder="이메일 본문 서명 아래에 추가로 들어갈 안내 문구를 입력하세요."
        />
      </div>

      <div className="mb-4">
        <p className="text-xs font-bold text-slate-500 mb-1">첨부파일 (선택, 이메일에만 첨부됨 — 최대 {MAX_ATTACHMENTS}개, 파일당 {MAX_ATTACHMENT_MB}MB)</p>
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); handleFiles(e.dataTransfer.files); }}
          onClick={() => fileInputRef.current?.click()}
          className="border-2 border-dashed border-slate-300 rounded-xl p-4 text-center text-xs text-slate-400 cursor-pointer hover:border-blue-400"
        >
          {uploading ? "업로드 중..." : "파일을 끌어다 놓거나 클릭해서 선택하세요"}
        </div>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => { handleFiles(e.target.files); e.target.value = ""; }}
        />
        {attachError && <p className="text-xs text-red-600 mt-1">{attachError}</p>}
        {attachments.length > 0 && (
          <ul className="mt-2 space-y-1">
            {attachments.map((att, idx) => (
              <li key={idx} className="flex items-center justify-between text-xs bg-slate-50 rounded-lg px-2.5 py-1.5">
                <span className="truncate">{att.name}</span>
                <button type="button" onClick={() => removeAttachment(idx)} className="text-red-400 hover:text-red-600 ml-2 shrink-0">삭제</button>
              </li>
            ))}
          </ul>
        )}
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
