# 견적 발송 참조인 입력 + 발송일자 표시 — 설계

## 배경

견적 발송(이메일/카카오 알림톡) 기능은 이미 있지만, 관리자웹에서 언제 발송했는지 확인할 방법이
없다(발행일/승인일/지급일만 표시되고 발송일은 어디에도 안 보임). 또한 발송 시 받는사람
이메일·전화번호만 입력하는데, 회사 쪽 참조(CC)와 현장 쪽 참조인(대표·부담당자 등) 연락처도
함께 넣고 싶다는 요구가 있다.

## 1. DB 스키마

`quote_requests` 테이블에 컬럼 3개 추가(기존 `recipient_email`/`recipient_phone`와 동일한
패턴 — 발송 시마다 입력값을 기록해두는 감사용 컬럼):

```sql
-- 071: 견적 발송 참조인(CC) 컬럼 (2026-07-28)
alter table public.quote_requests add column if not exists sender_cc_email text;
alter table public.quote_requests add column if not exists reference_email text;
alter table public.quote_requests add column if not exists reference_phone text;
```

`lib/mappers.js`의 `mapQuoteRequest`에 `senderCcEmail`/`referenceEmail`/`referencePhone`
매핑 추가.

## 2. 발송 모달(`QuoteSendModal.jsx`) — 입력란 3개 추가

- **발신측 CC 이메일** — 빈칸 시작, 선택 입력. 채우면 이메일 발송 시 참조로 들어감.
- **참조인 이메일** — 빈칸 시작, 선택 입력. 채우면 이메일 발송 시 참조로 들어감.
- **참조인 전화번호** — 빈칸 시작, 선택 입력. 채우면 카카오 알림톡도 별도로 발송.

세 필드 모두 현장담당자 정보로 자동 채우지 않는다(항상 빈칸 시작) — 매번 관리자가 필요할 때만
직접 입력. 기존 `canSend`(발송 버튼 활성화 조건)는 그대로 두고, 이 세 필드는 무엇을 넣든 안
넣든 발송 버튼을 막지 않는다.

## 3. 발송 처리(`/api/send-quote`, `lib/email.js`, `lib/alimtalk.js`)

- `sendQuoteEmail`에 `cc` 인자 추가 → `[senderCcEmail, referenceEmail].filter(Boolean)`을
  nodemailer의 `cc` 필드로 전달(둘 다 실제 메일에 참조로 들어감).
- 카카오: 기존 주 수신인(`recipientPhone`) 발송은 그대로 두고 성공/실패가 화면에 표시되는
  기준도 그대로 유지. `referencePhone`이 채워져 있으면 별도로 한 번 더
  `sendQuoteAlimtalk`를 호출해서 참조인에게도 보낸다 — 이 참조인 발송은 최선노력(best-effort)
  이라 실패해도 서버 로그에만 남기고 화면의 성공/실패 표시에는 영향 없음(주 수신인이 못 받은
  것과 참조인이 못 받은 건 다른 무게의 문제라서 분리).
- 발송 성공 시 DB patch에 `sender_cc_email`/`reference_email`/`reference_phone`도 같이
  저장(그 발송 건에 실제로 뭘 넣었는지 기록으로 남김).

## 4. 발송일자 표시 (관리자웹 3곳)

`adminShared.jsx`에 `locOf`/`personOf`처럼 공용 헬퍼 하나 추가 —
`sentLabel(q)`: `emailSentAt`/`kakaoSentAt` 중 있는 것만 "이메일 260728 · 카카오 260728"
형식으로 조합, 둘 다 없으면 "-".

이 헬퍼를 아래 세 곳에 적용:

- **자재·견적 신청내역 표** — 기존 "발행/승인/지급" 줄을 "발행/승인/지급/발송"으로 확장.
- **견적요청 상세내역 모달(`RequestDetailModal`)** — "발행일 / 승인일 / 지급일" 줄 아래에
  "발송일" 줄 신규 추가(지금은 아예 없어서 확인이 안 되던 부분).
- **현장정보 → 호기 상세창 견적내역 탭(`SitesAdmin.jsx`)** — 지금 "· 발송완료" 텍스트만
  나오는 걸 이 헬퍼가 만든 실제 날짜 문자열로 교체.

## 범위 밖

- 기사어플(모바일)의 PDF보기 관련 요청은 이번 스펙에서 제외(사용자가 취소함).
- 참조인 이메일/전화번호를 현장담당자 DB에서 자동으로 가져오는 기능 — 이번엔 항상 수동 입력.
