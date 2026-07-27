# 견적서 발송(이메일 + 카카오 알림톡) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 발행된 견적서 PDF를 관리자가 "발송" 버튼으로 이메일(네이버 SMTP)과 카카오 알림톡(알리고)으로 현장 담당자에게 보낼 수 있게 한다.

**Architecture:** 채널별 발송 로직을 `lib/email.js`/`lib/alimtalk.js`에 분리하고, 새 API 라우트 `POST /api/send-quote`가 두 채널을 독립적으로 호출해 결과를 각각 반환한다(하나 실패해도 다른 하나는 그대로 진행). 관리자 UI는 새 모달(`QuoteSendModal`)에서 채널 체크박스 + 수신처(현장 담당자 기본값, 수정 가능)를 받아 발송을 트리거한다.

**Tech Stack:** nodemailer(신규 의존성, 네이버 SMTP), 알리고 REST API(fetch, 별도 SDK 없음), Next.js API Route, Supabase.

## Global Constraints

- 발행(`status: "견적발행"`)과 발송은 분리된 동작이다 — 발행 즉시 자동 발송하지 않는다.
- 이메일/카카오 두 채널은 서로 독립적으로 시도한다. 하나의 실패가 다른 하나의 처리를 막지 않는다.
- 실패는 조용히 숨기지 않는다 — 채널별 성공/실패와 실패 사유를 관리자 화면에 그대로 보여준다.
- 이메일 발신자: `guil2020@naver.com` (네이버 SMTP, `smtp.naver.com:465`, 앱 비밀번호 인증).
- 카카오 알림톡 발신: 알리고(Aligo) API, 엔드포인트 `https://kakaoapi.aligo.in/akv10/alimtalk/send/`(form-encoded POST). 실패 시 SMS 자동 대체발송(`failover=Y`) 사용.
- 승인된 알림톡 템플릿 문구(카카오 검수 대기 중, 변경 불가 — 정확히 이 텍스트와 일치해야 발송됨):
  ```
  【승강기 부품 교체 견적 안내】

  안녕하세요, #{현장명} 담당자님.
  안전하고 원활한 승강기 운행을 위해 아래 부품 교체 관련 견적서를 발송해 드립니다.

  ■ 견적명: #{견적명}
  ■ 견적일: #{견적일}

  아래 버튼을 눌러 견적서 확인 후 승인(회신)해 주시면, 부품 수급 및 일정을 조율하여
  신속하고 안전하게 교체 공사를 진행하도록 하겠습니다.

  늘 안전을 최우선으로 꼼꼼하게 관리하겠습니다. 감사합니다.

  견적 담당: 신석주 차장(010-2939-2431)
  ```
- 알림톡 버튼: "견적서 확인하기"(웹링크), 모바일/PC 링크 둘 다 `https://kdptzotxnzpuwzdguzgh.supabase.co/#{링크}`로 등록됨(도메인 고정, 그 뒤 경로만 변수).
- `quote_requests`의 `contact_phone`(기사가 접수 시 입력한 신고자 연락처)과 이번에 추가하는 `recipient_phone`(발송 대상, 현장 담당자)은 서로 다른 값이다 — 절대 혼용하지 않는다.

---

### Task 1: 마이그레이션 — 발송 수신처·발송시각 컬럼

**Files:**
- Create: `supabase/migrations/069_quote_send_DRAFT.sql`

**Interfaces:**
- Produces: `quote_requests`에 `recipient_email text`, `recipient_phone text`, `email_sent_at timestamptz`, `kakao_sent_at timestamptz` 컬럼.

- [ ] **Step 1: 마이그레이션 파일 작성**

