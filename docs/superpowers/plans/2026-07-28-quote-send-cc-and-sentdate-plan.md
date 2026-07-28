# 견적 발송 참조인 입력 + 발송일자 표시 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 견적 발송 시 발신측 CC 이메일과 수신측 참조인(이메일·전화번호)을 입력할 수 있게 하고,
관리자웹에서 언제 발송했는지 확인할 수 있게 한다.

**Architecture:** `quote_requests` 테이블에 3개 컬럼을 추가하고, 발송 모달에 입력란 3개를
추가해 `/api/send-quote`로 전달, 이메일은 실제 CC로, 카카오는 참조인에게 별도 최선노력 발송으로
처리한다. 발송일자는 기존 `email_sent_at`/`kakao_sent_at`을 공용 헬퍼로 포맷해 관리자웹 3곳에
노출한다.

**Tech Stack:** Next.js 16 App Router, Supabase(REST), nodemailer, 알리고(Aligo) 알림톡 API.

## Global Constraints

- 발신측 CC 이메일 / 참조인 이메일 / 참조인 전화번호는 **항상 빈칸으로 시작**한다 — 현장담당자
  정보 등으로 자동 채우지 않는다.
- 이 세 필드는 **무엇을 입력하든 안 하든 발송 버튼(`canSend`)을 막지 않는다** — 기존 필수 조건
  (주 수신인 이메일/전화)에 추가하지 않는다.
- 참조인 카카오 알림톡 발송은 **최선노력(best-effort)** 이다 — 실패해도 서버 로그에만 남기고
  화면의 성공/실패 표시(`results.kakao`)에는 영향을 주지 않는다.
- **카카오 알림톡 실제 발송 테스트는 하지 않는다** — 건당 비용이 발생하므로, 이 기능은 코드
  리뷰와 `npm run build`로만 검증한다(이메일은 회사 계정으로 셀프 발송 테스트 가능, 비용 없음).
- DB 컬럼명은 snake_case(`sender_cc_email`, `reference_email`, `reference_phone`), 화면
  필드명은 camelCase(`senderCcEmail`, `referenceEmail`, `referencePhone`) — 변환은
  `lib/mappers.js`에서만.
- `main` 푸시 전 `npm run build` 통과 필수.

---

### Task 1: DB 컬럼 추가 + 매퍼 + 발송일자 표시 헬퍼

**Files:**
- Create: `supabase/migrations/071_quote_send_cc_reference_DRAFT.sql`
- Modify: `lib/mappers.js:165-200` (`mapQuoteRequest`)
- Modify: `app/components/admin/adminShared.jsx` (새 헬퍼 `sentLabel` 추가)

**Interfaces:**
- Consumes: 없음 (독립 기반 작업)
- Produces:
  - `mapQuoteRequest(row)`가 반환하는 객체에 `senderCcEmail`, `referenceEmail`,
    `referencePhone` 3개 필드 추가 (Task 2가 소비)
  - `app/components/admin/adminShared.jsx`에서 `export function sentLabel(q)` —
    인자로 `{ emailSentAt, kakaoSentAt }`를 가진 견적 객체를 받아 문자열을 반환 (Task 3이 소비)

- [ ] **Step 1: 마이그레이션 파일 작성**

`supabase/migrations/071_quote_send_cc_reference_DRAFT.sql` 생성:

```sql
-- 071: 견적 발송 참조인(CC) 컬럼 (2026-07-28)
-- 발송 시 발신측 CC 이메일, 수신측 참조인 이메일/전화번호를 함께 기록한다.
-- 기존 recipient_email/recipient_phone과 동일한 패턴 — 발송 시마다 입력값을 기록.
alter table public.quote_requests add column if not exists sender_cc_email text;
alter table public.quote_requests add column if not exists reference_email text;
alter table public.quote_requests add column if not exists reference_phone text;

-- 검증
select column_name from information_schema.columns
where table_schema = 'public' and table_name = 'quote_requests'
  and column_name in ('sender_cc_email', 'reference_email', 'reference_phone')
order by column_name;
```

