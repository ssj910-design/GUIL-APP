# 견적 발행+발송 통합 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 관리자 웹의 견적 품목편집(`QuoteItemsModal.jsx`, 발행)과 견적 발송
(`QuoteSendModal.jsx`, 발송)을 한 화면으로 합쳐서, "저장"(발행만)과 "바로 발송하기"
(발행+발송)를 한 모달에서 선택할 수 있게 한다.

**Architecture:** `QuoteSendModal.jsx`가 갖고 있던 공급자/고객 정보·안내메시지·첨부파일·
채널 체크박스 로직을 새 공유 파일 `QuoteRecipientFields.jsx`(훅 + 프레젠테이션
컴포넌트 2개)로 뽑아서, `QuoteItemsModal.jsx`(발행+바로 발송하기)와 `QuoteSendModal.jsx`
(재발송 전용으로 격하)가 함께 재사용한다.

**Tech Stack:** React 19, Next.js API Routes(`/api/generate-quote-pdf`,
`/api/send-quote`) — 새 의존성 없음.

## Global Constraints

- "저장" = 지금의 "발행 확정"과 완전히 동일 — PDF 생성+`quote_items` 등 저장, 상태
  `견적발행`. 발송 관련 필드(수신처/안내메시지/첨부파일/채널)는 채워져 있어도 이번엔
  전혀 서버로 보내지 않는다.
- "바로 발송하기" = PDF 생성·저장까지 저장과 동일하게 수행한 뒤, **방금 생성된 새
  `pdfUrl`**(오래된 `quote.quotePdfUrl`이 아님)로 `/api/send-quote`를 이어서 호출한다.
  채널 체크박스를 최소 하나 선택하고 해당 채널 수신처가 채워져야("canSend") 버튼이
  활성화된다.
- PDF 생성이 실패하면 아무것도 저장하지 않는다(기존 동작 유지). PDF 생성·저장은
  성공했는데 발송이 실패해도 발행(저장)은 롤백하지 않고, 채널별 성공/실패 메시지만
  보여준다.
- "재발송" 버튼(구 "발송")의 노출 조건은 바꾸지 않는다 — 지금처럼 `quotePdfUrl`이 있는
  `견적발행` 상태 행이면 항상 보인다. "이미 한 번 보낸 건에만 노출" 같은 새 게이팅 로직은
  추가하지 않는다.
- 스크린샷의 "사업자/개인" 고객유형 토글은 만들지 않는다.
- `lib/alimtalk.js`는 이번 작업과 무관하며 절대 수정하지 않는다.

---

### Task 1: `QuoteRecipientFields.jsx` 추출 + `QuoteSendModal.jsx` 재발송 전용으로 리팩터링

**Files:**
- Create: `app/components/admin/QuoteRecipientFields.jsx`
- Modify: `app/components/admin/QuoteSendModal.jsx` (전체 교체)
- Modify: `app/components/admin/MaterialsAdmin.jsx:447` (버튼 라벨만)

**Interfaces:**
- Produces:
  - `useQuoteRecipientFields(quote, siteManagers, profiles)` — 반환 객체:
    `{ email, setEmail, phone, setPhone, senderCcEmail, setSenderCcEmail,
    referenceEmail, setReferenceEmail, referencePhone, setReferencePhone,
    sendEmail, setSendEmail, sendKakao, setSendKakao, noticeMessage, setNoticeMessage,
    attachments, uploading, attachError, supplierId, setSupplierId, supplierCcId,
    customerManagerId, customerCcId, staffWithEmail, staffWithPhone, supplier,
    otherManagers, selectCustomerManager, selectCustomerCc, selectSupplierCc,
    handleFiles, removeAttachment, canSend }`.
  - `QuoteRecipientInfo({ rf, siteManagers })` — 공급자/고객 정보 2단 섹션만 렌더링.
  - `QuoteRecipientExtras({ rf })` — 안내메시지·첨부파일·채널 체크박스만 렌더링.
- Consumes(Task 2가 씀): 위 세 가지를 `QuoteItemsModal.jsx`에서 그대로 import해 쓴다.

- [ ] **Step 1: `QuoteRecipientFields.jsx` 신설**