```sql
-- 069: 견적서 발송(이메일/카카오알림톡) 수신처·발송시각 (2026-07-27)
-- 발행(발행일시는 기존 quote_issued_date)과 발송은 별개 동작이라 컬럼도 분리한다.
-- recipient_phone은 발송 대상(현장 담당자)용으로, 기존 contact_phone(기사가 접수 시 입력한
-- 신고자 연락처)과는 다른 값 — 혼용 금지.
alter table public.quote_requests add column if not exists recipient_email text;
alter table public.quote_requests add column if not exists recipient_phone text;
alter table public.quote_requests add column if not exists email_sent_at timestamptz;
alter table public.quote_requests add column if not exists kakao_sent_at timestamptz;

-- 검증
select column_name from information_schema.columns
where table_schema = 'public' and table_name = 'quote_requests'
  and column_name in ('recipient_email', 'recipient_phone', 'email_sent_at', 'kakao_sent_at')
order by column_name;
```

- [ ] **Step 2: 사용자에게 실행 요청**

이 SQL을 Supabase 대시보드 SQL Editor에서 직접 실행해달라고 사용자에게 요청한다(이 프로젝트엔
마이그레이션 자동 실행 도구가 없음 — `supabase/CLAUDE.md` 관례). 실행 후 검증 쿼리 결과로
4개 컬럼이 모두 보이는지 확인받는다.

- [ ] **Step 3: 커밋**

```bash
git add supabase/migrations/069_quote_send_DRAFT.sql
git commit -m "마이그레이션: 견적서 발송 수신처·발송시각 컬럼 (실행 전 DRAFT)"
```

---

### Task 2: mapQuoteRequest 필드 확장

**Files:**
- Modify: `lib/mappers.js:187` (`mapQuoteRequest`, `quotePdfUrl: row.quote_pdf_url,` 다음 줄)

**Interfaces:**
- Consumes: Task 1의 컬럼(`recipient_email`, `recipient_phone`, `email_sent_at`, `kakao_sent_at`).
- Produces: `mapQuoteRequest`가 반환하는 객체에 `recipientEmail`, `recipientPhone`, `emailSentAt`, `kakaoSentAt` 필드 추가. Task 6(QuoteSendModal)·Task 7(MaterialsAdmin 와이어링)이 이 이름을 그대로 쓴다.

- [ ] **Step 1: 필드 추가**

`lib/mappers.js`의 `mapQuoteRequest` 함수에서 `quotePdfUrl: row.quote_pdf_url,` 줄 바로 다음에 추가:

```js
    recipientEmail: row.recipient_email,
    recipientPhone: row.recipient_phone,
    emailSentAt: row.email_sent_at,
    kakaoSentAt: row.kakao_sent_at,
```

- [ ] **Step 2: 빌드 확인**

Run: `npm run build`
Expected: 에러 없이 통과.

- [ ] **Step 3: 커밋**

```bash
git add lib/mappers.js
git commit -m "feat: mapQuoteRequest에 견적 발송 수신처/발송시각 필드 추가"
```

---

### Task 3: 이메일 발송 유틸 (`lib/email.js`)

**Files:**
- Create: `lib/email.js`

**Interfaces:**
- Produces: `async function sendQuoteEmail({ to, quote, pdfUrl }): Promise<void>` — 실패 시 `throw`(Task 5의 API 라우트가 그대로 catch해서 `{ok:false, reason}`으로 변환). `quote` shape: `{ siteName, quoteTitle, quoteDate }`.

**⚠️ 사전 준비 (컨트롤러/사용자가 먼저 확인):** 이 태스크 코드 자체는 환경변수 없이도 작성·빌드는
되지만, **실제 발송 테스트는 `NAVER_SMTP_USER`/`NAVER_SMTP_APP_PASSWORD`가 `.env.local`에 있어야
가능**하다. 네이버메일 2단계 인증 켜고 앱 비밀번호를 발급받아야 하는 사람 몫의 준비물 — 아직
안 돼 있으면 이 태스크는 코드 작성 + 빌드 확인까지만 하고, 실제 발송(Step 3)은 스킵하고
컨트롤러에게 보고한다(스킵 자체는 정상, 코드가 잘못된 게 아님).

