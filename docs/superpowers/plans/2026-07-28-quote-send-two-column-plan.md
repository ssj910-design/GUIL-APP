# 견적 발송 공급자/고객 정보 2단 레이아웃 (2단계) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 견적 발송 모달(`QuoteSendModal.jsx`)을 공급자 정보/고객 정보 2단 레이아웃으로 바꾸고,
담당자를 드롭다운으로 고르면 기존 텍스트 입력이 채워지도록 하며, 공급측 담당자 선택은 실제
발송되는 이메일/카카오 서명에도 반영한다.

**Architecture:** Task 1은 서명 반영을 위한 백엔드 배관(`lib/email.js`, `lib/alimtalk.js`,
`app/api/send-quote/route.js`)만 바꾼다 — `supplierName`/`supplierPhone`을 받아 서명 줄에
반영, 없으면 기존 하드코딩 문구로 폴백. Task 2는 `QuoteSendModal.jsx`의 UI를 2단 레이아웃으로
바꾸고 Task 1이 만든 필드를 요청 바디에 실어 보낸다. 저장되는 `quote_requests` 데이터 형태는
바뀌지 않는다(발송 시 보내는 요청 바디에만 필드 추가).

**Tech Stack:** React 19, nodemailer(`lib/email.js`), 알리고 알림톡 API(`lib/alimtalk.js`).

## Global Constraints

- `profiles`/`siteManagers` 드롭다운은 편의상 텍스트 입력을 채워주는 선택기일 뿐이다 — 실제
  전송에 쓰이는 값은 항상 기존 텍스트 입력(`email`, `phone`, `senderCcEmail`,
  `referenceEmail`, `referencePhone`) 상태다. 드롭다운 자체를 전송 데이터로 직접 쓰지 않는다.
- `profiles` 드롭다운(담당자·참조 둘 다)에서 퇴사자(`deleted_at` 있음)·비활성
  (`is_active === false`) 직원은 제외한다.
- 공급측 담당자 미선택이거나 선택된 직원에게 전화번호가 없으면, 서명은 기존 문구
  `"견적 담당: 신석주 차장(010-2939-2431)"` 그대로 유지한다(폴백).
- 새 담당자를 이 모달에서 등록하는 기능(수정/추가 버튼), "사업자/개인" 토글은 이번 범위 밖 —
  구현하지 않는다.
- `npm run build` 통과 필수.

---

### Task 1: 서명 반영 배관 — `lib/email.js` / `lib/alimtalk.js` / `/api/send-quote`

**Files:**
- Modify: `lib/quotePdf.js` (COMPANY export)
- Modify: `lib/email.js`
- Modify: `lib/alimtalk.js`
- Modify: `app/api/send-quote/route.js`

**Interfaces:**
- Consumes: 없음 (독립 기반 작업)
- Produces:
  - `export const COMPANY` — `lib/quotePdf.js`에서 export (Task 2가 `{ name, address }` 필드를
    읽어 공급자 정보 카드에 표시)
  - `sendQuoteEmail({ to, cc, quote, pdfUrl, supplierName, supplierPhone })` — 두 필드 추가
  - `sendQuoteAlimtalk({ to, quote, pdfUrl, supplierName, supplierPhone })` — 두 필드 추가
  - `/api/send-quote` POST 바디에 최상위 `supplierName`/`supplierPhone` 필드 추가 지원
    (Task 2가 이 두 필드를 채워서 보낸다)

- [ ] **Step 1: `COMPANY` 상수 export**

`lib/quotePdf.js`에서 기존:

```js
const COMPANY = {
```

다음으로 교체(export 키워드만 추가):

```js
export const COMPANY = {
```

- [ ] **Step 2: `lib/email.js`의 `buildBody`/`buildHtml`/`sendQuoteEmail`에 서명 인자 추가**

`lib/email.js`의 기존:

```js
function buildBody(quote) {
  return `안녕하세요, ${quote.siteName ?? ""} 승강기 담당자/대표님.
안전하고 원활한 승강기 운행을 위해 부품 교체 견적서를 보내드립니다.

■ 견적명: ${quote.quoteTitle ?? ""}
■ 견적일: ${quote.quoteDate ?? ""}

첨부된 PDF 파일에서 견적서를 확인해주세요.
확인 후 승인(회신)해 주시면 부품 수급 및 일정을 조율하여 신속하고 안전하게 교체 공사를 진행하겠습니다.

늘 안전을 최우선으로 꼼꼼하게 관리하겠습니다. 감사합니다.