```jsx
"use client";

// 견적 발송 관련 폼 상태(공급자/고객 정보, 안내메시지, 첨부파일, 채널 체크박스)를
// QuoteSendModal.jsx에서 뽑아낸 공유 파일 — QuoteItemsModal(발행+바로 발송하기)과
// QuoteSendModal(재발송) 양쪽에서 재사용한다. 상태는 훅을 호출한 부모가 소유한다:
// useQuoteRecipientFields가 상태를 만들어 반환하고, QuoteRecipientInfo/
// QuoteRecipientExtras는 그 값을 props로 받아 렌더링만 하는 순수 컴포넌트다.
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
  const [senderCcEmail, setSenderCcEmail] = useState("");
  const [referenceEmail, setReferenceEmail] = useState("");
  const [referencePhone, setReferencePhone] = useState("");
  const [sendEmail, setSendEmail] = useState(true);
  const [sendKakao, setSendKakao] = useState(true);
  const [noticeMessage, setNoticeMessage] = useState(quote.noticeMessage || "■ 특이사항: ");
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

  const canSend = !uploading && (sendEmail || sendKakao) && (!sendEmail || email) && (!sendKakao || phone);

  return {
    email, setEmail, phone, setPhone,
    senderCcEmail, setSenderCcEmail,
    referenceEmail, setReferenceEmail,
    referencePhone, setReferencePhone,
    sendEmail, setSendEmail, sendKakao, setSendKakao,
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
          <p className="text-xs font-bold text-slate-500 mb-1">참조(CC) 이메일 (선택)</p>
          <select className={`${inputCls} mb-1.5`} value={rf.supplierCcId} onChange={(e) => rf.selectSupplierCc(e.target.value)}>
            <option value="">직원 목록에서 선택</option>
            {rf.staffWithEmail.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.email})</option>)}
          </select>
          <input className={inputCls} value={rf.senderCcEmail} onChange={(e) => rf.setSenderCcEmail(e.target.value)} placeholder="직접 입력도 가능" />
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
          <p className="text-xs font-bold text-slate-500 mb-1">참조인 (선택)</p>
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
        <p className="text-xs font-bold text-slate-500 mb-1">안내메시지 (선택, 이메일 본문에만 반영)</p>
        <textarea
          className={`${inputCls} min-h-20`}
          value={rf.noticeMessage}
          onChange={(e) => rf.setNoticeMessage(e.target.value)}
          placeholder="이메일 본문 서명 아래에 추가로 들어갈 안내 문구를 입력하세요."
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

      <div className="flex gap-4 mb-4">
        <label className="flex items-center gap-1.5 text-sm font-semibold text-slate-700">
          <input type="checkbox" checked={rf.sendEmail} onChange={(e) => rf.setSendEmail(e.target.checked)} />
          이메일
        </label>
        <label className="flex items-center gap-1.5 text-sm font-semibold text-slate-700">
          <input type="checkbox" checked={rf.sendKakao} onChange={(e) => rf.setSendKakao(e.target.checked)} />
          카카오 알림톡
        </label>
      </div>
    </>
  );
}
```

- [ ] **Step 2: `QuoteSendModal.jsx` 전체 교체 (재발송 전용, 공유 컴포넌트 재사용)**

```jsx
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
```

- [ ] **Step 3: `MaterialsAdmin.jsx`의 "발송" 버튼 라벨을 "재발송"으로 변경**

`app/components/admin/MaterialsAdmin.jsx:446-448`의 현재 내용:

```jsx
                        <button onClick={(e) => { e.stopPropagation(); setSendTarget(q); }} className="text-xs font-bold text-green-700 bg-green-50 px-2.5 py-1.5 rounded-lg">
                          발송
                        </button>
```

아래로 교체(라벨만 변경, 노출 조건·onClick·className 그대로):

```jsx
                        <button onClick={(e) => { e.stopPropagation(); setSendTarget(q); }} className="text-xs font-bold text-green-700 bg-green-50 px-2.5 py-1.5 rounded-lg">
                          재발송
                        </button>
```

- [ ] **Step 4: 빌드 확인**

Run: `npm run build`
Expected: 에러 없이 성공.

- [ ] **Step 5: 브라우저 실사용 검증 — 재발송이 리팩터링 전과 동일하게 동작하는지**

`npm run dev` 후 `/admin` → 자재·견적 신청내역 → 견적발행 상태에 `quotePdfUrl`이 있는 행의
"재발송" 버튼 클릭 → 모달이 "OO 견적 재발송" 타이틀로 열리고 공급자/고객 정보·안내메시지·
첨부파일·채널 체크박스가 이전과 동일하게 보이는지 확인.

**받는사람 이메일 입력칸에는 실제 고객 이메일이 프리필돼 있다 — 절대 그 상태로 발송하지
않는다.** 반드시 받는사람 이메일을 테스트 주소(`guil2020@naver.com`)로 직접 덮어쓴 뒤,
카카오 체크박스는 해제(실제 알림톡 발송 비용 발생하므로 절대 테스트하지 않음)하고 이메일
채널만 체크한 상태로 "재발송" 클릭 → 서버 응답 200과 이메일 채널 성공 메시지 확인. 테스트가
끝나면 이 견적 행을 새로고침(다시 열기)해서 받는사람 이메일이 원래 고객 값으로 남아있는지
확인한다 — 이번 재발송 테스트로 실제 DB의 `recipient_email`이 테스트 주소로 덮어써졌을
것이므로, REST로 원래 값(테스트 전 화면에서 확인해둔 값)으로 되돌려 놓는다.

- [ ] **Step 6: 커밋**

```bash
git add app/components/admin/QuoteRecipientFields.jsx app/components/admin/QuoteSendModal.jsx app/components/admin/MaterialsAdmin.jsx
git commit -m "refactor: 견적 발송 폼을 QuoteRecipientFields로 추출, 발송 버튼을 재발송으로 개명"
```