- [ ] **Step 1: 의존성 설치**

```bash
npm install nodemailer
```

- [ ] **Step 2: 구현**

```js
// lib/email.js
// 견적서 이메일 발송 — 네이버 SMTP(회사 계정, guil2020@naver.com)로 직접 보낸다. 별도
// 이메일 API 서비스(Resend 등)는 도메인 인증 전엔 발신자 본인 이메일로만 테스트 발송이
// 가능해서, 도메인을 새로 사지 않기로 한 이번 결정에서는 실제 고객 발송이 불가능하다 —
// 네이버 SMTP는 도메인 인증 없이 바로 실제 수신자에게 발송 가능해서 이걸 쓴다.
import nodemailer from "nodemailer";

function buildBody(quote) {
  return `안녕하세요, ${quote.siteName ?? ""} 담당자님.
안전하고 원활한 승강기 운행을 위해 아래 부품 교체 관련 견적서를 보내드립니다.

■ 견적명: ${quote.quoteTitle ?? ""}
■ 견적일: ${quote.quoteDate ?? ""}

첨부된 PDF 파일에서 견적서를 확인해주세요. 확인 후 승인(회신)해 주시면 부품 수급 및 일정을
조율하여 신속하고 안전하게 교체 공사를 진행하겠습니다.

늘 안전을 최우선으로 꼼꼼하게 관리하겠습니다. 감사합니다.

견적 담당: 신석주 차장(010-2939-2431)`;
}

export async function sendQuoteEmail({ to, quote, pdfUrl }) {
  if (!to) throw new Error("수신 이메일이 없습니다");

  const transporter = nodemailer.createTransport({
    host: "smtp.naver.com",
    port: 465,
    secure: true,
    auth: {
      user: process.env.NAVER_SMTP_USER,
      pass: process.env.NAVER_SMTP_APP_PASSWORD,
    },
  });

  const pdfRes = await fetch(pdfUrl);
  if (!pdfRes.ok) throw new Error(`PDF 다운로드 실패: ${pdfRes.status}`);
  const pdfBuffer = Buffer.from(await pdfRes.arrayBuffer());

  await transporter.sendMail({
    from: `"구일엘리베이터(주)" <${process.env.NAVER_SMTP_USER}>`,
    to,
    subject: `[구일엘리베이터] 견적서 안내 - ${quote.siteName ?? ""}`,
    text: buildBody(quote),
    attachments: [{ filename: "견적서.pdf", content: pdfBuffer }],
  });
}
```

- [ ] **Step 3: 자체 점검 (환경변수 있을 때만)**

`.env.local`에 `NAVER_SMTP_USER`/`NAVER_SMTP_APP_PASSWORD`가 있으면, 본인 이메일로 실제 테스트
발송해본다(수신 `to`는 컨트롤러 자신의 이메일 등 안전한 테스트 주소로):

```bash
node --input-type=module -e "
import { sendQuoteEmail } from './lib/email.js';
await sendQuoteEmail({
  to: '실제_테스트_받을_이메일@example.com',
  quote: { siteName: '테스트빌딩', quoteTitle: '테스트 견적', quoteDate: '2026-07-27' },
  pdfUrl: 'https://kdptzotxnzpuwzdguzgh.supabase.co/storage/v1/object/public/photos/quotes/test-verify-only-v3/1785136686887.pdf',
});
console.log('OK: 발송 완료');
"
```

Expected: `OK: 발송 완료` 출력 + 실제 받은메일함에 첨부파일 있는 이메일 도착 확인.

환경변수가 없으면 이 스텝은 스킵하고 보고한다: "NAVER_SMTP_USER/APP_PASSWORD 없어서 실제 발송
테스트는 못했음 — 코드/빌드는 정상."

- [ ] **Step 4: 커밋**

```bash
git add lib/email.js package.json package-lock.json
git commit -m "feat: 견적서 이메일 발송 유틸(sendQuoteEmail) 추가"
```

---