- [ ] **Step 2: 마이그레이션 실행 요청**

이 저장소는 마이그레이션 도구가 없다(`supabase/CLAUDE.md`) — DDL은 사람이 Supabase 대시보드
SQL Editor에서 직접 실행해야 한다. 구현자는 이 스텝에서 STOP 상태로 보고하고(BLOCKED 아님,
NEEDS_CONTEXT도 아님 — 정상적인 "사람 실행 대기"), 컨트롤러(세션 진행자)가 사용자에게 위 SQL을
전달해 실행을 요청한다. **Task 2/3의 실사용(라이브) 검증 전에 반드시 완료되어야 한다** — 컬럼이
없으면 Supabase REST가 `sender_cc_email` 등을 update 페이로드에 넣는 순간 오류를 던진다.

- [ ] **Step 3: mapper에 필드 추가**

`lib/mappers.js:195-198` 근처, 기존:

```js
    recipientEmail: row.recipient_email,
    recipientPhone: row.recipient_phone,
    emailSentAt: row.email_sent_at,
    kakaoSentAt: row.kakao_sent_at,
  };
}
```

다음으로 교체:

```js
    recipientEmail: row.recipient_email,
    recipientPhone: row.recipient_phone,
    emailSentAt: row.email_sent_at,
    kakaoSentAt: row.kakao_sent_at,
    senderCcEmail: row.sender_cc_email,
    referenceEmail: row.reference_email,
    referencePhone: row.reference_phone,
  };
}
```

- [ ] **Step 4: `sentLabel` 헬퍼 추가**

`app/components/admin/adminShared.jsx:47-50` 근처(`personOf` 함수 바로 뒤)에 추가:

```js
// 발송일자 표기: 이메일/카카오 각각 보낸 시각이 있으면 "이메일 260728 · 카카오 260728"
// 형식으로, 둘 다 없으면 "-".
export function sentLabel(q) {
  const parts = [];
  if (q.emailSentAt) parts.push(`이메일 ${shortDate(q.emailSentAt.slice(0, 10))}`);
  if (q.kakaoSentAt) parts.push(`카카오 ${shortDate(q.kakaoSentAt.slice(0, 10))}`);
  return parts.length ? parts.join(" · ") : "-";
}
```

`shortDate`는 이 파일 8번째 줄에서 이미 `@/lib/utils`로부터 import돼 있다(추가 import 불필요).
`emailSentAt`/`kakaoSentAt`는 `timestamptz` ISO 문자열(예: `"2026-07-28T05:32:10.123Z"`)이라
`shortDate`(날짜 형식 `"YYYY-MM-DD"` 전용)에 바로 넣으면 깨진다 — 그래서 `.slice(0, 10)`로
날짜 부분만 먼저 잘라낸다.

- [ ] **Step 5: 빌드 확인**

Run: `npm run build`
Expected: 에러 없이 성공 (이 시점엔 `sentLabel`이 아직 아무 데서도 호출되지 않아 미사용 export
경고조차 없음 — export된 함수는 ESLint no-unused-vars 대상이 아님).

- [ ] **Step 6: 커밋**

```bash
git add supabase/migrations/071_quote_send_cc_reference_DRAFT.sql lib/mappers.js app/components/admin/adminShared.jsx
git commit -m "feat: 견적 발송 참조인 컬럼 + 발송일자 표시 헬퍼 추가"
```

---

### Task 2: 발송 모달 + 발송 API — 참조인 입력/CC 발송

**Files:**
- Modify: `app/components/admin/QuoteSendModal.jsx`
- Modify: `app/api/send-quote/route.js`
- Modify: `lib/email.js`

**Interfaces:**
- Consumes: Task 1의 `mapQuoteRequest` 필드 확장(이 작업에선 직접 참조하진 않음 — 이 세 입력란은
  항상 빈칸 시작이라 `quote.senderCcEmail` 등을 초기값으로 읽지 않는다는 점이 핵심 제약)
