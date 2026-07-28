# 견적 발송 안내메시지/첨부파일 (3단계) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 견적 발송 모달에 안내메시지(이메일 본문에 추가로 들어감)와 첨부파일(드래그드롭,
이메일에 실제 첨부)을 추가한다.

**Architecture:** Task 1은 DB 컬럼 추가 + `lib/email.js`/`lib/mappers.js`/
`app/api/send-quote/route.js` 배관만 바꾼다(안내메시지를 본문에 붙이고, 첨부파일 URL 목록을
받아 실제 이메일 첨부로 붙임). Task 2는 `QuoteSendModal.jsx`에 안내메시지 입력란과
드래그드롭 첨부 UI를 추가하고 Task 1이 만든 필드를 채워서 보낸다. 카카오 알림톡은 이번에도
건드리지 않는다(승인된 템플릿 고정 텍스트 제약, `docs/HANDOFF.md`에 재승인 대기 항목 등록됨).

**Tech Stack:** React 19, nodemailer(`lib/email.js`), 기존 `lib/photos.js`의
`uploadPhoto(file, folder)`(Supabase Storage, 이미지 전용 아님) 재사용 — 새 라이브러리 없음.

## Global Constraints

- 안내메시지는 **이메일에만** 반영한다. `sendQuoteAlimtalk` 호출에는 절대 전달하지 않는다
  (승인된 알리고 템플릿이 고정 텍스트라 변경하면 발송이 거부됨).
- 첨부파일은 최대 10개, 파일당 25MB — 초과분은 업로드하지 않고 안내 문구를 보여준다.
- 리치텍스트 서식 없음 — 안내메시지는 일반 `<textarea>`(줄바꿈만 `<br>`로 변환).
- 드래그드롭은 네이티브 HTML5 이벤트로 구현 — 새 라이브러리 추가 금지.
- PDF 견적서 양식(`lib/quotePdf.js`)은 건드리지 않는다.
- `npm run build` 통과 필수.

---

### Task 1: DB 컬럼 + 매퍼 + 이메일 본문/첨부 배관

**Files:**
- Create: `supabase/migrations/073_quote_send_notice_attachments_DRAFT.sql`
- Modify: `lib/mappers.js`
- Modify: `lib/email.js`
- Modify: `app/api/send-quote/route.js`

**Interfaces:**
- Consumes: 없음 (독립 기반 작업)
- Produces:
  - `mapQuoteRequest(row)`가 `noticeMessage`/`attachmentUrls`(`{ name, url }[]`, 기본 `[]`)
    필드를 반환 (Task 2가 읽음)
  - `sendQuoteEmail({ to, cc, quote, pdfUrl, supplierName, supplierPhone, noticeMessage,
    attachmentUrls })` — 두 필드 추가
  - `/api/send-quote` POST 바디에 최상위 `noticeMessage`/`attachmentUrls` 필드 추가 지원
    (Task 2가 채워서 보낸다)

- [ ] **Step 1: 마이그레이션 파일 작성**

`supabase/migrations/073_quote_send_notice_attachments_DRAFT.sql` 생성:

```sql
-- 073: 견적 발송 안내메시지/첨부파일 (2026-07-28)
-- 안내메시지는 이메일 본문에만 반영(카카오는 승인된 템플릿 고정 텍스트라 반영 못 함 —
-- docs/HANDOFF.md에 템플릿 재승인 대기 항목 있음). 첨부파일은 { name, url } 객체 배열.
alter table public.quote_requests add column if not exists notice_message text;
alter table public.quote_requests add column if not exists attachment_urls jsonb not null default '[]'::jsonb;

-- 검증
select column_name from information_schema.columns
where table_schema = 'public' and table_name = 'quote_requests'
  and column_name in ('notice_message', 'attachment_urls')
order by column_name;
```

- [ ] **Step 2: 마이그레이션 실행 요청**

이 저장소는 마이그레이션 도구가 없다 — 컨트롤러(세션 진행자)가 이 스텝에서 위 SQL을
사용자에게 전달해 Supabase 대시보드 SQL Editor에서 실행을 요청한다. Task 2의 실사용 검증
전에 완료되어야 한다.

- [ ] **Step 3: `mapQuoteRequest`에 필드 추가**

`lib/mappers.js`에서 `mapQuoteRequest` 함수의 기존 마지막 필드들(예:
`sendLog: row.send_log ?? [],`) 바로 뒤에 추가:

```js
    noticeMessage: row.notice_message,
    attachmentUrls: row.attachment_urls ?? [],
```

