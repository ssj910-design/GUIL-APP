# 견적 발행+발송 통합 (청구스 스타일 단일화면) 설계

## 배경

청구스(chungoose.ai) 참고 — 지금은 견적 품목편집(`QuoteItemsModal.jsx`, 발행)과 견적 발송
(`QuoteSendModal.jsx`, 발송)이 완전히 분리된 두 모달이다. 관리자가 견적을 발행하고 나서
곧바로 보내는 경우가 많은데도 매번 "품목 수정 → 발행 확정 → (모달 닫힘) → 발송 →
채널·수신처 입력 → 발송" 두 단계를 거쳐야 한다.

이번 통합은 청구스 참고 화면(사용자 첨부 스크린샷)처럼 하나의 화면에서 품목 입력과
수신처/발송 설정을 동시에 하고, "저장"(발행만) 또는 "바로 발송하기"(발행+발송) 중 하나를
선택해 끝낼 수 있게 한다. "발행 후 검토하고 나중에 보낸다"는 기존 흐름은 "저장" 버튼으로
유지되고, 이미 발행된 견적을 나중에 다시 보내는 경우는 기존 발송 모달을 "재발송" 전용으로
격하해 그대로 쓴다.

## 1. 파일 구조 — 공유 컴포넌트로 분리

`QuoteSendModal.jsx`의 본문(공급자/고객 정보 2단, 담당자 드롭다운, 안내메시지, 첨부파일,
채널 체크박스)이 새 통합 화면에도 그대로 필요하다. 두 곳에 복붙하면 두 파일 다 비대해지고
로직이 어긋날 위험이 있으므로, 이 부분을 새 공유 컴포넌트로 뽑는다.

- **신설: `app/components/admin/QuoteRecipientFields.jsx`** — 두 개를 내보낸다.
  1. **`useQuoteRecipientFields(quote, site, siteManagers, profiles)`** 훅 — 지금
     `QuoteSendModal.jsx`가 갖고 있는 모든 상태(email, phone, senderCcEmail,
     referenceEmail, referencePhone, sendEmail, sendKakao, noticeMessage, attachments,
     uploading, attachError, supplierId, supplierCcId, customerManagerId, customerCcId 등)와
     그 파생값(supplier, otherManagers, `canSend`)과 조작 함수(selectCustomerManager,
     selectCustomerCc, selectSupplierCc, handleFiles, removeAttachment)를 그대로 옮겨
     `{ values, setters, canSend }` 형태로 반환한다. **상태는 훅을 호출한 부모
     컴포넌트가 소유한다** — 콜백이나 ref 방식이 아니라 일반적인 "부모가 훅을 호출해
     상태와 세터를 얻고, 그걸 그대로 자식에 props로 내려주는" 패턴.
  2. **`QuoteRecipientFields({ values, setters, site, siteManagers, profiles })`** —
     위 훅이 반환한 값을 props로 받아 렌더링만 하는 순수 표시 컴포넌트(공급자/고객 2단
     정보, 담당자/참조 드롭다운, 안내메시지 textarea, 첨부파일 드래그드롭, 채널
     체크박스). 상태를 직접 만들지 않는다.
  - `QuoteItemsModal.jsx`와 `QuoteSendModal.jsx` 둘 다 `useQuoteRecipientFields`를 호출해
    상태를 얻고, `QuoteRecipientFields`에 그 값을 내려 렌더링한 뒤, 각자의 제출
    핸들러(저장/바로 발송하기, 재발송)에서 훅이 반환한 `values`/`canSend`를 직접 읽어
    쓴다.

- **`QuoteItemsModal.jsx`** — 기존 품목편집+운반비/안전관리비/이윤+소계/할인+실시간
  미리보기 위에 `QuoteRecipientFields`를 얹는다. 하단 버튼을 "취소/발행 확정" 2개에서
  "취소/저장/바로 발송하기" 3개로 바꾼다. `MaterialsAdmin.jsx`의 "+ 새 견적 발행"(신규)과
  "품목 수정"(기존 편집) 두 진입점 모두 이 모달 하나로 통일한다(지금도 이 모달이 신규/
  편집 둘 다 처리하고 있으므로 진입점 자체는 안 바뀐다).