---

### Task 2: `QuoteItemsModal.jsx`에 발행+발송 통합 (저장 / 바로 발송하기)

**Files:**
- Modify: `app/components/admin/QuoteItemsModal.jsx` (전체 교체)
- Modify: `app/components/admin/MaterialsAdmin.jsx` (QuoteItemsModal 호출부 props/onSaved 변경)

**Interfaces:**
- Consumes: Task 1이 만든 `useQuoteRecipientFields`, `QuoteRecipientInfo`,
  `QuoteRecipientExtras` (정확한 시그니처는 Task 1 참고).
- Produces: 없음(최종 사용자 화면).

- [ ] **Step 1: `QuoteItemsModal.jsx` 전체 교체**

```jsx
"use client";

// 견적요청 품목편집+발행+발송 통합 화면 — 기사가 신청한 부품명/수량(원본, 읽기전용
// 참고)을 관리자가 세부 품목(자재비/인건비 구분·규격·단가 등)으로 확장하고, "저장"으로
// 발행만 하거나(PDF 생성만, 발송 안 함 — 나중에 검토 후 보내는 흐름) "바로 발송하기"로
// 발행과 발송을 한 번에 처리한다(설계:
// docs/superpowers/specs/2026-07-29-quote-issue-send-merge-design.md).
//
// 공급자/고객 정보·안내메시지·첨부파일·채널 체크박스는 QuoteRecipientFields.jsx를
// QuoteSendModal.jsx(재발송)과 공유한다. 재발송은 이미 있는 quotePdfUrl로 바로 보내지만,
// 여기 "바로 발송하기"는 먼저 PDF를 새로 생성한 뒤 그 pdfUrl로 발송한다 — 신규 발행
// 건은 아직 quotePdfUrl이 없기 때문.
//
// 품목 테이블의 공급가액/세액/합계 컬럼과 할인 정보 섹션은 화면 표시 전용이다 — 실제
// PDF(lib/quotePdf.js)와 저장 데이터(quote_items, transport_cost 등)는 그대로 두고
// 입력 화면만 청구스(chungoose.ai) 스타일에 맞춰 다듬은 것.
//
// 오른쪽 미리보기 카드는 실제 PDF 서식을 재현하지 않는 간단한 요약이다 — 새 계산 없이
// 이미 있는 값을 다시 보여줄 뿐이다.
import { useState, useEffect } from "react";
import { Plus, Trash2, ChevronUp, ChevronDown } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { TODAY_STR } from "@/lib/constants";
import { Modal, inputCls } from "@/app/components/admin/adminShared";
import { COMPANY } from "@/lib/company";
import { useQuoteRecipientFields, QuoteRecipientInfo, QuoteRecipientExtras } from "@/app/components/admin/QuoteRecipientFields";

const CATEGORIES = ["자재비", "인건비"];
const VAT_RATE = 0.1;

function emptyItem(category) {
  return { category, name: "", unitNo: "", spec: "", unit: "", qty: 1, unitPrice: 0 };
}

// 공급가액/세액/합계 — 품목 행과 운반비/안전관리비/이윤 고정행이 공유하는 계산식.
function rowCalc(qty, unitPrice) {
  const supply = Number(qty || 0) * Number(unitPrice || 0);
  const vat = Math.round(supply * VAT_RATE);
  return { supply, vat, total: supply + vat };
}

export default function QuoteItemsModal({ quote, site, siteManagers, profiles, onClose, onSaved }) {
  const [items, setItems] = useState(() => {
    if (quote.quoteItems?.length) return quote.quoteItems;
    // 처음 여는 경우 기사 원본(부품명+수량)을 자재비 1행에 프리필
    return quote.part ? [{ ...emptyItem("자재비"), name: quote.part, qty: quote.quantity || 1 }] : [];
  });
  const [recipientName, setRecipientName] = useState(quote.recipientName || "");
  const [quoteTitle, setQuoteTitle] = useState(quote.quoteTitle || quote.constructionType || "");
  const [quoteNumber, setQuoteNumber] = useState(quote.quoteNumber || "");
  const [quoteDate, setQuoteDate] = useState(quote.quoteIssuedDate || TODAY_STR);
  const [transportCost, setTransportCost] = useState(quote.transportCost || 0);
  const [safetyCost, setSafetyCost] = useState(quote.safetyCost || 0);
  const [profit, setProfit] = useState(quote.profit || 0);
  const [discountPercent, setDiscountPercent] = useState(0);
  const [discountAmount, setDiscountAmount] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [results, setResults] = useState(null);

  const rf = useQuoteRecipientFields(quote, siteManagers, profiles);

  useEffect(() => {
    if (quote.quoteNumber) return; // 이미 발행된 견적은 번호를 유지
    (async () => {
      // 견적번호 = 오늘날짜(YYYYMMDD) + "1" + 오늘 발행 순번. 예: 2026-07-27 4번째 발행 → 2026072714
      // ponytail: 동시에 두 명이 같은 순간 발행하면 번호가 겹칠 수 있음 — 발행 빈도가 낮은
      // 내부 관리툴이라 당장은 감수, 문제되면 DB 시퀀스/락으로 업그레이드.
      const { count } = await supabase
        .from("quote_requests")
        .select("id", { count: "exact", head: true })
        .eq("quote_issued_date", TODAY_STR);
      setQuoteNumber(`${TODAY_STR.replace(/-/g, "")}1${(count || 0) + 1}`);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function addItem(category) {
    setItems((prev) => [...prev, emptyItem(category)]);
  }
  function updateItem(idx, patch) {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  }
  function removeItem(idx) {
    setItems((prev) => prev.filter((_, i) => i !== idx));
  }
  // 같은 구분(자재비/인건비) 안에서만 위/아래로 순서를 바꾼다 — 구분을 넘나드는 이동은
  // PDF가 구분별로 섹션을 나눠 그리므로 지원하지 않는다.
  function moveItem(idx, direction) {
    setItems((prev) => {
      const category = prev[idx].category;
      const catIndices = prev.map((it, i) => (it.category === category ? i : -1)).filter((i) => i !== -1);
      const pos = catIndices.indexOf(idx);
      const swapPos = pos + direction;
      if (swapPos < 0 || swapPos >= catIndices.length) return prev;
      const swapIdx = catIndices[swapPos];
      const next = [...prev];
      [next[idx], next[swapIdx]] = [next[swapIdx], next[idx]];
      return next;
    });
  }

  const itemsSubtotal = items.reduce((s, it) => s + Number(it.qty || 0) * Number(it.unitPrice || 0), 0);
  const subtotal = itemsSubtotal + Number(transportCost || 0) + Number(safetyCost || 0) + Number(profit || 0);
  const grandTotal = Math.floor(subtotal / 1000) * 1000;
  const finalAmount = subtotal - discountAmount;

  // 오른쪽 미리보기 카드용 — 자재비/인건비 구분 없이 하나로 합치고, 운반비/안전관리비/이윤은
  // 값이 0보다 클 때만 같은 목록에 끼워 넣는다. 새 계산 없이 기존 값을 다시 나열만 함.
  // 구분(CATEGORIES) 순서로 정렬 — 왼쪽 폼·PDF(lib/quotePdf.js)와 같은 순서로 보여야
  // 발행 전 대조가 의미 있다. sort는 안정 정렬이라 같은 구분 내 순서는 보존된다.
  const previewRows = [
    ...[...items]
      .sort((a, b) => CATEGORIES.indexOf(a.category) - CATEGORIES.indexOf(b.category))
      .map((it) => ({
      name: it.name || "(품명 없음)",
      qty: Number(it.qty || 0),
      unitPrice: Number(it.unitPrice || 0),
      amount: Number(it.qty || 0) * Number(it.unitPrice || 0),
    })),
    ...[
      { name: "운반비", value: transportCost },
      { name: "안전관리비 및 기타", value: safetyCost },
      { name: "이윤", value: profit },
    ]
      .filter((x) => Number(x.value) > 0)
      .map((x) => ({ name: x.name, qty: 1, unitPrice: Number(x.value), amount: Number(x.value) })),
  ];

  // 할인율/할인금액은 서로의 값을 기준으로 자동 계산되는 화면 표시 전용 값 —
  // handleSave의 patch나 PDF/발송 요청 바디 어디에도 들어가지 않는다.
  function handleDiscountPercent(value) {
    const pct = Number(value) || 0;
    setDiscountPercent(pct);
    setDiscountAmount(Math.round((subtotal * pct) / 100));
  }
  function handleDiscountAmount(value) {
    const amt = Number(value) || 0;
    setDiscountAmount(amt);
    setDiscountPercent(subtotal > 0 ? Math.round((amt / subtotal) * 1000) / 10 : 0);
  }

  // alsoSend=false → "저장"(발행만). alsoSend=true → "바로 발송하기"(발행 후 이어서 발송).
  async function handleSave(alsoSend) {
    if (items.length === 0) return;
    setSaving(true);
    setError("");
    setResults(null);

    const patch = {
      quote_items: items,
      transport_cost: Number(transportCost) || 0,
      safety_cost: Number(safetyCost) || 0,
      profit: Number(profit) || 0,
      quote_number: quoteNumber || null,
      recipient_name: recipientName || null,
      quote_title: quoteTitle || null,
      quote_issued_date: quoteDate,
    };

    const pdfRes = await fetch("/api/generate-quote-pdf", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        quoteRequestId: quote.id,
        siteName: site?.name ?? quote.siteName,
        quoteNumber, recipientName, quoteTitle, quoteDate,
        items, transportCost, safetyCost, profit,
      }),
    }).then((r) => r.json()).catch((e) => ({ ok: false, reason: e.message }));

    if (!pdfRes.ok) {
      setError("PDF 생성 실패: " + pdfRes.reason);
      setSaving(false);
      return;
    }
    patch.quote_pdf_url = pdfRes.url;
    patch.status = "견적발행";

    const { error: dbError } = await supabase.from("quote_requests").update(patch).eq("id", quote.id);
    if (dbError) {
      setError("저장 실패: " + dbError.message);
      setSaving(false);
      return;
    }

    let sendPatch = {};
    if (alsoSend) {
      const supplierName = rf.supplier?.name || null;
      const supplierPhone = rf.supplier ? (rf.supplier.phone || rf.supplier.tel || null) : null;

      const sendRes = await fetch("/api/send-quote", {
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
            quoteTitle,
            quoteDate,
            pdfUrl: pdfRes.url,
          },
        }),
      })
        .then((r) => r.json())
        .catch((e) => ({ results: { email: { ok: false, reason: e.message }, kakao: { ok: false, reason: e.message } } }));

      setResults(sendRes.results ?? {});

      const now = new Date().toISOString();
      const newLogEntries = [];
      if (sendRes.results?.email?.ok) newLogEntries.push({ channel: "email", sentAt: now, target: rf.email });
      if (sendRes.results?.kakao?.ok) newLogEntries.push({ channel: "kakao", sentAt: now, target: rf.phone });

      sendPatch = {
        recipientEmail: rf.email,
        recipientPhone: rf.phone,
        senderCcEmail: rf.senderCcEmail || null,
        referenceEmail: rf.referenceEmail || null,
        referencePhone: rf.referencePhone || null,
        noticeMessage: rf.noticeMessage || null,
        attachmentUrls: rf.attachments,
      };
      if (sendRes.results?.email?.ok) sendPatch.emailSentAt = now;
      if (sendRes.results?.kakao?.ok) sendPatch.kakaoSentAt = now;
      if (newLogEntries.length) sendPatch.sendLog = [...(quote.sendLog ?? []), ...newLogEntries];
    }

    onSaved({
      quoteItems: items, transportCost: Number(transportCost) || 0, safetyCost: Number(safetyCost) || 0,
      profit: Number(profit) || 0, quoteNumber, recipientName, quoteTitle,
      quoteIssuedDate: quoteDate, quotePdfUrl: pdfRes.url, status: "견적발행",
      ...sendPatch,
    });
    setSaving(false);

    // "저장"만 눌렀을 땐 지금처럼 바로 닫는다. "바로 발송하기"는 채널별 발송 결과를
    // 화면에 보여줘야 하므로 자동으로 닫지 않는다 — 확인 후 "닫기"로 직접 닫는다.
    if (!alsoSend) onClose();
  }

  const saveDisabled = items.length === 0 || saving;
  const sendDisabled = saveDisabled || !rf.canSend;

  return (
    <Modal title={`${site?.name ?? quote.siteName} 견적 품목편집`} onClose={onClose} wide="2xl">
      <QuoteRecipientInfo rf={rf} siteManagers={siteManagers} />

      <div className="flex gap-4 mb-4">
        <div className="flex-1 min-w-0">
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 mb-4 text-sm">
            <p className="text-xs font-bold text-slate-500 mb-1">기사 요청 원본 (참고용)</p>
            <p className="font-semibold text-slate-700">{quote.part || quote.constructionType} · {quote.quantity ?? "-"}개</p>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            <div><p className="text-xs font-bold text-slate-500 mb-1">견적번호(No.)</p>
              <input className={inputCls} value={quoteNumber} onChange={(e) => setQuoteNumber(e.target.value)} /></div>
            <div><p className="text-xs font-bold text-slate-500 mb-1">수신자</p>
              <input className={inputCls} placeholder="OO 귀중" value={recipientName} onChange={(e) => setRecipientName(e.target.value)} /></div>
            <div className="col-span-2"><p className="text-xs font-bold text-slate-500 mb-1">견적명</p>
              <input className={inputCls} value={quoteTitle} onChange={(e) => setQuoteTitle(e.target.value)} /></div>
            <div><p className="text-xs font-bold text-slate-500 mb-1">견적일</p>
              <input type="date" className={inputCls} value={quoteDate} onChange={(e) => setQuoteDate(e.target.value)} /></div>
          </div>

          <div className="flex items-center gap-1.5 mb-1 text-[10px] font-bold text-slate-400 px-0.5">
            <span className="w-3.5 shrink-0"></span>
            <span className="flex-[11] min-w-0">품명</span>
            <span className="flex-[5] min-w-0">호기</span>
            <span className="flex-[20] min-w-0">규격</span>
            <span className="flex-[4] min-w-0">단위</span>
            <span className="flex-[5] min-w-0">수량</span>
            <span className="flex-[6] min-w-0 text-right">단가</span>
            <span className="w-3.5 shrink-0"></span>
          </div>

          {CATEGORIES.map((category) => (
            <div key={category} className="mb-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-bold text-slate-600">{category === "자재비" ? "1.자재비" : "2.인건비"}</p>
                <button onClick={() => addItem(category)} className="flex items-center gap-1 text-xs font-bold text-blue-700 border border-blue-200 rounded-lg px-2.5 py-1">
                  <Plus size={12} /> 품목 추가
                </button>
              </div>
              <div className="space-y-2">
                {items.map((it, idx) => {
                  if (it.category !== category) return null;
                  const catIndices = items.map((x, i) => (x.category === category ? i : -1)).filter((i) => i !== -1);
                  const pos = catIndices.indexOf(idx);
                  const { supply, vat, total } = rowCalc(it.qty, it.unitPrice);
                  return (
                    <div key={idx} className="space-y-1">
                      <div className="flex items-center gap-1.5">
                        <div className="w-3.5 shrink-0 flex flex-col">
                          <button type="button" onClick={() => moveItem(idx, -1)} disabled={pos === 0} className="text-slate-400 hover:text-slate-700 disabled:opacity-20">
                            <ChevronUp size={12} />
                          </button>
                          <button type="button" onClick={() => moveItem(idx, 1)} disabled={pos === catIndices.length - 1} className="text-slate-400 hover:text-slate-700 disabled:opacity-20">
                            <ChevronDown size={12} />
                          </button>
                        </div>
                        <div className="flex-[11] min-w-0">
                          <input className={inputCls} placeholder="품명" value={it.name} onChange={(e) => updateItem(idx, { name: e.target.value })} />
                        </div>
                        <div className="flex-[5] min-w-0">
                          <input className={inputCls} placeholder="호기" value={it.unitNo} onChange={(e) => updateItem(idx, { unitNo: e.target.value })} />
                        </div>
                        <div className="flex-[20] min-w-0">
                          <input className={inputCls} placeholder="규격" value={it.spec} onChange={(e) => updateItem(idx, { spec: e.target.value })} />
                        </div>
                        <div className="flex-[4] min-w-0">
                          <select className={inputCls} value={it.unit} onChange={(e) => updateItem(idx, { unit: e.target.value })}>
                            <option value="">단위</option>
                            <option value="EA">EA</option>
                            <option value="SET">SET</option>
                            <option value="식">식</option>
                          </select>
                        </div>
                        <div className="flex-[5] min-w-0">
                          <input type="number" className={inputCls} placeholder="수량" value={it.qty} onChange={(e) => updateItem(idx, { qty: e.target.value })} />
                        </div>
                        <div className="flex-[6] min-w-0">
                          <input type="number" className={inputCls} placeholder="단가" value={it.unitPrice} onChange={(e) => updateItem(idx, { unitPrice: e.target.value })} />
                        </div>
                        <button type="button" onClick={() => removeItem(idx)} className="w-3.5 shrink-0 text-red-400 hover:text-red-600 flex justify-center"><Trash2 size={14} /></button>
                      </div>
                      <div className="flex justify-end items-center gap-3 text-xs text-slate-500">
                        <span className="font-bold text-slate-400">소계</span>
                        <span>공급가액 <b className="text-slate-700 font-semibold">{supply.toLocaleString()}</b></span>
                        <span>세액 <b className="text-slate-700 font-semibold">{vat.toLocaleString()}</b></span>
                        <span>합계 <b className="text-slate-800 font-bold">{total.toLocaleString()}</b></span>
                      </div>
                    </div>
                  );
                })}
                {items.filter((it) => it.category === category).length === 0 && (
                  <p className="text-xs text-slate-300 text-center py-2">품목 없음</p>
                )}
              </div>
            </div>
          ))}

          <div className="mb-4 space-y-1.5">
            {[
              { label: "운반비", value: transportCost, setValue: setTransportCost },
              { label: "안전관리비 및 기타", value: safetyCost, setValue: setSafetyCost },
              { label: "이윤", value: profit, setValue: setProfit },
            ].map(({ label, value, setValue }) => {
              const { supply, vat, total } = rowCalc(1, value);
              return (
                <div key={label} className="space-y-1">
                  <div className="flex items-center gap-1.5">
                    <span className="w-3.5 shrink-0"></span>
                    <span className="flex-[11] min-w-0 text-xs font-semibold text-slate-600">{label}</span>
                    <span className="flex-[5] min-w-0"></span>
                    <span className="flex-[20] min-w-0"></span>
                    <span className="flex-[4] min-w-0"></span>
                    <span className="flex-[5] min-w-0 text-xs text-slate-400 text-center">1</span>
                    <div className="flex-[6] min-w-0">
                      <input type="number" className={inputCls} value={value} onChange={(e) => setValue(e.target.value)} />
                    </div>
                  </div>
                  <div className="flex justify-end items-center gap-3 text-xs text-slate-500">
                    <span className="font-bold text-slate-400">소계</span>
                    <span>공급가액 <b className="text-slate-700 font-semibold">{supply.toLocaleString()}</b></span>
                    <span>세액 <b className="text-slate-700 font-semibold">{vat.toLocaleString()}</b></span>
                    <span>합계 <b className="text-slate-800 font-bold">{total.toLocaleString()}</b></span>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 mb-4 text-sm space-y-1">
            <div className="flex justify-between"><span className="text-slate-500">소계</span><span className="font-semibold">{subtotal.toLocaleString()}원</span></div>
            <div className="flex justify-between font-bold"><span>합계(VAT별도, 천단위 절사)</span><span>{grandTotal.toLocaleString()}원</span></div>
          </div>

          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm">
            <p className="text-xs font-bold text-slate-500 mb-2">할인 정보 (화면 표시용 — 저장·PDF에는 반영되지 않습니다)</p>
            <div className="grid grid-cols-2 gap-3 mb-2">
              <div><p className="text-xs text-slate-500 mb-1">할인율(%)</p>
                <input type="number" className={inputCls} value={discountPercent} onChange={(e) => handleDiscountPercent(e.target.value)} /></div>
              <div><p className="text-xs text-slate-500 mb-1">할인금액(원)</p>
                <input type="number" className={inputCls} value={discountAmount} onChange={(e) => handleDiscountAmount(e.target.value)} /></div>
            </div>
            <div className="flex justify-between font-bold text-blue-700"><span>최종금액</span><span>{finalAmount.toLocaleString()}원</span></div>
          </div>
        </div>

        <div className="w-80 shrink-0">
          <div className="sticky top-0 border border-slate-200 rounded-xl p-4 bg-white">
            <p className="text-sm font-bold text-slate-800 mb-3 text-center">견적서 미리보기</p>
            <div className="text-xs text-slate-500 space-y-1 mb-3">
              <div className="flex justify-between"><span>공급자</span><span className="font-semibold text-slate-700">{COMPANY.name}</span></div>
              <div className="flex justify-between"><span>고객</span><span className="font-semibold text-slate-700">{site?.name ?? quote.siteName}</span></div>
              <div className="flex justify-between"><span>견적번호</span><span className="font-semibold text-slate-700">{quoteNumber || "-"}</span></div>
              <div className="flex justify-between"><span>견적일</span><span className="font-semibold text-slate-700">{quoteDate}</span></div>
            </div>
            <div className="border-t border-slate-100 pt-2 space-y-1 mb-3">
              {previewRows.length === 0 ? (
                <p className="text-xs text-slate-300 text-center py-2">품목 없음</p>
              ) : (
                previewRows.map((row, i) => (
                  <div key={i} className="flex justify-between text-xs gap-2">
                    <span className="text-slate-600 truncate">{row.name}</span>
                    <span className="text-slate-500 shrink-0 whitespace-nowrap">
                      {row.qty} × {row.unitPrice.toLocaleString()} = <b className="text-slate-800">{row.amount.toLocaleString()}</b>
                    </span>
                  </div>
                ))
              )}
            </div>
            <div className="border-t border-slate-100 pt-2 space-y-1 text-xs">
              <div className="flex justify-between"><span className="text-slate-500">소계</span><span className="font-semibold">{subtotal.toLocaleString()}원</span></div>
              <div className="flex justify-between font-bold"><span>합계(VAT별도)</span><span>{grandTotal.toLocaleString()}원</span></div>
              {discountAmount > 0 && (
                <div className="flex justify-between font-bold text-blue-700"><span>최종금액</span><span>{finalAmount.toLocaleString()}원</span></div>
              )}
            </div>
          </div>
        </div>
      </div>

      <QuoteRecipientExtras rf={rf} />

      {error && <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2 mb-3">{error}</p>}

      {results && (
        <div className="space-y-1.5 mb-3 text-sm">
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
        <button onClick={onClose} className="text-sm font-bold text-slate-500 border border-slate-200 rounded-xl px-4 py-2.5">닫기</button>
        <button
          onClick={() => handleSave(false)}
          disabled={saveDisabled}
          className="text-sm font-bold text-slate-700 bg-slate-100 disabled:bg-slate-50 disabled:text-slate-300 rounded-xl px-4 py-2.5"
        >
          {saving ? "저장 중..." : "저장"}
        </button>
        <button
          onClick={() => handleSave(true)}
          disabled={sendDisabled}
          className="text-sm font-bold text-white bg-blue-700 disabled:bg-slate-300 rounded-xl px-4 py-2.5"
        >
          {saving ? "처리 중..." : "바로 발송하기"}
        </button>
      </div>
    </Modal>
  );
}
```