(정확한 위치: `senderCcEmail`/`referenceEmail`/`referencePhone`/`sendLog` 필드들이 이미
있는 블록의 끝, 마지막 `};` 바로 앞.)

- [ ] **Step 4: `lib/email.js`에 안내메시지/첨부파일 반영**

기존:

```js
function buildBody(quote, supplierName, supplierPhone) {
  const contact = supplierName && supplierPhone ? `${supplierName}(${supplierPhone})` : "신석주 차장(010-2939-2431)";
  return `안녕하세요, ${quote.siteName ?? ""} 승강기 담당자/대표님.
안전하고 원활한 승강기 운행을 위해 부품 교체 견적서를 보내드립니다.

■ 견적명: ${quote.quoteTitle ?? ""}
■ 견적일: ${quote.quoteDate ?? ""}

첨부된 PDF 파일에서 견적서를 확인해주세요.
확인 후 승인(회신)해 주시면 부품 수급 및 일정을 조율하여 신속하고 안전하게 교체 공사를 진행하겠습니다.

늘 안전을 최우선으로 꼼꼼하게 관리하겠습니다. 감사합니다.

견적 담당: ${contact}`;
}
```

다음으로 교체:

```js
function buildBody(quote, supplierName, supplierPhone, noticeMessage) {
  const contact = supplierName && supplierPhone ? `${supplierName}(${supplierPhone})` : "신석주 차장(010-2939-2431)";
  const notice = noticeMessage ? `\n\n${noticeMessage}` : "";
  return `안녕하세요, ${quote.siteName ?? ""} 승강기 담당자/대표님.
안전하고 원활한 승강기 운행을 위해 부품 교체 견적서를 보내드립니다.

■ 견적명: ${quote.quoteTitle ?? ""}
■ 견적일: ${quote.quoteDate ?? ""}

첨부된 PDF 파일에서 견적서를 확인해주세요.
확인 후 승인(회신)해 주시면 부품 수급 및 일정을 조율하여 신속하고 안전하게 교체 공사를 진행하겠습니다.

늘 안전을 최우선으로 꼼꼼하게 관리하겠습니다. 감사합니다.

견적 담당: ${contact}${notice}`;
}
```

같은 파일의 기존:

```js
function buildHtml(quote, hasCard, supplierName, supplierPhone) {
  const bodyHtml = buildBody(quote, supplierName, supplierPhone).replace(/\n/g, "<br>");
```

다음으로 교체:

```js
function buildHtml(quote, hasCard, supplierName, supplierPhone, noticeMessage) {
  const bodyHtml = buildBody(quote, supplierName, supplierPhone, noticeMessage).replace(/\n/g, "<br>");
```

같은 파일의 기존:

```js
export async function sendQuoteEmail({ to, cc, quote, pdfUrl, supplierName, supplierPhone }) {
```

다음으로 교체:

```js
export async function sendQuoteEmail({ to, cc, quote, pdfUrl, supplierName, supplierPhone, noticeMessage, attachmentUrls }) {
```

같은 함수 안의 기존:

```js
  const attachments = [{ filename: pdfFilename(quote), content: pdfBuffer }];
  if (hasCard) {
    attachments.push({
      filename: "guil-card.jpg",
      content: fs.readFileSync(cardPath),
      cid: "guilcard",
      contentDisposition: "inline",
    });
  }
```

다음으로 교체(끝에 첨부파일 추가 루프):

```js
  const attachments = [{ filename: pdfFilename(quote), content: pdfBuffer }];
  if (hasCard) {
    attachments.push({
      filename: "guil-card.jpg",
      content: fs.readFileSync(cardPath),
      cid: "guilcard",
      contentDisposition: "inline",
    });
  }
  for (const att of attachmentUrls ?? []) {
    const attRes = await fetch(att.url);
    if (attRes.ok) {
      attachments.push({ filename: att.name, content: Buffer.from(await attRes.arrayBuffer()) });
    }
  }
```

같은 함수 안의 기존:

```js
    text: buildBody(quote, supplierName, supplierPhone),
    html: buildHtml(quote, hasCard, supplierName, supplierPhone),
```

다음으로 교체:

```js
    text: buildBody(quote, supplierName, supplierPhone, noticeMessage),
    html: buildHtml(quote, hasCard, supplierName, supplierPhone, noticeMessage),
```

- [ ] **Step 5: `/api/send-quote`가 `noticeMessage`/`attachmentUrls`를 받아 전달**

`app/api/send-quote/route.js`의 기존:

```js
  const {
    quoteRequestId, channels, recipientEmail, recipientPhone,
    senderCcEmail, referenceEmail, referencePhone, quote,
    supplierName, supplierPhone,
  } = body;
```