- **`QuoteSendModal.jsx`** — 유지하되 내부를 `QuoteRecipientFields` 재사용으로 리팩터링해
  중복 코드를 제거한다. 사용자 노출 문구만 변경: 모달 타이틀 "OO 견적 발송" → "OO 견적
  재발송", 하단 버튼 "발송" → "재발송". `MaterialsAdmin.jsx` 목록에서 이 모달을 여는
  버튼도 라벨만 "발송" → "재발송"으로 바꾼다 — **노출 조건(상태가 `견적발행` 이상일 때
  표시)은 그대로 둔다.** "이미 한 번 보낸 건에만 노출"같은 새 게이팅 로직은 만들지 않는다
  (한 번도 안 보내고 저장만 해둔 견적도 이 버튼으로 보낼 수 있어야 "저장 후 나중에 발송"
  흐름이 성립하기 때문).

## 2. 저장 / 바로 발송하기 동작

- **저장**: 지금의 "발행 확정"과 완전히 동일 — `/api/generate-quote-pdf` 호출 →
  `quote_items`/`transportCost`/`safetyCost`/`profit`/`quoteNumber`/`recipientName`/
  `quoteTitle`/`quoteIssuedDate`/`quotePdfUrl` 저장, 상태 `견적발행`으로 전환.
  `QuoteRecipientFields`에 입력해둔 값(수신처, 안내메시지, 첨부파일, 채널 체크박스)은
  이번 저장에는 **전혀 반영되지 않는다** — 나중에 이 모달을 다시 열거나 재발송 모달을
  열 때를 위해 화면에는 남아 있지만 서버로 안 보낸다.
- **바로 발송하기**: 저장과 동일하게 PDF 생성·`quote_items` 등 저장을 먼저 수행한 뒤,
  그 응답으로 받은 새 `pdfUrl`을 그대로 사용해 이어서 `/api/send-quote`를 호출한다(현재
  `quote.quotePdfUrl`이 비어 있는 신규 발행 건도 정상 동작해야 하므로, 오래된
  `quote.quotePdfUrl`이 아니라 방금 생성된 pdfUrl을 넘긴다). `QuoteRecipientFields`가
  계산한 `canSend`가 `false`면 버튼 자체가 비활성화된다(체크한 채널 없음 또는 필수
  수신처 미입력) — 지금 `QuoteSendModal`과 동일한 안전장치.
- **에러 처리**: PDF 생성 자체가 실패하면 지금처럼 에러 메시지만 보여주고 아무것도 저장하지
  않는다(기존 동작 유지). PDF 생성·저장은 성공했는데 발송(이메일/카카오)이 실패하면, 발행은
  이미 완료된 상태로 남고(롤백하지 않음) 채널별 성공/실패 메시지만 지금과 동일하게
  보여준다.
- 저장이든 바로 발송하기든, 완료 시 부모(`MaterialsAdmin.jsx`)로 전달하는 `onSaved` patch는
  품목편집 쪽 필드(quote_items 등)와 발송 쪽 필드(recipientEmail, sendLog 등 — 바로
  발송하기를 눌렀을 때만)를 하나로 합쳐서 한 번에 전달한다.

## 3. 화면 레이아웃 (모달 유지, `wide="2xl"`)

모달 형태를 그대로 유지한다(스크린샷처럼 전체 페이지로 바꾸지 않음) — 관리자 콘솔 전체가
`Modal` 오버레이 패턴을 쓰고 있어서 구조 변경 없이 넓히기만 하면 된다.

세로 순서: **공급자|고객 정보(2단, `QuoteRecipientFields` 상단부)** → **좌(기존 입력폼:
기사요청원본·기본정보·품목테이블·운반비 등·소계/할인)｜우(실시간 미리보기) 2단(기존
그대로)** → **안내메시지** → **첨부파일** → **채널 체크박스** → 에러/발송결과 메시지 →
**취소 / 저장 / 바로 발송하기**.

## 4. 범위 밖

- 스크린샷의 "사업자/개인" 고객유형 토글 — 만들지 않는다(이전 단계에서도 제외한 기능).
- "승인 처리", "PDF 보기" 버튼과 그 동작 — 손대지 않는다.
- "재발송" 버튼의 노출 조건을 "이미 보낸 적 있는 건만" 으로 좁히는 것 — 하지 않는다
  (§1 참고, 저장만 해둔 견적도 재발송 모달로 처음 보낼 수 있어야 함).
- 카카오 알림톡 발송 로직(`lib/alimtalk.js`) — 이번 통합과 무관, 절대 건드리지 않는다
  (승인된 알리고 템플릿 고정 문구 제약, 과거 여러 차례 확인된 사항).
