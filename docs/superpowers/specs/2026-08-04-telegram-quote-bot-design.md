# 텔레그램 견적발송 봇 — 설계

## 배경

관리자가 PC 앞이 아니어도 "OO현장 도어레일 12만원 견적 보내줘" 한 문장으로 견적서를 발행·발송할 수
있게 한다. 새 파이프라인을 만드는 게 아니라 이미 있는 견적 발행·발송 파이프라인
(`lib/quotePdf.js`, `lib/email.js`, `lib/alimtalk.js`, `app/api/send-quote/route.js`, 그리고
`2026-07-27-quote-send-email-kakao-design.md`에서 설계한 `quote_requests` 발송 컬럼들)을 텔레그램이라는
새 입력 채널로 여는 것이다. 발송 로직 자체는 손대지 않는다.

**v1 범위는 단일 품목 견적으로 한정**한다 — 운반비·안전관리비·이윤 같은 세부 비용이나 품목 여러 개는
관리자웹으로 넘긴다(아래 "범위 밖" 참고). 실무에서 가장 잦은 케이스(현장 하나 + 품목 하나 + 가격 하나)를
먼저 완전히 자동화하고, 복잡한 케이스는 억지로 챗봇 안에서 다 해결하려 하지 않는다.

## 전체 흐름

```
관리자(텔레그램)                         서버(Vercel API 라우트)
  │                                          │
  │  "태영하이빌 도어레일 12만원 견적 보내줘"  →  1. 발신자 인가 확인 (profiles.telegram_user_id)
  │                                          │  2. Claude API로 현장명/품목/가격 파싱
  │                                          │  3. 현장명 매칭 (sites.name 기준)
  │                                          │     - 모호하거나 못 찾으면 → 재질문하고 종료(상태 없음)
  │                                          │  4. quote_requests 새 초안 생성(현장만 연결, "새 견적서"와 동일)
  │                                          │     + quote_items에 파싱된 품목 1건 저장
  │                                          │  5. lib/quotePdf.js로 PDF 생성 → Storage 업로드
  │  ← PDF 문서 + 요약 텍스트 + [발송]/[취소] 버튼
  │
  │  [발송] 클릭                       →     6. lib/email.js + lib/alimtalk.js 직접 호출
  │                                          │     (site_managers 주담당자 정보로 수신처 자동 채움)
  │                                          │  7. quote_requests에 발송 결과 반영(email_sent_at 등)
  │  ← "발송 완료 — 이메일 ✅ 카카오 ✅"
  │
  │  [취소] 클릭                       →     6'. 빈 초안 quote_requests 삭제(MaterialsAdmin.jsx의
  │                                          │      onClose 정리 로직과 동일 조건)
  │  ← "취소했습니다"
```

핵심 설계 결정: **모호성 해소용 별도 세션/상태 저장소를 두지 않는다.** 텔레그램 인라인 버튼의
`callback_data`에 필요한 식별자(`quote_requests.id`)를 그대로 실어 보내고, 버튼을 누르면 그 콜백 안에서
DB를 다시 조회해 처리한다. 그래서 "현장을 못 찾았어요/여러 개예요"는 상태를 만들지 않고 바로
재질문하고 끝낸다 — 사용자가 정확한 현장명으로 다시 문장을 보내면 그게 새 요청이 된다.

## 컴포넌트별 설계

### 1. 웹훅 진입점 — `app/api/telegram-webhook/route.js` (신설)

텔레그램이 모든 업데이트(메시지, 버튼 클릭)를 POST로 이 라우트 하나에 보낸다. `update.message`와
`update.callback_query` 두 종류를 분기 처리한다.

```js
export async function POST(request) {
  if (request.headers.get("x-telegram-bot-api-secret-token") !== process.env.TELEGRAM_WEBHOOK_SECRET) {
    return new Response("forbidden", { status: 403 });
  }
  const update = await request.json();
  if (update.message?.text) return handleMessage(update.message);
  if (update.callback_query) return handleCallback(update.callback_query);
  return Response.json({ ok: true }); // 모르는 업데이트 타입은 조용히 무시
}
```

### 2. 발신자 인가

`profiles`에 `telegram_user_id`(bigint, nullable) 컬럼을 추가한다. `update.message.from.id`로 조회해서
매칭되는 프로필이 없거나 `role !== 'admin'`이면 아무 것도 하지 않고 종료(공격자에게 "권한 없음"조차
알려주지 않는 게 안전 — 봇 존재를 굳이 확인시켜줄 필요 없음).

