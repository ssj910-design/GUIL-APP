# 승강기 기종별 에러코드집 — 설계

## 배경 / 목적

고장처리 시 기사가 승강기 제어반에 뜬 에러코드(예: OTIS Gen2의 "E-32")를 입력하지만,
지금은 자유 텍스트로 저장만 될 뿐(`failures.fault_error_code`) 그 코드가 무슨 뜻인지,
같은 코드가 과거에 어떻게 처리됐는지 확인할 방법이 없다. 기종별 에러코드 의미를
사전 등록해두고, 실제 처리 이력과 연결해 고장처리 중 바로 참고할 수 있게 한다.

## 데이터 모델

신규 테이블 `error_codes` 하나만 추가한다 (마이그레이션: `supabase/migrations/0XX_error_codes.sql`):

```sql
create table error_codes (
  id              text primary key default gen_random_uuid()::text,
  model           text not null,        -- units.model과 매칭 (예: "OTIS Gen2")
  code            text not null,        -- 예: "E-32"
  meaning         text,                 -- 코드 의미 (관리자 입력, 비어있을 수 있음)
  common_cause    text,                 -- 흔한 원인 (선택)
  standard_action text,                 -- 표준 조치법 (선택)
  created_at      timestamptz not null default now(),
  unique (model, code)
);
```

**기종 구분 기준**: `units.model` 문자열 하나로 구분한다(제조사+모델명이 이미 한 문자열로
들어있음 — 예: "OTIS Gen2", "현대 LUXEN"). 별도 manufacturer 조합 없음.

**처리이력용 별도 테이블은 만들지 않는다.** `failures`는 이미 `unit_id`로 `units`(model 보유)에
연결되어 있으므로, "이 코드의 과거 처리결과"는 그때그때 조인 쿼리로 가져온다:

```
failures.unit_id → units.id, units.model = X
  and failures.fault_error_code = Y
order by failures.created_at desc
```

**신규 코드 자동 등록**: 기사가 `error_codes`에 없는 `(model, code)` 조합을 입력해 고장처리결과
저장을 완료하면, `meaning = null`인 채로 자동 upsert한다. 관리자가 나중에 콘솔에서 의미를
채워넣을 수 있다. 관리자의 사전 등록(매뉴얼 기반)과 기사 입력의 자동 축적이 같은 테이블로
합쳐진다.

**매칭 방식**: 문자열 완전일치(대소문자/공백 정규화 없음). 기종 표기가 어긋나면(오타 등)
매칭되지 않아 이력이 안 보일 수 있음 — 1차 버전에서는 허용하고, 실제로 문제가 되면 관리자가
콘솔에서 정리한다.

## 관리자 콘솔 — `app/components/admin/ErrorCodesAdmin.jsx` (신규)

기존 admin 화면 패턴을 그대로 따른다:
- `AdminApp.jsx`의 `MENU`에 항목 추가, 셸의 upfront 데이터 로딩에 `error_codes` 테이블 추가해
  props로 내려받음 (다른 admin 화면과 동일한 관례 — 셸의 로딩 방식은 바꾸지 않음).
- 화면 구성:
  - 상단: 기종(model) 필터 드롭다운 + 코드/의미 검색창
  - 목록 테이블: 기종 / 코드 / 의미(비어있으면 "미등록" 배지) / 처리이력 건수
  - 행 클릭 → 상세 시트: 의미·흔한원인·표준조치법 수정 폼 + 하단에 과거 처리이력
    (날짜·현장·증상·원인·처리내용, 최신순)
  - "코드 수동 등록" 버튼(기종+코드 직접 입력, 매뉴얼 기반 사전등록용)
- 수정/등록은 admin 화면에서 직접 `supabase` 호출(다른 admin/*.jsx와 동일 패턴).

## 기사 앱 — 고장처리결과 입력(`ArrivalResultModal`, `FailureTab.jsx`) 통합

- 에러코드 `<input>`을 `<input list="error-code-options">` + `<datalist>`로 교체
  (네이티브 콤보박스 — 목록에 없는 값도 자유 입력 가능, 기존 UX 그대로 유지하면서 자동완성만 추가).
- 모달이 열릴 때 해당 실패건의 `unit.model`로 필터링한 `error_codes` 목록을 1회 조회해
  `<datalist>` 옵션으로 채운다.
- 입력값이 기존 코드와 일치하면 입력란 바로 아래에 접이식 카드로 "의미"와 "과거 처리사례 N건"
  (최근 몇 건, 기존 `HistoryCard` 재사용)을 보여준다. 일치하지 않으면 아무것도 표시하지 않는다
  (저장 시 신규 코드로 자동 등록됨).
- 이력 0건: "아직 처리된 사례가 없습니다". 의미 미등록: "의미 미등록" 배지만 표시하고 이력은
  정상 노출.

## 기사 앱 — 에러코드집 조회 (신규 탭 아님, `FailureTab.jsx` 내 서브 화면)

새 하단 탭을 만들지 않는다(컴포넌트 구조 규칙 — 탭의 하위 화면·모달은 같은 파일에 둔다).
`FailureTab.jsx` 상단에 "에러코드집" 진입 버튼을 추가해 서브 화면으로 연다.

- 기종 선택(드롭다운) → 코드 검색 → 목록(코드+의미 요약) → 클릭 시 상세
  (의미·원인·조치법 + 과거 처리이력)
- 읽기 전용. 의미 수정은 관리자 콘솔에서만 가능.

## 매퍼

`lib/mappers.js`에 `error_codes` row ↔ camelCase 변환 함수 추가 (기존 패턴과 동일).

## 테스트 방침

- 신규 로직(코드 매칭, 자동 upsert 조건)은 소규모 유닛 테스트 또는 self-check 스크립트로
  최소 검증(예: 매칭/미매칭/신규코드 upsert 케이스).
- UI는 `npm run dev`로 실기기 플로우 확인: 처리결과 입력 시 자동완성 노출, 이력 카드 표시,
  관리자 콘솔에서 의미 등록 후 기사 앱에 반영되는지.
- `npm run build` 통과 확인 후 push(팀 규칙).