### Task 4: 카카오 알림톡 발송 유틸 (`lib/alimtalk.js`)

**Files:**
- Create: `lib/alimtalk.js`

**Interfaces:**
- Produces: `async function sendQuoteAlimtalk({ to, quote, pdfUrl }): Promise<void>` — 실패 시 `throw`. `quote` shape: `{ siteName, quoteTitle, quoteDate }` (Task 3과 동일한 shape).

**⚠️ 중요 — 이 태스크는 실제 발송으로 끝까지 검증할 수 없다:** 알림톡 템플릿이 아직 카카오 검수
대기 중(영업일 3~5일)이라 `ALIGO_TEMPLATE_CODE`가 없다. 이 태스크는 **코드 구조 검증까지만**
하고, 실제 알리고 API 호출 성공 여부는 템플릿 승인 후 별도로 확인해야 한다 — 이건 이 태스크의
결함이 아니라 외부 승인 대기라는 알려진 제약이다.

- [ ] **Step 1: 구현**

```js
// lib/alimtalk.js
// 카카오 알림톡 발송 — 알리고(Aligo) API. 실패 시(카카오톡 미가입/차단 등) SMS로 자동
// 대체발송되도록 failover=Y로 호출한다(건당 SMS 비용 별도 발생, 이미 확인받은 사항).
//
// 알리고는 변수 치환을 API가 하지 않는다 — message_1엔 #{현장명} 등 변수를
// 실제 값으로 이미 치환된 최종 문구를 그대로 넣어서 보내야 하고, 승인된 템플릿의 고정
// 텍스트와 정확히 일치해야 전송된다(안 맞으면 알리고가 거부).
const ALIGO_ENDPOINT = "https://kakaoapi.aligo.in/akv10/alimtalk/send/";

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

export async function sendQuoteAlimtalk({ to, quote, pdfUrl }) {
  if (!to) throw new Error("수신 전화번호가 없습니다");

  // 등록한 웹링크 버튼은 도메인(kdptzotxnzpuwzdguzgh.supabase.co)을 고정 등록했으므로,
  // 여기선 프로토콜을 뺀 나머지 전체 경로만 채운다.
  const link = String(pdfUrl).replace(/^https?:\/\//, "");
  const linkUrl = `https://${link}`;
  const message = buildMessage(quote);

  const body = new URLSearchParams({
    apikey: process.env.ALIGO_API_KEY,
    userid: process.env.ALIGO_USER_ID,
    senderkey: process.env.ALIGO_SENDER_KEY,
    tpl_code: process.env.ALIGO_TEMPLATE_CODE,
    sender: process.env.ALIGO_SENDER_PHONE,
    receiver_1: to,
    subject_1: "견적서 발송 안내",
    message_1: message,
    button_1: JSON.stringify({
      name: "견적서 확인하기",
      linkType: "WL",
      linkTypeName: "웹링크",
      linkMo: linkUrl,
      linkPc: linkUrl,
    }),
    failover: "Y",
    fsubject_1: "견적서 발송 안내",
    fmessage_1: `${message}\n\n견적서 확인: ${linkUrl}`,
  });

  const res = await fetch(ALIGO_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const json = await res.json().catch(() => null);
  if (!json || json.code !== 0) {
    throw new Error(json?.message || `알림톡 발송 실패 (HTTP ${res.status})`);
  }
}
```

- [ ] **Step 2: 자체 점검 (구조만, 실제 발송 불가 — 템플릿 미승인)**

환경변수 없이도 함수가 올바른 요청을 만드는지 확인한다(실제 fetch는 `ALIGO_API_KEY` 등이
비어있으면 알리고 서버가 에러 응답을 주거나 네트워크 자체는 도달함 — 그것만 확인):

```bash
node --input-type=module -e "
import { sendQuoteAlimtalk } from './lib/alimtalk.js';
try {
  await sendQuoteAlimtalk({
    to: '01000000000',
    quote: { siteName: '테스트빌딩', quoteTitle: '테스트 견적', quoteDate: '2026-07-27' },
    pdfUrl: 'https://kdptzotxnzpuwzdguzgh.supabase.co/storage/v1/object/public/photos/quotes/test/x.pdf',
  });
  console.log('예상 밖: 성공함(환경변수가 이미 유효했다는 뜻)');
} catch (e) {
  console.log('OK: 예상대로 실패 응답 받음 (템플릿/키 미설정) ->', e.message);
}
"
```

Expected: 네트워크 자체는 알리고 서버에 도달하고(타임아웃/DNS 에러가 아니라 알리고가 준 에러
메시지가 찍힘), `ALIGO_TEMPLATE_CODE` 등이 없거나 잘못됐다는 취지의 실패 메시지가 나오면 OK
(코드가 요청을 올바르게 구성해 알리고까지 도달했다는 뜻). 만약 환경변수가 이미 다 채워져 있고
템플릿도 승인됐다면 실제로 성공할 수도 있음 — 그러면 그것도 당연히 OK.

- [ ] **Step 3: 커밋**

```bash
git add lib/alimtalk.js
git commit -m "feat: 카카오 알림톡 발송 유틸(sendQuoteAlimtalk) 추가"
```

---

### Task 5: 발송 API 라우트

**Files:**
- Create: `app/api/send-quote/route.js`

**Interfaces:**
- Consumes: `sendQuoteEmail`(Task 3), `sendQuoteAlimtalk`(Task 4), `supabase`(`lib/supabaseClient.js`).
- Produces: `POST /api/send-quote` — 요청 바디 `{ quoteRequestId, channels: {email, kakao}, recipientEmail, recipientPhone, quote: {siteName, quoteTitle, quoteDate, pdfUrl} }`. 응답: `{ results: { email?: {ok, reason?}, kakao?: {ok, reason?} } }` (요청한 채널만 키가 있음). Task 6이 이 응답 shape를 그대로 쓴다.

- [ ] **Step 1: 구현**

```js
// app/api/send-quote/route.js
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

  const { quoteRequestId, channels, recipientEmail, recipientPhone, quote } = body;
  const results = {};
  const patch = {
    recipient_email: recipientEmail || null,
    recipient_phone: recipientPhone || null,
  };

  if (channels?.email) {
    try {
      await sendQuoteEmail({ to: recipientEmail, quote, pdfUrl: quote?.pdfUrl });
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
  }

  await supabase.from("quote_requests").update(patch).eq("id", quoteRequestId);

  return Response.json({ results });
}
```

- [ ] **Step 2: 빌드 확인**

Run: `npm run build`
Expected: 에러 없이 통과.

- [ ] **Step 3: 개발 서버로 확인**

`preview_start`로 dev 서버 열고, 실제 존재하는 견적요청 ID로(이메일만 켜고 카카오는 꺼서) curl:

```bash
curl -s -X POST http://localhost:3000/api/send-quote \
  -H "Content-Type: application/json" \
  -d '{"quoteRequestId":"test-verify-only","channels":{"email":false,"kakao":false},"recipientEmail":"","recipientPhone":"","quote":{"siteName":"테스트","quoteTitle":"t","quoteDate":"2026-07-27","pdfUrl":"https://kdptzotxnzpuwzdguzgh.supabase.co/storage/v1/object/public/photos/quotes/test-verify-only-v3/1785136686887.pdf"}}'