- Produces: `sendQuoteEmail({ to, cc, quote, pdfUrl })` — `cc`는 `string[]` (Task 3은 이 신호를
  소비하지 않음, 최종 리뷰용 인터페이스 기록)

- [ ] **Step 1: `QuoteSendModal.jsx`에 입력란 3개 추가**

`app/components/admin/QuoteSendModal.jsx:11-16` 근처, 기존:

```js
  const [email, setEmail] = useState(quote.recipientEmail || primaryManager?.email || "");
  const [phone, setPhone] = useState(quote.recipientPhone || primaryManager?.phone || "");
  const [sendEmail, setSendEmail] = useState(true);
  const [sendKakao, setSendKakao] = useState(true);
  const [sending, setSending] = useState(false);
  const [results, setResults] = useState(null);
```

다음으로 교체(3개 상태 추가, **항상 빈 문자열로 시작** — `quote.senderCcEmail` 등을 읽지 않음):

```js
  const [email, setEmail] = useState(quote.recipientEmail || primaryManager?.email || "");
  const [phone, setPhone] = useState(quote.recipientPhone || primaryManager?.phone || "");
  const [senderCcEmail, setSenderCcEmail] = useState("");
  const [referenceEmail, setReferenceEmail] = useState("");
  const [referencePhone, setReferencePhone] = useState("");
  const [sendEmail, setSendEmail] = useState(true);
  const [sendKakao, setSendKakao] = useState(true);
  const [sending, setSending] = useState(false);
  const [results, setResults] = useState(null);
```

- [ ] **Step 2: fetch body와 저장 patch에 3개 필드 전달**

`app/components/admin/QuoteSendModal.jsx:22-47` 근처, 기존:

```js
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
```

다음으로 교체:

```js
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

    const patch = {
      recipientEmail: email,
      recipientPhone: phone,
      senderCcEmail: senderCcEmail || null,
      referenceEmail: referenceEmail || null,
      referencePhone: referencePhone || null,
    };
    if (res.results?.email?.ok) patch.emailSentAt = new Date().toISOString();
    if (res.results?.kakao?.ok) patch.kakaoSentAt = new Date().toISOString();
    if (res.results?.email?.ok || res.results?.kakao?.ok) onSaved(patch);
```

- [ ] **Step 3: 입력란 JSX 추가**

`app/components/admin/QuoteSendModal.jsx:54-63` 근처, 기존:

```jsx
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
```

다음으로 교체:

```jsx
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
```

`canSend` 계산식(`app/components/admin/QuoteSendModal.jsx:50`)은 그대로 둔다 — 이 3개 필드를
참조하지 않으므로 발송 버튼을 막지 않는다는 제약이 코드 변경 없이 자동으로 지켜진다.

- [ ] **Step 4: `/api/send-quote`에서 필드 받아 처리**

`app/api/send-quote/route.js` 전체를 다음으로 교체:

```js
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
```

- [ ] **Step 5: `sendQuoteEmail`에 `cc` 인자 추가**

`lib/email.js:42-79` 근처, 기존 함수 시그니처와 `sendMail` 호출부:

```js
export async function sendQuoteEmail({ to, quote, pdfUrl }) {
```

다음으로 교체:

```js
export async function sendQuoteEmail({ to, cc, quote, pdfUrl }) {
```

그리고 같은 함수 안의 `transporter.sendMail({...})` 호출(현재 `to, subject, text, html,
attachments` 순서), 기존:

```js
  await transporter.sendMail({
    from: `"구일엘리베이터(주)" <${process.env.NAVER_SMTP_USER}>`,
    to,
    subject: `[구일엘리베이터] 견적서 안내 - ${quote.siteName ?? ""}`,
    text: buildBody(quote),
    html: buildHtml(quote, hasCard),
    attachments,
  });
```

다음으로 교체:

