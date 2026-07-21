# 관리자웹 자재·견적 신청내역 처리 기능 설계

## 배경

`MaterialsAdmin.jsx`(관리자 콘솔 "자재·견적 신청내역" 화면)는 현재 읽기전용 상태 모니터
화면이다. 실제 처리(자재지급 완료, 견적 발행/승인/자재지급)는 모바일 앱의 관리자 모드
(`AdminTab.jsx`의 `MaterialRequestsScreen`/`QuoteRequestsScreen`)에서만 가능하다.

이 기능을 관리자웹에도 추가해, PC에서도 처리할 수 있게 한다. 모바일 UI를 그대로 옮기지
않고 웹 환경(마우스·넓은 화면)에 맞게 재구성한다.

## 범위

**포함:**
- 자재신청: 승인대기 → 지급완료 처리
- 견적요청: 요청접수 → 견적발행 → 승인 → 자재지급완료 (3단계 전환)

**제외 (모바일 전용으로 유지):**
- 자재신청 반려 처리, 반려건 재지급 대상으로 되돌리기 — 반려는 기사용 액션이라 관리자웹
  범위 밖 (사용자 확인됨: "반려는 기사용이고 웹페이지는 자재지급 관리자용")

## 구조

- `AdminApp.jsx`: `<MaterialsAdmin data={data} />` → `<MaterialsAdmin data={data} setData={setData} />`로 변경.
  다른 관리자 화면(TodosAdmin 등)과 동일한 관례.
- 액션 핸들러(지급완료/견적발행/승인/자재지급완료)는 `MaterialsAdmin.jsx` 안에 직접 작성한다.
  모바일처럼 `ElevatorFieldApp.jsx`를 거치지 않고, 이 화면이 supabase를 직접 호출하고
  `setData`로 로컬 상태를 갱신하는 관리자 콘솔 관례를 따른다.
- DB 쓰기 내용(상태값·컬럼명)과 자동 할일 생성 로직은 모바일 핸들러
  (`handleSupplyComplete`/`handleAdvanceQuote`/`handleCompleteQuoteSupply`, `ElevatorFieldApp.jsx`)와
  동일하게 복제한다.

## UI — 상호작용 패턴 (하이브리드)

입력이 필요 없는 전환은 목록 행에서 바로 클릭, 입력이 필요한 전환(사진·담당기사·금액)만
모달을 쓴다.

### 자재신청

- 승인대기 → 지급완료는 사진·담당기사·부품별 금액 입력이 필요해 항상 모달.
- 목록 행 "지급완료 처리" 버튼 → 모달:
  - 사진 첨부 (선택, `required` 아님 — 모바일과 동일하게 필수 아님, 사용자 확인됨: "선택사항으로 두자")
  - 담당 기사 선택: `<select>` 단일 선택, 기본값은 신청 기사
  - 부품별 금액 입력: 쉼표로 구분된 부품마다 금액 입력 가능 (모바일과 동일한 `parsePartQty` 파싱)
  - 확인 시: `material_requests.status = "지급완료"` + `supplied_date` 기록,
    `todos`에 D+30 확인서 제출 항목 자동 생성 (`billing_part`/`billing_amount` 포함)

### 견적요청

- 요청접수 → 견적발행: 입력 없음 → 행에 "견적발행 처리" 버튼, 클릭 즉시 처리
- 견적발행 → 승인: 입력 없음 → 행에 "승인 처리" 버튼, 클릭 즉시 처리
- 승인 → 자재지급완료: 사진(선택)+담당 기사(2명 이상 가능) 필요 → 모달
  - 담당 기사: 체크박스 목록으로 여러 명 선택 (모바일의 `MultiAssigneeSelect` 대신 웹에서는
    체크박스가 마우스로 더 빠름), 기본값은 신청 기사 1명 체크
  - 확인 시: `quote_requests.status = "자재지급완료"` + `supplied_date` 기록,
    선택된 담당 기사 수만큼 `todos` 각각 생성 (모바일과 동일)
- 자재지급완료 이후: 상태 표시만 (발행일/승인일/지급일 3개 날짜, 지금 화면과 동일)

## 공통 요소

- **사진 업로드**: `RoomAdmin.jsx`에 이미 있는 `<input type="file" multiple>` +
  `lib/photos.js`의 `uploadPhoto()` 패턴을 재사용한다. 두 곳(자재 모달, 견적 모달)에서만
  쓰이므로 별도 공용 컴포넌트로 분리하지 않고 `MaterialsAdmin.jsx` 안에 필요한 만큼만 작성한다.
- **에러 처리**: 다른 관리자 화면과 동일하게 — supabase 에러 발생 시 로컬 상태(`setData`)는
  갱신하지 않고 화면에 짧은 에러 문구만 표시한다.
- **v2 FK**: 관리자 콘솔은 v2 네이티브 관례를 따라, 새로 쓰는 `todos` insert에는 항상
  `unit_id`(`unitIdFor`)와 `assignee_id`(`profileIdByName`)를 채운다 (모바일의 `v2Ready`/
  `todoBillingReady` 조건부 분기 없이 관리자웹에서는 항상 포함).

## 자동 할일(Todo) 생성 side effect

지급완료/자재지급완료 처리 시 자동으로 `todos`에 D+30(`addDays(TODAY_STR, 30)`) 확인서
제출 기한 항목을 생성한다. 이는 모바일과 동일한 필수 업무 흐름이며 관리자웹에서도 반드시
재현해야 한다.