```

Expected: `{"results":{}}` (두 채널 다 꺼서 요청했으니 아무 것도 시도 안 함 — 라우트 자체가
에러 없이 200을 주는지만 확인하는 최소 스모크 테스트). `channels.email:true`로 바꿔서
재확인하려면 Task 3의 환경변수가 있어야 실제 성공 응답이 온다 — 없으면 `{"ok":false,...}` 형태
실패가 정상이다(라우트가 에러를 삼키지 않고 그대로 보여주는지 확인하는 게 이 스텝의 목적).

- [ ] **Step 4: 커밋**

```bash
git add app/api/send-quote/route.js
git commit -m "feat: 견적서 발송 API 라우트(POST /api/send-quote) 추가"
```

---

### Task 6: 관리자 UI — 발송 모달

**Files:**
- Create: `app/components/admin/QuoteSendModal.jsx`

**Interfaces:**
- Consumes: `Modal`, `inputCls`(`@/app/components/admin/adminShared`).
- Produces: `export default function QuoteSendModal({ quote, site, siteManagers, onClose, onSaved })` — Task 7에서 `import QuoteSendModal from "@/app/components/admin/QuoteSendModal";`로 가져다 쓴다. `siteManagers`는 해당 현장의 담당자 배열(호출부가 `data.siteManagers`에서 필터링해서 넘김). `onSaved(patch)`는 발송 성공 시 변경된 필드(camelCase: `recipientEmail`, `recipientPhone`, `emailSentAt?`, `kakaoSentAt?`)를 부모에게 전달한다.

- [ ] **Step 1: 구현**

```jsx
// app/components/admin/QuoteSendModal.jsx
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

    const patch = { recipientEmail: email, recipientPhone: phone };
    if (res.results?.email?.ok) patch.emailSentAt = new Date().toISOString();
    if (res.results?.kakao?.ok) patch.kakaoSentAt = new Date().toISOString();
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