### 3. 자연어 파싱 — `lib/telegramQuoteParse.js` (신설)

Claude API(Haiku, 저비용) 1회 호출로 구조화 추출. `output_config.format`(structured outputs)으로
스키마를 강제해서 파싱 실패를 없앤다.

```js
// 입력: "태영하이빌 도어레일 12만원 견적 보내줘"
// 출력: { siteQuery: "태영하이빌", itemName: "도어레일", unitPrice: 120000, transportCost: 0 }
```

파싱 결과에 `siteQuery`나 `itemName`, `unitPrice` 중 하나라도 비어 있으면 즉시
"현장·품목·가격을 한 문장에 다 알려주세요 — 예: 'OO현장 도어레일 12만원 견적'" 응답하고 종료.

### 4. 현장 매칭

`lib/utils.js`의 기존 `siteMatchesQuery`를 재사용하지 않고(그건 담당자·주소까지 포함한 폭넓은 검색이라
여기선 오탐이 큼), **현장명(`sites.name`)만** 대상으로 부분일치 + 오탈자 허용(간단한 포함검사 우선,
필요하면 나중에 유사도 점수 추가)한다.

- 정확히 1건 매칭 → 다음 단계
- 0건 → "그 이름으로 현장을 못 찾았어요. 정확한 현장명으로 다시 알려주세요."
- 2건 이상 → 후보 이름을 나열하고 "정확한 이름으로 다시 말씀해주세요" (버튼 아님 — 상태 안 만듦)

### 5. 견적 초안 생성

기존 관리자웹 "새 견적서" 흐름(`MaterialsAdmin.jsx:947` `SitePicker` 이후 로직)과 동일하게, **기사
요청 유무와 무관하게 항상 새 빈 초안**을 만든다. 봇은 진행중인 기사 요청에 병합하지 않는다 — 병합
판단까지 자동화하면 오배정 위험이 크고, 어차피 관리자가 최종 PDF를 보고 확인하므로 새로 만드는 쪽이
안전하고 단순하다.

```js
const { data: draft } = await supabase.from("quote_requests").insert({
  id: `q-tg-${Date.now()}`,
  site_id: site.id,
  status: "요청접수",
  quote_items: [{ category: "부품", name: itemName, qty: 1, unitPrice }],
  transport_cost: 0, safety_cost: 0, profit: 0,
  quote_title: itemName, quote_date: TODAY_STR,
}).select().single();
```

### 6. PDF 생성

`lib/quotePdf.js`는 이미 브라우저 화면과 독립된 순수 함수라 API 라우트를 또 거치지 않고 **직접
import해서 호출**한다(불필요한 self-HTTP 호출 없음). 생성된 PDF는 기존과 동일하게 Supabase Storage에
업로드하고 `quote_requests.quote_pdf_url`에 저장.

### 7. 텔레그램에 미리보기 전송

Telegram Bot API `sendDocument`로 PDF 파일 자체를 전송(카톡처럼 링크가 아니라 파일로 바로 보임) +
같은 메시지에 요약 캡션 + 인라인 키보드:

```js
await tg("sendDocument", {
  chat_id, document: pdfBuffer,
  caption: `${site.name} · ${itemName} ${unitPrice.toLocaleString()}원\n수신: ${manager.name} (${manager.email})\n이대로 발송할까요?`,
  reply_markup: { inline_keyboard: [[
    { text: "✅ 발송", callback_data: `send:${draft.id}` },
    { text: "❌ 취소", callback_data: `cancel:${draft.id}` },
  ]] },
});
```

### 8. 발송/취소 콜백 처리

`callback_query.data`를 `:`로 분리해 `action`, `quoteRequestId`를 얻는다. `quote_requests`를 다시
조회해서 해당 건이 여전히 "요청접수" 상태인지 확인 후 처리(이중 클릭 방지).

- `send:` → `lib/email.js`의 `sendQuoteEmail`, `lib/alimtalk.js`의 `sendQuoteAlimtalk`를 **직접 호출**
  (site_managers 주담당자 정보로 수신처 자동 채움, `app/api/send-quote/route.js`의 채널별 독립 try/catch
  패턴을 그대로 따름) → 성공한 채널만 `email_sent_at`/`kakao_sent_at` 기록 → 텔레그램에 결과 회신