다음으로 교체:

```js
  const {
    quoteRequestId, channels, recipientEmail, recipientPhone,
    senderCcEmail, referenceEmail, referencePhone, quote,
    supplierName, supplierPhone, noticeMessage, attachmentUrls,
  } = body;
```

같은 파일의 기존:

```js
  const patch = {
    recipient_email: recipientEmail || null,
    recipient_phone: recipientPhone || null,
    sender_cc_email: senderCcEmail || null,
    reference_email: referenceEmail || null,
    reference_phone: referencePhone || null,
  };
```

다음으로 교체:

```js
  const patch = {
    recipient_email: recipientEmail || null,
    recipient_phone: recipientPhone || null,
    sender_cc_email: senderCcEmail || null,
    reference_email: referenceEmail || null,
    reference_phone: referencePhone || null,
    notice_message: noticeMessage || null,
    attachment_urls: attachmentUrls && attachmentUrls.length ? attachmentUrls : [],
  };
```

같은 파일의 기존(이메일 발송 호출부):

```js
      await sendQuoteEmail({ to: recipientEmail, cc, quote, pdfUrl: quote?.pdfUrl, supplierName, supplierPhone });
```

다음으로 교체:

```js
      await sendQuoteEmail({ to: recipientEmail, cc, quote, pdfUrl: quote?.pdfUrl, supplierName, supplierPhone, noticeMessage, attachmentUrls });
```

**카카오 호출 2곳(주 수신인, 참조인)은 이 스텝에서 손대지 않는다** — `noticeMessage`/
`attachmentUrls`를 전달하지 않는다(Global Constraints 참고).

- [ ] **Step 6: 빌드 확인**

Run: `npm run build`
Expected: 에러 없이 성공.

- [ ] **Step 7: 안내메시지/첨부파일 실사용 검증 (비용 없음 — 직접 함수 호출)**

`elevator-field-app` 디렉터리에서 실행(실재하는 공개 PDF/이미지 URL을 첨부파일 테스트용으로
사용):

```bash
node --env-file=.env.local -e "
import('./lib/email.js').then(async ({ sendQuoteEmail }) => {
  await sendQuoteEmail({
    to: process.env.NAVER_SMTP_USER,
    quote: { siteName: '테스트', quoteTitle: '3단계테스트', quoteDate: '2026-07-28' },
    pdfUrl: 'https://raw.githubusercontent.com/mozilla/pdf.js/master/test/pdfs/basicapi.pdf',
    noticeMessage: '안내메시지 테스트 문구입니다.\n두번째 줄도 확인.',
    attachmentUrls: [{ name: 'test-attachment.pdf', url: 'https://raw.githubusercontent.com/mozilla/pdf.js/master/test/pdfs/basicapi.pdf' }],
  });
  console.log('발송 OK — 받은 메일에 안내메시지 문구와 test-attachment.pdf 첨부파일이 있는지 확인');
}).catch((e) => { console.error('FAILED', e.message); process.exit(1); });
"
```

Expected: `발송 OK...` 출력, 예외 없음. 실제 수신 메일함(guil2020@naver.com)에서 본문에
안내메시지 두 줄이 보이고, 첨부파일 목록에 PDF 견적서 외에 `test-attachment.pdf`가 하나 더
있는지 확인.

- [ ] **Step 8: 커밋**

```bash
git add supabase/migrations/073_quote_send_notice_attachments_DRAFT.sql lib/mappers.js lib/email.js app/api/send-quote/route.js
git commit -m "feat: 견적 발송 이메일에 안내메시지·첨부파일 반영 (카카오 미반영, 템플릿 재승인 대기)"
```

---

### Task 2: `QuoteSendModal.jsx` — 안내메시지 입력 + 첨부파일 드래그드롭

**Files:**
- Modify: `app/components/admin/QuoteSendModal.jsx`

**Interfaces:**
- Consumes: Task 1의 `sendQuoteEmail`/`/api/send-quote`가 받는 `noticeMessage`/
  `attachmentUrls` 계약, `lib/photos.js`의 `uploadPhoto(file, folder)`(기존 함수, 변경 없음)
- Produces: 없음 (이 작업이 마지막 — `QuoteSendModal`을 부르는 곳은 `MaterialsAdmin.jsx`
  한 곳뿐이고 이번엔 호출부 변경 없음)

- [ ] **Step 1: import 추가 + 새 state**

`app/components/admin/QuoteSendModal.jsx`의 기존:

```jsx
import { useState } from "react";
import { Modal, inputCls } from "@/app/components/admin/adminShared";
import { COMPANY } from "@/lib/company";
```

