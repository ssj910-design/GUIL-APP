"use client";

// 견적 발송 관련 폼 상태(공급자/고객 정보, 안내메시지, 첨부파일)를 QuoteSendModal.jsx에서
// 뽑아낸 공유 파일 — QuoteItemsModal(발행+바로 발송하기)과 QuoteSendModal(재발송) 양쪽에서
// 재사용한다. 상태는 훅을 호출한 부모가 소유한다: useQuoteRecipientFields가 상태를 만들어
// 반환하고, QuoteRecipientInfo/QuoteRecipientExtras는 그 값을 props로 받아 렌더링만 하는
// 순수 컴포넌트다. 발송 채널(이메일/카카오)은 모바일 관리자 화면과 동일하게 사람이 따로
// 고르지 않고 받는사람 이메일/전화번호가 채워져 있는지로 자동 결정한다(sendEmail/sendKakao).
import { useRef, useState } from "react";
import { inputCls } from "@/app/components/admin/adminShared";
import { COMPANY } from "@/lib/company";
import { uploadPhoto } from "@/lib/photos";

const MAX_ATTACHMENTS = 10;
const MAX_ATTACHMENT_MB = 25;

export function useQuoteRecipientFields(quote, siteManagers, profiles) {
  const primaryManager = (siteManagers ?? []).find((m) => m.isPrimary) ?? (siteManagers ?? [])[0];
  const [email, setEmail] = useState(quote.recipientEmail || primaryManager?.email || "");
  const [phone, setPhone] = useState(quote.recipientPhone || primaryManager?.phone || "");
  const [referenceEmail, setReferenceEmail] = useState(quote.referenceEmail || "");
  const [referencePhone, setReferencePhone] = useState(quote.referencePhone || "");
  const [noticeMessage, setNoticeMessage] = useState(quote.noticeMessage || "");
  const [attachments, setAttachments] = useState(quote.attachmentUrls ?? []); // { name, url }[]
  const [uploading, setUploading] = useState(false);
  const [attachError, setAttachError] = useState("");

  const activeStaff = (profiles ?? []).filter((p) => p.is_active !== false && !p.deleted_at);
  const staffByName = [...activeStaff].sort((a, b) => (a.name ?? "").localeCompare(b.name ?? "", "ko"));
  const staffWithEmail = staffByName.filter((p) => p.email);
  // 전화번호 없는 직원을 고르면 서명이 그 사람이 아니라 폴백(신석주)으로 조용히 바뀌어
  // 드롭다운 표시와 실제 서명이 어긋난다 — 그 상황 자체를 만들지 않도록 후보를 좁힌다.
  const staffWithPhone = staffByName.filter((p) => p.phone || p.tel);
  const defaultSupplier = staffByName.find((p) => p.name === "신석주" && p.phone) ?? null;
  const defaultSupplierCc = staffWithEmail.find((p) => p.name === "신민호") ?? null;

  const [supplierId, setSupplierId] = useState(defaultSupplier?.id ?? "");
  // 공급자쪽 참조는 직원 목록에서만 고른다(직접입력 없음) — 초기값도 항상 그 직원의
  // 실제 이메일이어야 드롭다운과 아래 읽기전용 이메일 표시가 어긋나지 않는다.
  const [senderCcEmail, setSenderCcEmail] = useState(quote.senderCcEmail || defaultSupplierCc?.email || "");
  // 이미 저장된 수신자·참조인 정보(recipientEmail/Phone, referenceEmail/Phone, senderCcEmail)가
  // 있으면 그 값과 일치하는 담당자를 찾아 드롭다운도 실제 저장값과 맞춘다 — 안 그러면 이미
  // 저장돼 있는 담당자를 다시 열었을 때 드롭다운이 대표 담당자로 되돌아가 보인다.
  const matchedManager = (siteManagers ?? []).find(
    (m) => (quote.recipientEmail && m.email === quote.recipientEmail) || (quote.recipientPhone && m.phone === quote.recipientPhone)
  );
  const matchedCc = (siteManagers ?? []).find(
    (m) => (quote.referenceEmail && m.email === quote.referenceEmail) || (quote.referencePhone && m.phone === quote.referencePhone)
  );
  const matchedSupplierCc = staffWithEmail.find((p) => quote.senderCcEmail && p.email === quote.senderCcEmail);
  const [supplierCcId, setSupplierCcId] = useState(matchedSupplierCc?.id ?? defaultSupplierCc?.id ?? "");
  const [customerManagerId, setCustomerManagerId] = useState(
    (quote.recipientEmail || quote.recipientPhone) ? (matchedManager?.id ?? "") : (primaryManager?.id ?? "")
  );
  const [customerCcId, setCustomerCcId] = useState(matchedCc?.id ?? "");

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

  // 모바일 관리자 화면과 동일한 규칙 — 채널을 따로 고르지 않고 받는사람 이메일/전화번호가
  // 채워져 있으면 그 채널로 자동 발송한다(둘 다 채워져 있으면 둘 다).
  const sendEmail = !!email.trim();
  const sendKakao = !!phone.trim();
  const canSend = !uploading && (sendEmail || sendKakao);

  return {
    email, setEmail, phone, setPhone,
    senderCcEmail, setSenderCcEmail,
    referenceEmail, setReferenceEmail,
    referencePhone, setReferencePhone,
    sendEmail, sendKakao,
    noticeMessage, setNoticeMessage,
    attachments, uploading, attachError,
    supplierId, setSupplierId, supplierCcId,
    customerManagerId, customerCcId,
    staffWithEmail, staffWithPhone,
    supplier, otherManagers,
    selectCustomerManager, selectCustomerCc, selectSupplierCc,
    handleFiles, removeAttachment,
    canSend,
  };
}

