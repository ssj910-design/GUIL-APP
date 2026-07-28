# 견적 발송 비고/안내메시지/첨부파일 (3단계) 설계

## 배경

청구스(chungoose.ai) 참고 3단계 — 견적 발송 모달(`QuoteSendModal.jsx`)에 비고, 안내메시지,
첨부파일을 추가한다. 청구스 화면에서는 이 항목들이 견적서 문서 자체(품목편집 화면)에 있지만,
우리는 발송 모달에 둔다 — PDF 견적서 양식은 이번에도 그대로 유지한다(1단계부터 지켜온 제약).

**중요한 제약**: 카카오 알림톡은 알리고(Aligo)에 승인받은 템플릿 문구와 정확히 일치해야
발송된다(변수는 현장명/견적명/견적일/링크 4개만 허용, 나머지는 고정 텍스트 —
`docs/superpowers/plans/2026-07-27-quote-send-email-kakao-plan.md:18-33`). 안내메시지를
카카오에 넣으려면 새 변수가 포함된 템플릿을 알리고에 다시 신청해 카카오 승인을 받아야 하고,
이는 며칠 걸리는 외부 절차다. **이번 작업은 이메일에만 안내메시지를 반영**하고, 카카오
템플릿 재승인 신청은 `docs/HANDOFF.md`에 대기 항목으로 남긴다 — 승인 완료 후 정확히 승인된
문구를 알려주면 그때 `lib/alimtalk.js`를 별도로 업데이트한다.

## 1. 비고

- 발송 모달에 여러 줄 텍스트박스로 추가.
- **내부 기록용 메모다** — 이메일·카카오 어디에도 들어가지 않는다. 발송 시
  `quote_requests.remarks`에 저장만 된다(나중에 참조용).

## 2. 안내메시지

- 발송 모달에 여러 줄 텍스트박스로 추가(리치텍스트 에디터 아님 — 새 라이브러리 없이
  `<textarea>`).
- 이메일 본문에 반영: `lib/email.js`의 `buildBody`/`buildHtml`이 서명 줄 아래에 안내메시지를
  추가로 붙인다(줄바꿈만 `<br>`로 변환, 굵게·색상 등 서식 없음). 비어 있으면 아무것도
  추가되지 않는다(지금과 동일).
- 카카오는 이번엔 반영하지 않는다(위 "중요한 제약" 참고).
- 발송 시 `quote_requests.notice_message`에 저장(실제 보낸 내용의 감사 기록).

## 3. 첨부파일

- 발송 모달에 드래그드롭 영역 + "파일 찾기" 버튼 (네이티브 HTML5 drag/drop 이벤트, 새
  라이브러리 없음).
- 제한: 최대 10개, 파일당 25MB (청구스와 동일). 초과 시 그 파일은 추가하지 않고 안내 문구를
  보여준다.
- 업로드: `lib/photos.js`의 `uploadPhoto(file, folder)`를 그대로 재사용(이미지 전용이
  아니라 범용 Supabase Storage 업로드) — `quotes/{quoteRequestId}/attachments/` 경로에
  올린다.
- 업로드된 파일은 `{ name, url }` 목록으로 화면에 표시되고, 각 항목에 삭제(제거) 버튼이
  있다(발송 전 목록에서만 빼는 것 — 실제 Storage 파일 삭제는 안 함, 기존 사진 업로드
  위젯들과 동일한 관례).
- 발송 시 이메일의 실제 첨부파일로 추가된다 — 기존 PDF·명함 이미지 뒤에 이어 붙는다.
  파일명은 업로드 시 저장해둔 원본 파일명을 그대로 쓴다.
- 카카오는 원래도 링크 방식(첨부파일 개념 없음)이라 변경 없음.
- 발송 시 `quote_requests.attachment_urls`(jsonb 배열, `{ name, url }` 객체들)에 저장.

## 4. 데이터 흐름

- 마이그레이션: `quote_requests`에 `remarks text`, `notice_message text`,
  `attachment_urls jsonb not null default '[]'::jsonb` 추가.
- `lib/mappers.js`의 `mapQuoteRequest`에 `remarks`/`noticeMessage`/`attachmentUrls` 매핑
  추가.
- `QuoteSendModal`이 발송 시 `remarks`, `noticeMessage`, `attachmentUrls`를
  `/api/send-quote` 요청 바디에 실어 보내고, 성공하면 로컬 상태(`onSaved` patch)와 DB
  patch 양쪽에 저장한다(기존 `recipientEmail` 등과 동일한 패턴).
- `/api/send-quote/route.js`가 `noticeMessage`/`attachmentUrls`를 `sendQuoteEmail`에
  전달한다. `sendQuoteAlimtalk` 호출에는 전달하지 않는다(카카오는 이번 범위 밖).

## 범위 밖

- 카카오 알림톡에 안내메시지 반영 — 템플릿 재승인 후 별도 작업(`docs/HANDOFF.md`에 대기
  항목 등록).
- 리치텍스트 서식(굵게/기울임/색상 등) — 이번엔 일반 텍스트박스.
- PDF 견적서 양식 변경 — 그대로 유지.
- 첨부파일의 Storage 실제 삭제(목록에서 제거만, 파일 자체는 안 지움).