- [ ] **Step 2: `MaterialsAdmin.jsx`의 `QuoteItemsModal` 호출부 수정**

`app/components/admin/MaterialsAdmin.jsx:518-541`의 현재 내용:

```jsx
      {itemsTarget && (
        <QuoteItemsModal
          quote={itemsTarget}
          site={(data.sites ?? []).find((s) => s.id === itemsTarget.siteId)}
          onClose={async () => {
            // 관리자가 새 견적 발행에서 현장만 고르고 품목편집을 취소하면, 기사 요청도 없이
            // 만들어진 빈 초안(요청접수 상태, 담당 기사 없음)만 남는다 — 그건 내역에 남기지 않고
            // 바로 삭제한다. 기사 요청건이나 이미 발행된 견적을 다시 열었다가 취소하는 경우는
            // (requesterId/engineer가 있거나 상태가 이미 넘어갔으므로) 이 조건에 안 걸려 그대로 둔다.
            if (itemsTarget.status === "요청접수" && !itemsTarget.requesterId && !itemsTarget.engineer) {
              await supabase.from("quote_requests").delete().eq("id", itemsTarget.id);
              setData((prev) => ({ ...prev, quoteRequests: prev.quoteRequests.filter((x) => x.id !== itemsTarget.id) }));
            }
            setItemsTarget(null);
          }}
          onSaved={(patch) => {
            setData((prev) => ({
              ...prev,
              quoteRequests: prev.quoteRequests.map((x) => (x.id === itemsTarget.id ? { ...x, ...patch } : x)),
            }));
            setItemsTarget(null);
          }}
        />
      )}
```