- [ ] **Step 2: 빌드 확인**

Run: `npm run build`
Expected: 에러 없이 통과 (아직 어디서도 import 안 하므로 dead code지만 컴파일은 돼야 함).

- [ ] **Step 3: 커밋**

```bash
git add app/components/admin/QuoteSendModal.jsx
git commit -m "feat: 견적 발송 모달(QuoteSendModal) 추가"
```

---

### Task 7: MaterialsAdmin.jsx 연결

**Files:**
- Modify: `app/components/admin/MaterialsAdmin.jsx:14`(import 블록), `:50`(state 블록), `:394-408`(견적발행 상태 버튼 블록), `:455`(모달 렌더 블록 근처)

**Interfaces:**
- Consumes: `QuoteSendModal`(Task 6).

- [ ] **Step 1: import 추가**

`app/components/admin/MaterialsAdmin.jsx:14`(`import QuoteItemsModal ...` 다음 줄)에 추가:

```js
import QuoteSendModal from "@/app/components/admin/QuoteSendModal";
```

- [ ] **Step 2: state 추가**

`:50`(`const [itemsTarget, setItemsTarget] = useState(null);` 다음 줄)에 추가:

```js
  const [sendTarget, setSendTarget] = useState(null); // 발송 중인 견적요청
```

- [ ] **Step 3: "견적발행" 상태 버튼 그룹에 "발송" 버튼 추가**

`app/components/admin/MaterialsAdmin.jsx:394-408`의 기존 블록을 아래로 교체:

```jsx
                {q.status === "견적발행" && (
                  <div className="flex gap-1.5">
                    <button onClick={(e) => { e.stopPropagation(); handleQuoteAdvance(q); }} className="text-xs font-bold text-indigo-700 bg-indigo-50 px-2.5 py-1.5 rounded-lg">
                      승인 처리
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); setItemsTarget(q); }} className="text-xs font-bold text-slate-600 bg-slate-100 px-2.5 py-1.5 rounded-lg">
                      품목 수정
                    </button>
                    {q.quotePdfUrl && (
                      <>
                        <button onClick={(e) => { e.stopPropagation(); setSendTarget(q); }} className="text-xs font-bold text-green-700 bg-green-50 px-2.5 py-1.5 rounded-lg">
                          발송
                        </button>
                        <a href={q.quotePdfUrl} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="text-xs font-bold text-blue-700 border border-blue-200 px-2.5 py-1.5 rounded-lg">
                          PDF 보기
                        </a>
                      </>
                    )}
                  </div>
                )}
```