```js
  await transporter.sendMail({
    from: `"구일엘리베이터(주)" <${process.env.NAVER_SMTP_USER}>`,
    to,
    cc: cc && cc.length ? cc.join(",") : undefined,
    subject: `[구일엘리베이터] 견적서 안내 - ${quote.siteName ?? ""}`,
    text: buildBody(quote),
    html: buildHtml(quote, hasCard),
    attachments,
  });
```

- [ ] **Step 6: 빌드 확인**

Run: `npm run build`
Expected: 에러 없이 성공.

- [ ] **Step 7: 이메일 CC 실사용 테스트 (비용 없음 — 회사 계정 셀프 발송)**

`.env.local`에 이미 `NAVER_SMTP_USER`/`NAVER_SMTP_APP_PASSWORD`가 설정돼 있다. 아래 스크립트를
`elevator-field-app` 디렉터리에서 실행해 CC가 실제로 붙어 나가는지 확인한다(회사 계정 자신에게
발송 + 자신을 CC로도 넣어 이메일 클라이언트에서 받는사람/참조 둘 다에 같은 주소가 찍히는지 확인):

```bash
node --env-file=.env.local -e "
import('./lib/email.js').then(async ({ sendQuoteEmail }) => {
  await sendQuoteEmail({
    to: process.env.NAVER_SMTP_USER,
    cc: [process.env.NAVER_SMTP_USER],
    quote: { siteName: '테스트현장', quoteTitle: 'CC테스트', quoteDate: '2026-07-28' },
    pdfUrl: 'https://example.com/dummy.pdf',
  });
  console.log('sent OK');
}).catch((e) => { console.error('FAILED', e.message); process.exit(1); });
"
```

Expected: `sent OK` 출력, 예외 없음. (`pdfUrl`이 실제 존재하지 않는 더미 URL이라 PDF fetch가
실패할 수 있음 — 그 경우 `fetch` 실패 메시지가 뜨면 실재하는 아무 공개 PDF URL로 바꿔 재시도.
목적은 CC 필드가 nodemailer에 정상 전달되는지 확인하는 것.)

**참조인 카카오 발송(두 번째 `sendQuoteAlimtalk` 호출)은 비용이 발생하므로 실제 발송 테스트를
하지 않는다** — Step 4의 코드를 다시 읽고 로직만 확인한다(참조인 전화번호가 있을 때만
best-effort로 호출되고, 실패해도 `results.kakao`를 건드리지 않는지).

- [ ] **Step 8: 커밋**

```bash
git add app/components/admin/QuoteSendModal.jsx app/api/send-quote/route.js lib/email.js
git commit -m "feat: 견적 발송에 발신측 CC·참조인 이메일/전화번호 입력 추가"
```

---

### Task 3: 관리자웹 발송일자 표시 3곳 적용

**Files:**
- Modify: `app/components/admin/MaterialsAdmin.jsx`
- Modify: `app/components/admin/SitesAdmin.jsx`

**Interfaces:**
- Consumes: Task 1의 `sentLabel(q)` (from `app/components/admin/adminShared.jsx`)
- Produces: 없음 (화면 표시 전용, 최종 작업)

- [ ] **Step 1: `MaterialsAdmin.jsx` import에 `sentLabel` 추가**

`app/components/admin/MaterialsAdmin.jsx:14`, 기존:

```js
import { locOf, addressOf, personOf, StatusBadge, AdminTable, FilterPills, inputCls, Modal, PhotoGrid, DateTextInput } from "@/app/components/admin/adminShared";
```

다음으로 교체:

```js
import { locOf, addressOf, personOf, StatusBadge, AdminTable, FilterPills, inputCls, Modal, PhotoGrid, DateTextInput, sentLabel } from "@/app/components/admin/adminShared";
```

- [ ] **Step 2: 견적요청 표 헤더/행에 발송일 추가**

`app/components/admin/MaterialsAdmin.jsx:402`, 기존:

```jsx
        <AdminTable head={["신청일", "현장 · 호기", "공사 내용", "신청 기사", "발행/승인/지급", "상태", "처리"]}>
```