견적 담당: 신석주 차장(010-2939-2431)`;
}
```

다음으로 교체:

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

같은 파일의 기존:

```js
function buildHtml(quote, hasCard) {
  const bodyHtml = buildBody(quote).replace(/\n/g, "<br>");
```

다음으로 교체:

```js
function buildHtml(quote, hasCard, supplierName, supplierPhone) {
  const bodyHtml = buildBody(quote, supplierName, supplierPhone).replace(/\n/g, "<br>");
```

같은 파일의 기존:

```js
export async function sendQuoteEmail({ to, cc, quote, pdfUrl }) {
```

다음으로 교체:

```js
export async function sendQuoteEmail({ to, cc, quote, pdfUrl, supplierName, supplierPhone }) {
```

그리고 같은 함수 안의 `transporter.sendMail({...})` 호출, 기존:

```js
    text: buildBody(quote),
    html: buildHtml(quote, hasCard),
```

다음으로 교체:

```js
    text: buildBody(quote, supplierName, supplierPhone),
    html: buildHtml(quote, hasCard, supplierName, supplierPhone),
```

- [ ] **Step 3: `lib/alimtalk.js`의 `buildMessage`/`sendQuoteAlimtalk`에 서명 인자 추가**

`lib/alimtalk.js`의 기존:

```js
function buildMessage(quote) {
  return `【승강기 부품 교체 견적 안내】

안녕하세요, ${quote.siteName ?? ""} 담당자님.
안전하고 원활한 승강기 운행을 위해 아래 부품 교체 관련 견적서를 발송해 드립니다.

■ 견적명: ${quote.quoteTitle ?? ""}
■ 견적일: ${quote.quoteDate ?? ""}

아래 버튼을 눌러 견적서 확인 후 승인(회신)해 주시면, 부품 수급 및 일정을 조율하여
신속하고 안전하게 교체 공사를 진행하도록 하겠습니다.

늘 안전을 최우선으로 꼼꼼하게 관리하겠습니다. 감사합니다.

견적 담당: 신석주 차장(010-2939-2431)`;
}
```

다음으로 교체:

```js
function buildMessage(quote, supplierName, supplierPhone) {
  const contact = supplierName && supplierPhone ? `${supplierName}(${supplierPhone})` : "신석주 차장(010-2939-2431)";
  return `【승강기 부품 교체 견적 안내】

안녕하세요, ${quote.siteName ?? ""} 담당자님.
안전하고 원활한 승강기 운행을 위해 아래 부품 교체 관련 견적서를 발송해 드립니다.

■ 견적명: ${quote.quoteTitle ?? ""}
■ 견적일: ${quote.quoteDate ?? ""}

아래 버튼을 눌러 견적서 확인 후 승인(회신)해 주시면, 부품 수급 및 일정을 조율하여
신속하고 안전하게 교체 공사를 진행하도록 하겠습니다.

늘 안전을 최우선으로 꼼꼼하게 관리하겠습니다. 감사합니다.

견적 담당: ${contact}`;
}
```

같은 파일의 기존:

```js
export async function sendQuoteAlimtalk({ to, quote, pdfUrl }) {
```

다음으로 교체:

```js
export async function sendQuoteAlimtalk({ to, quote, pdfUrl, supplierName, supplierPhone }) {
```

그리고 같은 함수 안의 기존:

```js
  const message = buildMessage(quote);
```

다음으로 교체:

```js
  const message = buildMessage(quote, supplierName, supplierPhone);
```

- [ ] **Step 4: `/api/send-quote`가 `supplierName`/`supplierPhone`을 받아 전달**

`app/api/send-quote/route.js`의 기존:

```js
  const {
    quoteRequestId, channels, recipientEmail, recipientPhone,
    senderCcEmail, referenceEmail, referencePhone, quote,
  } = body;
```

다음으로 교체:

```js
  const {
    quoteRequestId, channels, recipientEmail, recipientPhone,
    senderCcEmail, referenceEmail, referencePhone, quote,
    supplierName, supplierPhone,
  } = body;
```

같은 파일의 기존:

```js
      await sendQuoteEmail({ to: recipientEmail, cc, quote, pdfUrl: quote?.pdfUrl });
```

다음으로 교체:

```js
      await sendQuoteEmail({ to: recipientEmail, cc, quote, pdfUrl: quote?.pdfUrl, supplierName, supplierPhone });
```

같은 파일의 기존(주 수신인 카카오 발송):

```js
      await sendQuoteAlimtalk({ to: recipientPhone, quote, pdfUrl: quote?.pdfUrl });
      results.kakao = { ok: true };
```