아래로 교체 — `siteManagers`/`profiles` props 추가, `onSaved`에서 `setItemsTarget(null)`
제거(모달이 "저장" 눌렀을 때만 스스로 `onClose()`를 호출해 닫도록 바뀌었으므로, 여기서
무조건 닫으면 "바로 발송하기"의 발송 결과 화면을 볼 수 없게 된다):

```jsx
      {itemsTarget && (
        <QuoteItemsModal
          quote={itemsTarget}
          site={(data.sites ?? []).find((s) => s.id === itemsTarget.siteId)}
          siteManagers={(data.siteManagers ?? []).filter((m) => m.siteId === itemsTarget.siteId)}
          profiles={data.profiles ?? []}
          onClose={async () => {
            // 관리자가 새 견적 발행에서 현장만 고르고 품목편집을 취소하면, 기사 요청도 없이
            // 만들어진 빈 초안(요청접수 상태, 담당 기사 없음)만 남는다 — 그건 내역에 남기지 않고
            // 바로 삭제한다. 기사 요청건이나 이미 발행된 견적을 다시 열었다가 취소하는 경우는
            // (requesterId/engineer가 있거나 상태가 이미 넘어갔으므로) 이 조건에 안 걸려 그대로 둔다.
            if (itemsTarget.status === "요청접수" && !itemsTarget.requesterId && !itemsTarget.engineer) {
              await supabase.from("quote_requests").delete().eq("id", itemsTarget.id);
              setData((prev) => ({ ...prev, quoteRequests: prev.quoteRequests.filter((x) => x.id !== itemsTarget.id) }));
            }
            setItemsTarget(null);
          }}
          onSaved={(patch) => {
            setData((prev) => ({
              ...prev,
              quoteRequests: prev.quoteRequests.map((x) => (x.id === itemsTarget.id ? { ...x, ...patch } : x)),
            }));
          }}
        />
      )}
```