(변경 요약: "PDF 보기" 앞에 "발송" 버튼 추가. PDF가 있어야 보낼 게 있으니 같은 `q.quotePdfUrl &&`
조건 안에 둔다.)

- [ ] **Step 4: 모달 렌더 블록 추가**

`:455`(`{itemsTarget && (` 블록 시작 부분) 바로 앞에 추가:

```jsx
      {sendTarget && (
        <QuoteSendModal
          quote={sendTarget}
          site={(data.sites ?? []).find((s) => s.id === sendTarget.siteId)}
          siteManagers={(data.siteManagers ?? []).filter((m) => m.siteId === sendTarget.siteId)}
          onClose={() => setSendTarget(null)}
          onSaved={(patch) => {
            setData((prev) => ({
              ...prev,
              quoteRequests: prev.quoteRequests.map((x) => (x.id === sendTarget.id ? { ...x, ...patch } : x)),
            }));
          }}
        />
      )}
```

(`onSaved`에서 `setSendTarget(null)`을 안 하는 이유: 발송 결과 메시지를 관리자가 확인할 시간을
주기 위해 모달을 자동으로 닫지 않는다 — 닫기는 사용자가 직접 "닫기" 버튼으로.)

- [ ] **Step 5: 빌드 확인**

Run: `npm run build`
Expected: 에러 없이 통과.

- [ ] **Step 6: 브라우저로 확인 (처분 가능한 실데이터로, 검증 후 원복)**

1. `preview_start`로 dev 서버 열고 `/admin` → "자재·견적 신청내역" → 상태 "견적발행"인 견적요청
   하나 찾기(없으면 이 스텝은 스킵하고 컨트롤러가 사용자에게 확인).
2. "발송" 버튼 클릭 → `QuoteSendModal` 열리는지, 현장 담당자 이메일/전화가 있으면 기본값으로
   채워지는지 확인.
3. 이메일/카카오 체크박스 토글 확인, "발송" 클릭(환경변수 없으면 둘 다 실패 응답이 뜨는 게
   정상 — 실패 메시지가 화면에 명확히 보이는지가 확인 포인트).
4. **원복**: REST로 해당 견적요청의 `recipient_email`, `recipient_phone`, `email_sent_at`,
   `kakao_sent_at`을 테스트 전 값(대부분 null)으로 되돌린다.

- [ ] **Step 7: 커밋**

```bash
git add app/components/admin/MaterialsAdmin.jsx
git commit -m "feat: 견적발행 목록에 발송 버튼·모달 연결"
```

---

## Self-Review 결과 (계획 작성자 자체 점검)

- **스펙 커버리지**: 발송 시점(Task 6~7의 별도 버튼), 수신처 기본값(Task 6의 siteManagers
  프리필), 채널 선택(Task 6 체크박스), 이메일(Task 3), 카카오(Task 4), API(Task 5), 데이터모델
  (Task 1~2) 전부 태스크로 커버됨. "범위 밖"(발송 이력 로그, 자동발송, 다중수신자)은 의도적으로
  제외.
- **플레이스홀더 스캔**: TBD/TODO 없음. 카카오 알림톡(Task 4)은 템플릿 미승인으로 실제 발송까지
  검증 못 하는 게 사실이라 그렇게 명시함 — 회피가 아니라 알려진 외부 의존성 제약.
- **타입 일관성**: `recipientEmail`/`recipientPhone`/`emailSentAt`/`kakaoSentAt` 네이밍이
  Task 2(mapper) → Task 5(API 응답이 참조하는 snake_case 컬럼) → Task 6(모달의 onSaved patch)
  → Task 7(연결) 전체에서 동일하게 유지됨. Task 5의 API 요청 바디 shape(`quote: {siteName,
  quoteTitle, quoteDate, pdfUrl}`)가 Task 3/4의 함수 시그니처와 Task 6의 fetch 바디에서 전부
  일치하는지 확인함.