다음으로 교체:

```js
      await sendQuoteAlimtalk({ to: recipientPhone, quote, pdfUrl: quote?.pdfUrl, supplierName, supplierPhone });
      results.kakao = { ok: true };
```

같은 파일의 기존(참조인 최선노력 카카오 발송):

```js
        await sendQuoteAlimtalk({ to: referencePhone, quote, pdfUrl: quote?.pdfUrl });
      } catch (err) {
        console.error(`참조인 카카오 발송 실패 (quoteRequestId=${quoteRequestId}):`, err.message);
```

다음으로 교체:

```js
        await sendQuoteAlimtalk({ to: referencePhone, quote, pdfUrl: quote?.pdfUrl, supplierName, supplierPhone });
      } catch (err) {
        console.error(`참조인 카카오 발송 실패 (quoteRequestId=${quoteRequestId}):`, err.message);
```

- [ ] **Step 5: 빌드 확인**

Run: `npm run build`
Expected: 에러 없이 성공.

- [ ] **Step 6: 서명 반영/폴백 실사용 검증 (비용 없음 — 직접 함수 호출, 카카오 발송 없음)**

`elevator-field-app` 디렉터리에서 아래 두 스크립트를 실행해 서명이 바뀌는지와 폴백이
동작하는지 둘 다 확인한다:

```bash
node --env-file=.env.local -e "
import('./lib/email.js').then(async ({ sendQuoteEmail }) => {
  await sendQuoteEmail({
    to: process.env.NAVER_SMTP_USER,
    quote: { siteName: '테스트', quoteTitle: '서명테스트', quoteDate: '2026-07-28' },
    pdfUrl: 'https://raw.githubusercontent.com/mozilla/pdf.js/master/test/pdfs/basicapi.pdf',
    supplierName: '테스트담당자', supplierPhone: '010-1111-2222',
  });
  console.log('선택값 있는 발송 OK — 받은 메일 본문 서명이 \"테스트담당자(010-1111-2222)\"인지 확인');
}).catch((e) => { console.error('FAILED', e.message); process.exit(1); });
"
```

Expected: `선택값 있는 발송 OK...` 출력, 예외 없음. 실제 수신 메일함(guil2020@naver.com)에서
서명 줄이 `견적 담당: 테스트담당자(010-1111-2222)`인지 확인.

```bash
node --env-file=.env.local -e "
import('./lib/email.js').then(async ({ sendQuoteEmail }) => {
  await sendQuoteEmail({
    to: process.env.NAVER_SMTP_USER,
    quote: { siteName: '테스트', quoteTitle: '폴백테스트', quoteDate: '2026-07-28' },
    pdfUrl: 'https://raw.githubusercontent.com/mozilla/pdf.js/master/test/pdfs/basicapi.pdf',
  });
  console.log('선택값 없는 발송 OK — 서명이 기존 문구(신석주 차장)로 폴백되는지 확인');
}).catch((e) => { console.error('FAILED', e.message); process.exit(1); });
"
```

Expected: `선택값 없는 발송 OK...` 출력, 예외 없음. 수신 메일의 서명 줄이 기존 그대로
`견적 담당: 신석주 차장(010-2939-2431)`인지 확인.

카카오 알림톡(`sendQuoteAlimtalk`)은 실제 발송 시 비용이 발생하므로 이 단계에서 실제
호출하지 않는다 — Step 2의 코드 diff를 다시 읽고 `buildMessage`가 동일한 `contact` 계산
로직을 쓰는지 코드 리뷰로만 확인한다.

- [ ] **Step 7: 커밋**

```bash
git add lib/quotePdf.js lib/email.js lib/alimtalk.js app/api/send-quote/route.js
git commit -m "feat: 견적 발송 서명에 선택된 공급측 담당자 이름/전화번호 반영 (폴백: 기존 문구)"
```

---

### Task 2: `QuoteSendModal.jsx` 2단 레이아웃 — 공급자/고객 정보 드롭다운

**Files:**
- Modify: `app/components/admin/QuoteSendModal.jsx` (전체 교체)
- Modify: `app/components/admin/MaterialsAdmin.jsx:502-514` (`QuoteSendModal` 호출부에
  `profiles` prop 추가)

**Interfaces:**
- Consumes: Task 1의 `COMPANY`(from `@/lib/quotePdf`), `sendQuoteEmail`/`sendQuoteAlimtalk`의
  `supplierName`/`supplierPhone` 파라미터, `/api/send-quote`가 이 두 필드를 받는다는 계약