- [ ] **Step 3: 빌드 확인**

Run: `npm run build`
Expected: 에러 없이 성공.

- [ ] **Step 4: 브라우저 실사용 검증 — 디스포저블 테스트 견적으로 저장/바로 발송하기 둘 다 확인**

`npm run dev` 후 `/admin` → 자재·견적 신청내역 → "+ 새 견적 발행" → 실제 현장 선택 →
새로 통합된 모달에서:

1. 상단에 공급자/고객 정보 2단 섹션이 보이는지, 담당자 드롭다운 선택 시 이메일/전화번호
   입력칸이 채워지는지 확인.
2. 품목을 1개 추가하고 수량·단가 입력 → 오른쪽 실시간 미리보기가 그대로 갱신되는지 확인
   (기존 4단계 기능 회귀 없는지).
3. 안내메시지·첨부파일·채널 체크박스가 품목 폼 아래에 보이는지 확인.
4. 카카오 체크박스를 **해제**하고 이메일만 체크한 뒤, 받는사람 이메일을 테스트 주소로
   채우고 "바로 발송하기" 클릭 → PDF 생성 성공 → 이어서 이메일 발송 성공 메시지가 뜨는지,
   모달이 자동으로 닫히지 않고 결과가 계속 보이는지 확인. 이후 "닫기"로 직접 닫는다.
5. 목록에서 방금 만든 행의 상태가 "견적발행"이고, 발행/발송 두 값 다 채워졌는지, PDF
   링크가 정상 열리는지 확인.
6. 별도로 새 디스포저블 견적을 하나 더 만들어 이번엔 채널 체크박스를 모두 해제한 채
   "저장"만 클릭 → PDF 생성/상태 변경은 되지만 모달이 즉시 닫히고 발송은 전혀 일어나지
   않았는지(이메일 미발송) 확인.
7. 두 테스트에 쓴 디스포저블 견적 행은 REST DELETE로 정리한다(Storage에 올라간 PDF/첨부
   파일은 기존 세션들처럼 anon-key 403으로 못 지울 수 있음 — 알려진 무해한 제약이라
   그대로 둔다).

- [ ] **Step 5: 커밋**

```bash
git add app/components/admin/QuoteItemsModal.jsx app/components/admin/MaterialsAdmin.jsx
git commit -m "feat: 견적 품목편집에 저장/바로 발송하기 통합 (발행+발송 청구스 스타일 병합)"
```