- `cancel:` → `MaterialsAdmin.jsx:596-619`와 동일 조건(상태="요청접수" AND requester_id/engineer 없음)일
  때만 삭제 → "취소했습니다" 회신. 조건 안 맞으면(이미 다른 경로로 진행된 건) 삭제하지 않고 안내만.

## 데이터 모델

마이그레이션 초안(다음 번호는 실행 시점에 재확인 — 현재 최신은 100):

```sql
-- 101_telegram_admin_link_DRAFT.sql
alter table public.profiles add column if not exists telegram_user_id bigint unique;
```

새 테이블은 만들지 않는다 — "전체 흐름"에서 설명했듯 봇 대화 상태를 별도로 저장하지 않고
`quote_requests.id`를 콜백 식별자로 그대로 쓰기 때문.

## 보안

- **웹훅 검증**: 텔레그램 `setWebhook` 호출 시 `secret_token`을 등록해두고, 매 요청마다
  `X-Telegram-Bot-Api-Secret-Token` 헤더를 환경변수와 비교(위 §1). 안 맞으면 403.
- **발신자 화이트리스트**: `profiles.telegram_user_id` 매핑 + `role === 'admin'` 확인(§2). 이게
  없으면 봇 토큰만 알아도 아무나 실제 고객에게 견적을 발송할 수 있는 구멍이 생긴다.
- **콜백 재검증**: 버튼 클릭 시점에 DB를 다시 조회해 상태를 확인(§8) — 클라이언트(텔레그램 메시지)가
  들고 있는 정보를 그대로 믿지 않는다.

## 에러 처리 원칙

`2026-07-27-quote-send-email-kakao-design.md`와 동일한 원칙을 따른다 — 이메일/카카오 각각 성공·실패를
명확히 구분해서 텔레그램 메시지로 회신하고, 부분 성공(하나만 성공)도 정상 상태로 받아들인다. 조용히
실패를 숨기지 않는다.

추가로 이 봇 고유의 실패 지점:

- Claude API 파싱 실패/타임아웃 → "문장을 이해하지 못했어요. 다시 말씀해주시겠어요?"
- PDF 생성 실패 → 초안은 남겨두고(재시도 가능하도록) "PDF 생성에 실패했어요. 잠시 후 다시 시도해주세요."
  라고만 답하고 로그에 상세 사유 기록.

## 구현 전 준비 사항 (사람이 직접 해야 하는 것)

1. @BotFather에서 텔레그램 봇 생성 → 토큰 발급 → Vercel 환경변수 `TELEGRAM_BOT_TOKEN` 등록.
2. 웹훅 등록(`setWebhook` API 호출, 배포 후 1회) — `secret_token`도 이때 같이 등록하고 그 값을
   `TELEGRAM_WEBHOOK_SECRET`으로 저장.
3. 봇을 실제 사용할 관리자 본인 텔레그램 계정의 `user_id` 확인(봇에게 아무 말이나 보내면 웹훅 로그에
   찍힘, 또는 @userinfobot 같은 공개 봇으로 확인) → `profiles.telegram_user_id`에 채워넣기.
4. Claude API 키 — 기존 것 재사용할지 별도 키 발급할지 결정(비용은 미미하지만 사용량 구분을 원하면
   별도 키 추천).
5. 마이그레이션(`101_telegram_admin_link_DRAFT.sql`) 대시보드 SQL Editor에서 실행.

## 범위 밖

- **다품목 견적, 운반비/안전관리비/이윤 같은 세부 비용** — 챗봇으로 억지로 다 받지 않는다. 필요하면
  관리자웹에서 해당 초안(`quote_requests`)을 열어 마저 편집.
- **기사가 이미 올린 자재/견적 요청과의 병합** — 봇은 항상 새 초안만 만든다. 기존 요청 목록에서 골라
  발행하는 건 기존 관리자웹 흐름 그대로.
- **동명 현장 등 진짜 모호한 현장명 자동 해소(유사도 랭킹 이상)** — v1은 단순 포함검사만, 안 되면
  사람이 정확한 이름으로 재입력.
- **텔레그램 봇을 통한 견적 조회·통계·기타 명령어** — 이번 설계는 "견적 발송" 한 가지 기능만.
- **여러 관리자 동시 지원 시 권한 세분화**(누구는 발송만, 누구는 발행까지 등) — 지금은 admin이면 전부
  허용.