- Produces: 없음 (이 작업이 마지막 — `QuoteSendModal`을 부르는 곳은 `MaterialsAdmin.jsx` 한
  곳뿐이고, 이 태스크에서 그 호출부도 함께 고친다)

- [ ] **Step 1: `QuoteSendModal.jsx` 전체를 아래 내용으로 교체**

```jsx
"use client";

// 발행된 견적서를 이메일/카카오 알림톡으로 발송 — 발행과는 분리된 별도 동작(관리자가
// PDF 확인 후 직접 발송 버튼을 눌러야 나간다). 두 채널은 독립적으로 시도되고, 실패해도
// 조용히 숨기지 않고 채널별로 성공/실패를 그대로 보여준다.
//
// 공급자/고객 정보 2단 레이아웃 — 청구스(chungoose.ai) 참고 2단계(설계:
// docs/superpowers/specs/2026-07-28-quote-send-two-column-design.md). 담당자 드롭다운은
// 기존 텍스트 입력을 채워주는 편의 기능일 뿐, 실제 전송 값은 여전히 텍스트 입력이다.
import { useState } from "react";
import { Modal, inputCls } from "@/app/components/admin/adminShared";
import { COMPANY } from "@/lib/quotePdf";

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

  const activeStaff = (profiles ?? []).filter((p) => p.is_active !== false && !p.deleted_at);
  const staffByName = [...activeStaff].sort((a, b) => (a.name ?? "").localeCompare(b.name ?? "", "ko"));
  const staffWithEmail = staffByName.filter((p) => p.email);
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
              {staffByName.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
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
```

- [ ] **Step 2: `MaterialsAdmin.jsx` 호출부에 `profiles` prop 추가**

`app/components/admin/MaterialsAdmin.jsx:502-514` 근처, 기존:

```jsx
        <QuoteSendModal
          quote={sendTarget}
          site={(data.sites ?? []).find((s) => s.id === sendTarget.siteId)}
          siteManagers={(data.siteManagers ?? []).filter((m) => m.siteId === sendTarget.siteId)}
          onClose={() => setSendTarget(null)}
```

다음으로 교체:

```jsx
        <QuoteSendModal
          quote={sendTarget}
          site={(data.sites ?? []).find((s) => s.id === sendTarget.siteId)}
          siteManagers={(data.siteManagers ?? []).filter((m) => m.siteId === sendTarget.siteId)}
          profiles={data.profiles ?? []}
          onClose={() => setSendTarget(null)}
```

- [ ] **Step 3: 빌드 확인**

Run: `npm run build`
Expected: 에러 없이 성공.

- [ ] **Step 4: 브라우저 실사용 검증 (디스포저블 테스트 견적 사용)**

`npm run dev` 후 `/admin` → 자재·견적 신청내역 → 실제 현장으로 "+ 새 견적 발행" → 최소 1개
품목 입력 후 "발행 확정"(PDF 생성됨) → 그 행의 "발송" 버튼 클릭:

1. 왼쪽 "공급자 정보" 카드에 회사명/주소가 표시되고, 담당자 드롭다운 기본값이 "신석주"인지
   확인(직원 데이터에 있으면).
2. 오른쪽 "고객 정보" 카드의 담당자 드롭다운에 이 현장의 담당자 목록이 뜨고, 대표 담당자가
   기본 선택돼 있으며, 선택 시 이메일/전화 텍스트 입력이 채워지는지 확인.
3. 참조인 드롭다운에서 다른 현장담당자를 고르면 참조인 이메일/전화 텍스트 입력이 채워지는지
   확인.
4. 이메일 채널만 체크하고(카카오 체크 해제 — 비용 방지) 받는사람 이메일을 회사 계정
   자신(`guil2020@naver.com`)으로 바꾼 뒤 발송 → 실제 수신 메일의 서명 줄이 드롭다운에서
   고른 공급측 담당자의 이름/전화번호로 나오는지 확인.
5. 테스트에 사용한 디스포저블 견적 행은 REST DELETE로 정리한다(첨부 PDF가 Storage에 남는
   것은 기존에도 있던 anon-key 삭제 권한 제약과 동일 — 정리 시도만 하고 실패해도 무시).

- [ ] **Step 5: 커밋**

```bash
git add app/components/admin/QuoteSendModal.jsx app/components/admin/MaterialsAdmin.jsx
git commit -m "feat: 견적 발송 모달을 공급자/고객정보 2단 레이아웃으로 개편 (담당자 드롭다운)"
```