export function QuoteRecipientInfo({ rf, siteManagers }) {
  return (
    <div className="grid grid-cols-2 gap-4 mb-4">
      <div className="border border-slate-200 rounded-xl p-3">
        <p className="text-xs font-bold text-slate-600 mb-2">공급자 정보</p>
        <div className="space-y-2 text-sm mb-3">
          <div><p className="text-xs text-slate-400">회사명</p><p className="font-semibold">{COMPANY.name}</p></div>
          <div><p className="text-xs text-slate-400">주소</p><p className="font-semibold">{COMPANY.address}</p></div>
        </div>
        <div className="mb-2">
          <p className="text-xs font-bold text-slate-500 mb-1">담당자</p>
          <select className={inputCls} value={rf.supplierId} onChange={(e) => rf.setSupplierId(e.target.value)}>
            <option value="">선택 안 함</option>
            {rf.staffWithPhone.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <div>
          <p className="text-xs font-bold text-slate-500 mb-1">참조</p>
          <select className={`${inputCls} mb-1.5`} value={rf.supplierCcId} onChange={(e) => rf.selectSupplierCc(e.target.value)}>
            <option value="">선택 안 함</option>
            {rf.staffWithEmail.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <input className={`${inputCls} bg-slate-100 text-slate-500`} value={rf.senderCcEmail} readOnly disabled />
        </div>
      </div>

      <div className="border border-slate-200 rounded-xl p-3">
        <p className="text-xs font-bold text-slate-600 mb-2">고객 정보</p>
        <div className="mb-2">
          <p className="text-xs font-bold text-slate-500 mb-1">담당자(받는사람)</p>
          <select className={inputCls} value={rf.customerManagerId} onChange={(e) => rf.selectCustomerManager(e.target.value)}>
            <option value="">선택 안 함</option>
            {(siteManagers ?? []).map((m) => <option key={m.id} value={m.id}>{m.name}{m.isPrimary ? " (대표)" : ""}</option>)}
          </select>
        </div>
        <div className="space-y-2 mb-3">
          <div>
            <p className="text-xs font-bold text-slate-500 mb-1">받는사람 이메일</p>
            <input className={inputCls} value={rf.email} onChange={(e) => rf.setEmail(e.target.value)} />
          </div>
          <div>
            <p className="text-xs font-bold text-slate-500 mb-1">받는사람 전화번호</p>
            <input className={inputCls} value={rf.phone} onChange={(e) => rf.setPhone(e.target.value)} />
          </div>
        </div>
        <div>
          <p className="text-xs font-bold text-slate-500 mb-1">참조</p>
          <select className={`${inputCls} mb-1.5`} value={rf.customerCcId} onChange={(e) => rf.selectCustomerCc(e.target.value)}>
            <option value="">현장담당자 목록에서 선택</option>
            {rf.otherManagers.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
          <input className={`${inputCls} mb-1.5`} value={rf.referenceEmail} onChange={(e) => rf.setReferenceEmail(e.target.value)} placeholder="참조인 이메일 (직접 입력 가능)" />
          <input className={inputCls} value={rf.referencePhone} onChange={(e) => rf.setReferencePhone(e.target.value)} placeholder="참조인 전화번호 (직접 입력 가능)" />
        </div>
      </div>
    </div>
  );
}

export function QuoteRecipientExtras({ rf }) {
  const fileInputRef = useRef(null);

  return (
    <>
      <div className="mb-4">
        <p className="text-xs font-bold text-slate-500 mb-1">특이사항/안내메시지 (선택, 이메일 본문 + 카카오 알림톡 특이사항 줄에 반영)</p>
        <textarea
          className={`${inputCls} min-h-20`}
          value={rf.noticeMessage}
          onChange={(e) => rf.setNoticeMessage(e.target.value)}
          placeholder="이메일 본문과 카카오 알림톡 특이사항 줄에 들어갈 안내 문구를 입력하세요."
        />
      </div>

      <div className="mb-4">
        <p className="text-xs font-bold text-slate-500 mb-1">첨부파일 (선택, 이메일에만 첨부됨 — 최대 {MAX_ATTACHMENTS}개, 파일당 {MAX_ATTACHMENT_MB}MB)</p>
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); rf.handleFiles(e.dataTransfer.files); }}
          onClick={() => fileInputRef.current?.click()}
          className="border-2 border-dashed border-slate-300 rounded-xl p-4 text-center text-xs text-slate-400 cursor-pointer hover:border-blue-400"
        >
          {rf.uploading ? "업로드 중..." : "파일을 끌어다 놓거나 클릭해서 선택하세요"}
        </div>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => { rf.handleFiles(e.target.files); e.target.value = ""; }}
        />
        {rf.attachError && <p className="text-xs text-red-600 mt-1">{rf.attachError}</p>}
        {rf.attachments.length > 0 && (
          <ul className="mt-2 space-y-1">
            {rf.attachments.map((att, idx) => (
              <li key={idx} className="flex items-center justify-between text-xs bg-slate-50 rounded-lg px-2.5 py-1.5">
                <span className="truncate">{att.name}</span>
                <button type="button" onClick={() => rf.removeAttachment(idx)} className="text-red-400 hover:text-red-600 ml-2 shrink-0">삭제</button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