다음으로 교체:

```jsx
import { useState, useRef } from "react";
import { Modal, inputCls } from "@/app/components/admin/adminShared";
import { COMPANY } from "@/lib/company";
import { uploadPhoto } from "@/lib/photos";

const MAX_ATTACHMENTS = 10;
const MAX_ATTACHMENT_MB = 25;
```

같은 파일의 기존:

```jsx
  const [sendEmail, setSendEmail] = useState(true);
  const [sendKakao, setSendKakao] = useState(true);
  const [sending, setSending] = useState(false);
  const [results, setResults] = useState(null);
```

다음으로 교체:

```jsx
  const [sendEmail, setSendEmail] = useState(true);
  const [sendKakao, setSendKakao] = useState(true);
  const [sending, setSending] = useState(false);
  const [results, setResults] = useState(null);
  const [noticeMessage, setNoticeMessage] = useState("");
  const [attachments, setAttachments] = useState([]); // { name, url }[]
  const [uploading, setUploading] = useState(false);
  const [attachError, setAttachError] = useState("");
  const fileInputRef = useRef(null);
```

- [ ] **Step 2: 파일 업로드 처리 함수 추가**

`selectSupplierCc` 함수 바로 뒤에 추가:

```jsx
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
```

- [ ] **Step 3: `handleSend`에 안내메시지/첨부파일 실어 보내기**

기존:

```jsx
        senderCcEmail: senderCcEmail || null,
        referenceEmail: referenceEmail || null,
        referencePhone: referencePhone || null,
        supplierName,
        supplierPhone,
        quote: {
```

다음으로 교체:

```jsx
        senderCcEmail: senderCcEmail || null,
        referenceEmail: referenceEmail || null,
        referencePhone: referencePhone || null,
        supplierName,
        supplierPhone,
        noticeMessage: noticeMessage || null,
        attachmentUrls: attachments,
        quote: {
```

같은 함수의 기존:

```jsx
    const patch = {
      recipientEmail: email,
      recipientPhone: phone,
      senderCcEmail: senderCcEmail || null,
      referenceEmail: referenceEmail || null,
      referencePhone: referencePhone || null,
    };
```

다음으로 교체:

```jsx
    const patch = {
      recipientEmail: email,
      recipientPhone: phone,
      senderCcEmail: senderCcEmail || null,
      referenceEmail: referenceEmail || null,
      referencePhone: referencePhone || null,
      noticeMessage: noticeMessage || null,
      attachmentUrls: attachments,
    };
```

- [ ] **Step 4: 안내메시지 + 첨부파일 UI 추가**

두 채널 체크박스 블록과 발송결과 블록 사이(현재 카드 2단 레이아웃 `</div>` 바로 뒤, 채널
체크박스 `<div className="flex gap-4 mb-4">` 바로 앞)에 새 섹션을 추가한다. 기존:

```jsx
      </div>

      <div className="flex gap-4 mb-4">
        <label className="flex items-center gap-1.5 text-sm font-semibold text-slate-700">
          <input type="checkbox" checked={sendEmail} onChange={(e) => setSendEmail(e.target.checked)} />
          이메일
        </label>
```

다음으로 교체:

```jsx
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
```

- [ ] **Step 5: 빌드 확인**

Run: `npm run build`
Expected: 에러 없이 성공.

- [ ] **Step 6: 브라우저 실사용 검증 (디스포저블 테스트 견적 사용)**

`npm run dev` 후 `/admin` → 자재·견적 신청내역 → 실제 현장으로 "+ 새 견적 발행" → 최소 1개
품목 입력 후 "발행 확정" → 그 행의 "발송" 버튼 클릭:

1. 안내메시지 텍스트박스에 여러 줄 문구를 입력.
2. 아무 이미지 파일 하나를 첨부 영역에 드래그하거나 클릭해서 선택 → 업로드 후 목록에
   파일명이 뜨는지 확인. "삭제" 버튼으로 제거되는지도 확인 후 다시 첨부.
3. 카카오 체크박스 해제, 받는사람 이메일을 `guil2020@naver.com`으로 바꾼 뒤 발송.
4. 실제 수신 메일에서 안내메시지 문구가 서명 아래 보이고, 방금 첨부한 파일이 견적서 PDF와
   함께 첨부파일 목록에 있는지 확인.
5. 테스트에 사용한 디스포저블 견적 행은 REST DELETE로 정리한다.

- [ ] **Step 7: 커밋**

```bash
git add app/components/admin/QuoteSendModal.jsx
git commit -m "feat: 견적 발송 모달에 안내메시지 입력·첨부파일 드래그드롭 추가"
```