다음으로 교체:

```jsx
        <AdminTable head={["신청일", "현장 · 호기", "공사 내용", "신청 기사", "발행/승인/지급/발송", "상태", "처리"]}>
```

그리고 같은 파일 `:417-419`, 기존:

```jsx
              <td className="px-3 py-2.5 text-xs text-slate-500 whitespace-nowrap">
                {shortDate(q.quoteIssuedDate)} / {shortDate(q.approvedDate)} / {shortDate(q.suppliedDate)}
              </td>
```

다음으로 교체:

```jsx
              <td className="px-3 py-2.5 text-xs text-slate-500 whitespace-nowrap">
                {shortDate(q.quoteIssuedDate)} / {shortDate(q.approvedDate)} / {shortDate(q.suppliedDate)} / {sentLabel(q)}
              </td>
```

- [ ] **Step 3: 견적요청 상세내역 모달에 발송일 줄 추가**

`app/components/admin/MaterialsAdmin.jsx:793-795`, 기존:

```jsx
        {!isMaterial && (
          <div><p className="text-xs font-bold text-slate-400 mb-1">발행일 / 승인일 / 지급일</p><p className="font-semibold text-slate-800">{shortDate(r.quoteIssuedDate)} / {shortDate(r.approvedDate)} / {shortDate(r.suppliedDate)}</p></div>
        )}
```

다음으로 교체:

```jsx
        {!isMaterial && (
          <>
            <div><p className="text-xs font-bold text-slate-400 mb-1">발행일 / 승인일 / 지급일</p><p className="font-semibold text-slate-800">{shortDate(r.quoteIssuedDate)} / {shortDate(r.approvedDate)} / {shortDate(r.suppliedDate)}</p></div>
            <div><p className="text-xs font-bold text-slate-400 mb-1">발송일</p><p className="font-semibold text-slate-800">{sentLabel(r)}</p></div>
          </>
        )}
```

- [ ] **Step 4: `SitesAdmin.jsx` import에 `sentLabel` 추가**

`app/components/admin/SitesAdmin.jsx:16`, 기존:

```js
import { Modal, StatusBadge, DateTextInput, EditableDate, FileCarousel } from "@/app/components/admin/adminShared";
```

다음으로 교체:

```js
import { Modal, StatusBadge, DateTextInput, EditableDate, FileCarousel, sentLabel } from "@/app/components/admin/adminShared";
```

- [ ] **Step 5: 견적내역 탭의 "발송완료" 텍스트를 실제 날짜로 교체**

`app/components/admin/SitesAdmin.jsx:264-267`, 기존:

```jsx
                    <p className="text-xs text-slate-500">
                      {shortDate(q.quoteIssuedDate || q.requestedDate)}
                      {(q.emailSentAt || q.kakaoSentAt) && " · 발송완료"}
                    </p>
```

다음으로 교체:

```jsx
                    <p className="text-xs text-slate-500">
                      {shortDate(q.quoteIssuedDate || q.requestedDate)}
                      {(q.emailSentAt || q.kakaoSentAt) && ` · ${sentLabel(q)}`}
                    </p>
```

- [ ] **Step 6: 빌드 확인**

Run: `npm run build`
Expected: 에러 없이 성공.

- [ ] **Step 7: 브라우저 확인**

`npm run dev` 실행 후 `/admin` 접속 → 자재·견적 신청내역에서 발송된 적 있는 견적 행(또는 Task 2
테스트로 실제 발송해본 행)의 표/상세모달에서 "이메일 YYMMDD" 형식이 보이는지 확인. 발송 안 한
행은 표에서 "-"로 나오는지 확인. 현장관리 → 호기 상세창 → 견적내역 탭에서도 동일하게 확인.

- [ ] **Step 8: 커밋**

```bash
git add app/components/admin/MaterialsAdmin.jsx app/components/admin/SitesAdmin.jsx
git commit -m "feat: 관리자웹에 견적 발송일자 표시 (표/상세모달/견적내역 탭)"
```
