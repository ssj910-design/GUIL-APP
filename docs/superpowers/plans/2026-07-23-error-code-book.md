# 승강기 기종별 에러코드집 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 고장처리결과 입력 시 기종별 에러코드를 자동완성으로 추천하고, 같은 코드의 과거 처리이력(의미·원인·처리내용)을 기사와 관리자가 조회할 수 있게 한다.

**Architecture:** 신규 테이블 `error_codes`(기종+코드 unique) 하나만 추가한다. 과거 처리이력은 별도 테이블 없이 `failures.unit_id → units.model` 조인으로 그때그때 조회한다. 기사가 미등록 코드로 처리결과를 저장하면 `meaning=null`로 자동 upsert되어 코드집이 저절로 쌓이고, 관리자가 나중에 의미를 채운다.

**Tech Stack:** Next.js 16(App Router) + React 19 + Supabase(`@supabase/supabase-js`). 신규 의존성 없음. 이 저장소엔 테스트 러너가 없다 — 순수 로직도 기존 `lib/utils.js`의 다른 헬퍼(`parseErrorCode`, `unitHistory` 등)와 동일하게 자동테스트 없이 브라우저 수동확인으로 검증한다.

## Global Constraints

- 참조 설계서: `docs/superpowers/specs/2026-07-23-error-code-book-design.md`
- Supabase는 실운영 DB이고 RLS가 꺼져 있다. 기존 데이터 삭제·수정 테스트 금지. 이 기능이 새로 만드는 행(에러코드 등록 등)은 정상 사용이므로 허용.
- 새 테이블은 Claude가 직접 CREATE/ALTER 하지 않는다 — `supabase/migrations/`에 `_DRAFT` 파일만 작성한다. 팀이 Supabase SQL Editor에서 직접 실행하기 전까지는 `error_codes` 관련 코드가 있어도 조회 결과는 항상 빈 배열이다(다른 v2 테이블과 동일한 "테이블 없으면 error → 빈 배열" 패턴 — 앱이 깨지지 않는다).
- 기종 구분은 `units.model` 문자열 하나로 한다. 매칭은 문자열 완전일치(대소문자·공백 정규화 없음).
- 새 하단 탭을 만들지 않는다 — 기사용 조회 화면은 `FailureTab.jsx`의 서브탭으로 추가한다(탭의 하위 화면은 같은 파일 안에 둔다는 이 저장소의 컴포넌트 구조 규칙).
- 새 UI는 `ui.jsx`/`app/components/admin/adminShared.jsx`의 기존 부품(Sheet, Modal, AdminTable, inputCls 등)을 재사용한다.
- `main` 푸시 전 `npm run build` 통과 필수.
- 각 태스크는 커밋 후 `git push`까지 한다(커밋을 로컬에 쌓아두지 않는다). 커밋 메시지에 `[deploy]`는 넣지 않는다(사용자가 배포를 명시적으로 요청할 때만).

---

## File Structure

| 파일 | 변경 | 책임 |
|---|---|---|
| `supabase/migrations/051_error_codes_DRAFT.sql` | 신규 | `error_codes` 테이블 정의 (팀이 수동 실행) |
| `lib/utils.js` | 수정 | `findErrorCode`, `errorCodeHistory` 순수 함수 |
| `lib/mappers.js` | 수정 | `mapErrorCode` (DB row → camelCase) |
| `app/components/ElevatorFieldApp.jsx` | 수정 | `error_codes` 로딩, 처리결과 저장 시 미등록 코드 자동 upsert, `FailureTab`에 prop 전달 |
| `app/components/tabs/FailureTab.jsx` | 수정 | `ArrivalResultModal` 자동완성/이력 표시, 신규 `에러코드집` 서브탭(`ErrorCodeBook`) |
| `app/components/admin/ErrorCodesAdmin.jsx` | 신규 | 관리자 콘솔 — 코드 등록/의미 수정 + 처리이력 조회 |
| `app/components/admin/AdminApp.jsx` | 수정 | 메뉴 항목 추가, `error_codes` 로딩, `ErrorCodesAdmin` 라우팅 |

---

### Task 1: DB 마이그레이션 초안

**Files:**
- Create: `supabase/migrations/051_error_codes_DRAFT.sql`

**Interfaces:**
- Produces: `public.error_codes` 테이블 — 컬럼 `id uuid`, `model text`, `code text`, `meaning text`, `common_cause text`, `standard_action text`, `created_at timestamptz`, unique 제약 `(model, code)`. (이후 모든 태스크가 이 스키마를 전제로 한다.)

- [ ] **Step 1: 마이그레이션 파일 작성**

`supabase/migrations/051_error_codes_DRAFT.sql`:

```sql
-- ============================================================
-- 051. [초안] error_codes — 승강기 기종별 에러코드집
-- 기사가 고장처리결과에 입력하는 에러코드를 기종별로 등록해두고,
-- 과거 처리이력(failures.unit_id → units.model 조인)과 함께 조회하기 위한 테이블.
-- ⚠️ 팀 상의 후 Supabase SQL Editor에서 직접 실행할 것 — Claude가 자동 실행하지 않는다.
-- ============================================================
create table if not exists public.error_codes (
  id              uuid primary key default gen_random_uuid(),
  model           text not null,        -- units.model과 문자열 완전일치로 매칭 (예: "OTIS Gen2")
  code            text not null,        -- 예: "E-32"
  meaning         text,                 -- 코드 의미 (관리자 입력, 비어있을 수 있음)
  common_cause    text,                 -- 흔한 원인 (선택)
  standard_action text,                 -- 표준 조치법 (선택)
  created_at      timestamptz not null default now(),
  unique (model, code)
);

-- 검증: 유니크 제약이 걸렸는지 확인
select conname from pg_constraint where conrelid = 'public.error_codes'::regclass and contype = 'u';
```

- [ ] **Step 2: 다른 DRAFT 마이그레이션과 형식이 일치하는지 자체 검토**

`supabase/migrations/048_profiles_staff_fields_DRAFT.sql`을 열어 헤더 주석 형식·`if not exists` 사용 여부를 비교한다. Supabase에 직접 실행하지 않는다(실운영 DB — 팀 상의 후 팀이 실행).

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/051_error_codes_DRAFT.sql
git commit -m "$(cat <<'EOF'
error_codes 테이블 마이그레이션 초안 추가

기종별 에러코드집 기능의 기반 테이블. Supabase SQL Editor에서
팀이 직접 실행해야 함 — 이 커밋은 파일만 추가한다.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
git push
```

---

### Task 2: 매칭/이력 순수 함수 + 매퍼

**Files:**
- Modify: `lib/utils.js` (기존 `unitHistory` 함수 뒤, 약 340번째 줄)
- Modify: `lib/mappers.js` (기존 `mapUnit` 함수 뒤, 약 325번째 줄)

**Interfaces:**
- Produces:
  - `findErrorCode(errorCodes, model, code)` → `error_codes` 매핑 객체 또는 `null`
  - `errorCodeHistory(failures, units, model, code)` → `failures` 매핑 객체 배열(최신순)
  - `mapErrorCode(row)` → `{ id, model, code, meaning, commonCause, standardAction, createdAt }`

- [ ] **Step 1: 스크래치 스크립트로 매칭/이력 로직을 먼저 검증**

`lib/utils.js`에 넣기 전에, 알고리즘이 맞는지 던지기용 스크립트로 먼저 확인한다(저장소에 커밋하지 않음).

`C:\Users\crewj\AppData\Local\Temp\claude\C--Users-crewj-OneDrive-----------------\935edfa8-2e02-4d7e-9077-b3099f14ac26\scratchpad\errorcode-check.js` 생성:

```js
function findErrorCode(errorCodes, model, code) {
  return errorCodes.find((e) => e.model === model && e.code === code) ?? null;
}
function errorCodeHistory(failures, units, model, code) {
  const unitIds = new Set(units.filter((u) => u.model === model).map((u) => u.id));
  return failures
    .filter((f) => unitIds.has(f.unitId) && f.faultErrorCode === code && f.createdAt)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

const errorCodes = [
  { id: "e1", model: "OTIS Gen2", code: "E-32", meaning: "도어 닫힘 이상" },
  { id: "e2", model: "현대 LUXEN", code: "E-32", meaning: "다른 기종의 다른 뜻" },
];
const units = [
  { id: "u1", model: "OTIS Gen2" },
  { id: "u2", model: "현대 LUXEN" },
];
const failures = [
  { id: "f1", unitId: "u1", faultErrorCode: "E-32", createdAt: "2026-07-01T00:00:00Z", siteName: "A" },
  { id: "f2", unitId: "u1", faultErrorCode: "E-99", createdAt: "2026-07-02T00:00:00Z", siteName: "A" }, // 다른 코드 — 제외돼야 함
  { id: "f3", unitId: "u2", faultErrorCode: "E-32", createdAt: "2026-07-03T00:00:00Z", siteName: "B" }, // 다른 기종 — 제외돼야 함
  { id: "f4", unitId: "u1", faultErrorCode: "E-32", createdAt: "2026-07-05T00:00:00Z", siteName: "A" },
];

console.assert(findErrorCode(errorCodes, "OTIS Gen2", "E-32")?.id === "e1", "매칭 실패");
console.assert(findErrorCode(errorCodes, "OTIS Gen2", "E-99") === null, "미매칭이어야 함");
const hist = errorCodeHistory(failures, units, "OTIS Gen2", "E-32");
console.assert(hist.length === 2, `이력 2건이어야 하는데 ${hist.length}건`);
console.assert(hist[0].id === "f4", "최신순 정렬 실패(가장 최근인 f4가 먼저 와야 함)");
console.log("OK — 모든 sanity check 통과");
```

Run: `node "C:\Users\crewj\AppData\Local\Temp\claude\C--Users-crewj-OneDrive-----------------\935edfa8-2e02-4d7e-9077-b3099f14ac26\scratchpad\errorcode-check.js"`

Expected: `OK — 모든 sanity check 통과` 한 줄만 출력되고 `console.assert` 실패 메시지(Assertion failed)가 없어야 한다.

- [ ] **Step 2: `lib/utils.js`에 실제 구현 추가**

`unitHistory` 함수(약 328~340번째 줄) 바로 뒤에 추가:

```js

// 이 기종(model)의 이 에러코드(code)가 error_codes에 등록돼 있으면 그 항목을 반환.
// 문자열 완전일치 — 대소문자·공백 정규화 없음(오타로 인한 미매칭은 관리자가 코드집에서 정리).
export function findErrorCode(errorCodes, model, code) {
  return errorCodes.find((e) => e.model === model && e.code === code) ?? null;
}

// 같은 기종(units.model)·같은 에러코드로 과거에 처리된 고장 이력 — 최신순.
// 별도 이력 테이블 없이 failures.unitId → units.model 조인으로 그때그때 계산한다.
export function errorCodeHistory(failures, units, model, code) {
  const unitIds = new Set(units.filter((u) => u.model === model).map((u) => u.id));
  return failures
    .filter((f) => unitIds.has(f.unitId) && f.faultErrorCode === code && f.createdAt)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}
```

- [ ] **Step 3: `lib/mappers.js`에 `mapErrorCode` 추가**

`mapUnit` 함수 뒤, `mapSiteAssignment` 함수 앞(약 325번째 줄)에 추가:

```js

export function mapErrorCode(row) {
  return {
    id: row.id,
    model: row.model,
    code: row.code,
    meaning: row.meaning,
    commonCause: row.common_cause,
    standardAction: row.standard_action,
    createdAt: row.created_at,
  };
}
```

- [ ] **Step 4: 스크래치 스크립트 삭제**

```bash
rm "C:\Users\crewj\AppData\Local\Temp\claude\C--Users-crewj-OneDrive-----------------\935edfa8-2e02-4d7e-9077-b3099f14ac26\scratchpad\errorcode-check.js"
```

- [ ] **Step 5: Commit**

```bash
git add lib/utils.js lib/mappers.js
git commit -m "$(cat <<'EOF'
에러코드 매칭·이력조회 순수 함수와 매퍼 추가

findErrorCode/errorCodeHistory(lib/utils.js)와 mapErrorCode(lib/mappers.js).
다음 태스크(앱 셸 로딩, 처리결과 입력 화면)가 이 함수들을 사용한다.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
git push
```

---

### Task 3: 앱 셸 — `error_codes` 로딩 + 자동등록 + `FailureTab`에 전달

**Files:**
- Modify: `app/components/ElevatorFieldApp.jsx`

**Interfaces:**
- Consumes: `mapErrorCode` (Task 2, `lib/mappers.js`)
- Produces: `errorCodes` state(App 컴포넌트) → `<FailureTab errorCodes={errorCodes} .../>` prop. `handleFailureResult`가 저장 시 미등록 `(model, code)`를 `error_codes`에 upsert.

- [ ] **Step 1: `mapErrorCode` import 추가**

`app/components/ElevatorFieldApp.jsx` 7번째 줄:

```js
import { mapSite, mapSiteManager, mapFailure, mapInspection, mapMaterialRequest, mapTodo, mapQuoteRequest, mapBilling, mapRestockRequest, mapFeedPost, mapUnit, mapKitStock, mapSelfCheck, mapAttendance, mapDutySchedule, mapDutySwap } from "@/lib/mappers";
```

를

```js
import { mapSite, mapSiteManager, mapFailure, mapInspection, mapMaterialRequest, mapTodo, mapQuoteRequest, mapBilling, mapRestockRequest, mapFeedPost, mapUnit, mapKitStock, mapSelfCheck, mapAttendance, mapDutySchedule, mapDutySwap, mapErrorCode } from "@/lib/mappers";
```

로 바꾼다.

- [ ] **Step 2: `errorCodes` state 추가**

94번째 줄:

```js
  const [units, setUnits] = useState([]); // v2: 호기 목록 (마이그레이션 전 DB에서는 빈 배열)
```

바로 뒤에 추가:

```js
  const [errorCodes, setErrorCodes] = useState([]); // v2: 에러코드집 (마이그레이션 전 DB에서는 빈 배열)
```

- [ ] **Step 3: `loadData`의 `Promise.all`에 `error_codes` 조회 추가**

`const [sitesRes, ... leaveRes,] = await Promise.all([...]);` 블록에서 `unitsRes,` 바로 뒤(destructure)와 `supabase.from("units").select("*").order("seq"),` 바로 뒤(fetch 목록)에 각각 추가:

```js
      const [
        sitesRes,
        siteManagersRes,
        failuresRes,
        inspectionsRes,
        materialRes,
        todosRes,
        quoteRes,
        billingsRes,
        restockRes,
        feedRes,
        engineersRes,
        unitsRes,
        errorCodesRes,
        kitStockRes,
        selfChecksRes,
        attendanceRes,
        dutyRes,
        dutySwapRes,
        leaveRes,
      ] = await Promise.all([
        supabase.from("sites").select("*"),
        supabase.from("site_managers").select("*"),
        supabase.from("failures").select("*").order("created_at", { ascending: false }),
        supabase.from("inspections").select("*"),
        supabase.from("material_requests").select("*").order("created_at", { ascending: false }),
        supabase.from("todos").select("*").order("created_at", { ascending: false }),
        supabase.from("quote_requests").select("*").order("created_at", { ascending: false }),
        supabase.from("billings").select("*").order("created_at", { ascending: false }),
        supabase.from("restock_requests").select("*").order("created_at", { ascending: false }),
        supabase.from("feed_posts").select("*").order("created_at", { ascending: true }), // 카톡식: 오래된 글이 위, 최신이 아래
        supabase.from("profiles").select("*").order("name"),
        supabase.from("units").select("*").order("seq"),
        supabase.from("error_codes").select("*"),
        supabase.from("kit_stock").select("*"),
        supabase.from("self_checks").select("*"),
        supabase.from("attendances").select("*").eq("work_date", TODAY_STR),
        supabase.from("duty_schedules").select("*").gte("duty_date", TODAY_STR.slice(0, 8) + "01").order("duty_date"),
        supabase.from("duty_swaps").select("*"),
        supabase.from("leaves").select("*").lte("start_date", TODAY_STR).gte("end_date", TODAY_STR),
      ]);
```

(이 블록 전체를 원래 블록과 교체 — 원래는 `errorCodesRes,`와 `supabase.from("error_codes").select("*"),` 두 줄이 없다.)

- [ ] **Step 4: `setErrorCodes` 호출 추가**

```js
      setUnits((unitsRes.data ?? []).map(mapUnit)); // 테이블 없으면(마이그레이션 전) error → 빈 배열
```

바로 뒤에 추가:

```js
      setErrorCodes((errorCodesRes.data ?? []).map(mapErrorCode)); // 테이블 없으면(마이그레이션 전) error → 빈 배열
```

- [ ] **Step 5: `handleFailureResult`에 코드 trim + 미등록 코드 자동등록 추가**

기존 함수(701~749번째 줄) 전체를 다음으로 교체:

```js
  async function handleFailureResult(failure, payload) {
    const { result, symptom, cause, processContent, note, photoCount, photoUrls } = payload;
    const errorCode = (payload.errorCode || "").trim();
    const isClosed = result === "처리완료" || result === "오신고";
    // 지원요청·운행정지 = 혼자 못 끝냄 → 미배정(미처리)으로 되돌려 지원 갈 기사가 이어받게 한다.
    // 출동 기록(배정자·출발·ETA·도착)을 초기화하되, escalation은 남겨 위험 상태로 표시한다.
    const isEscalation = result === "지원요청" || result === "운행정지";
    if (result === "처리완료") markAtSite(failure, "처리완료"); // 완료한 그 현장 = 마지막 위치
    const escalation = isClosed ? null : result;
    const statePatch = isClosed
      ? { status: "완료" }
      : isEscalation
      ? { status: "미처리", assignee: null, dispatched_at: null, eta_minutes: null, arrival_time: null, ...(v2Ready ? { assignee_id: null } : {}) }
      : { status: failure.status };
    await supabase
      .from("failures")
      .update({
        ...statePatch,
        process_result: result,
        escalation,
        fault_symptom: symptom || null,
        fault_error_code: errorCode || null,
        fault_cause: cause || null,
        process_content: processContent || null,
        process_note: note || null,
        photo_count: photoCount || 0,
        photo_urls: photoUrls?.length ? photoUrls : null,
      })
      .eq("id", failure.id);
    setFailures((prev) =>
      prev.map((x) =>
        x.id === failure.id
          ? {
              ...x,
              status: isClosed ? "완료" : isEscalation ? "미처리" : x.status,
              ...(isEscalation ? { assignee: null, assigneeId: null, dispatchedAt: null, etaMinutes: null, arrivalTime: null } : {}),
              processResult: result,
              escalation,
              faultSymptom: symptom || null,
              faultErrorCode: errorCode || null,
              faultCause: cause || null,
              processContent: processContent || null,
              processNote: note || null,
              photoCount: photoCount || 0,
              photoUrls: photoUrls ?? [],
            }
          : x
      )
    );
    // 에러코드집에 없는 (기종, 코드) 조합이면 의미 미등록 상태로 자동 등록 — 다음에 같은 코드가
    // 나오면 이 처리 이력이 조회되도록 코드집을 자연스럽게 쌓는다.
    const unit = units.find((u) => u.id === failure.unitId);
    if (unit?.model && errorCode && !errorCodes.some((e) => e.model === unit.model && e.code === errorCode)) {
      const { data: inserted } = await supabase
        .from("error_codes")
        .upsert({ model: unit.model, code: errorCode }, { onConflict: "model,code" })
        .select()
        .maybeSingle();
      if (inserted) setErrorCodes((prev) => [...prev, mapErrorCode(inserted)]);
    }
  }
```

- [ ] **Step 6: `<FailureTab>`에 `errorCodes` prop 전달**

```jsx
            <FailureTab
              onReported={handleFailureReported}
              attendances={attendances}
              todayLeaves={todayLeaves}
              failures={failures}
              setFailures={setFailures}
```

를

```jsx
            <FailureTab
              onReported={handleFailureReported}
              attendances={attendances}
              todayLeaves={todayLeaves}
              failures={failures}
              errorCodes={errorCodes}
              setFailures={setFailures}
```

로 바꾼다.

- [ ] **Step 7: 빌드 확인**

Run: `npm run build`
Expected: 에러 없이 빌드 성공(`Compiled successfully` 계열 출력). `error_codes` 테이블이 아직 Supabase에 없어도 다른 v2 테이블과 동일하게 조회 결과가 빈 배열로 처리되므로 빌드·런타임 모두 깨지지 않는다.

- [ ] **Step 8: Commit**

```bash
git add app/components/ElevatorFieldApp.jsx
git commit -m "$(cat <<'EOF'
에러코드집 데이터 로딩과 자동등록 배선

앱 셸에서 error_codes를 로딩해 FailureTab에 전달하고, 고장처리결과
저장 시 미등록 (기종, 코드) 조합을 자동으로 코드집에 등록한다.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
git push
```

---

### Task 4: `ArrivalResultModal` 자동완성 + 매칭 이력 표시

**Files:**
- Modify: `app/components/tabs/FailureTab.jsx`

**Interfaces:**
- Consumes: `findErrorCode`, `errorCodeHistory` (Task 2, `lib/utils.js`); `errorCodes` prop (Task 3, `ElevatorFieldApp.jsx`)
- Produces: `FailureTab`이 `errorCodes` prop을 받아 `FailureUnassignedList`/`FailureProcessRegister`/`ArrivalResultModal`까지 전달. `ArrivalResultModal`의 에러코드 입력란이 해당 호기 기종의 코드로 자동완성되고, 일치하는 코드가 있으면 의미·과거 처리사례를 보여준다.

- [ ] **Step 1: utils import에 `findErrorCode`, `errorCodeHistory` 추가**

4번째 줄:

```js
import { siteUnits, failureStage, parseErrorCode, unitIdFor, profileIdByName, formatPhone, distanceKm, labelToSeq, formatUnitLabel, unitHistory } from "@/lib/utils";
```

를

```js
import { siteUnits, failureStage, parseErrorCode, unitIdFor, profileIdByName, formatPhone, distanceKm, labelToSeq, formatUnitLabel, unitHistory, findErrorCode, errorCodeHistory } from "@/lib/utils";
```

로 바꾼다.

- [ ] **Step 2: `FailureTab` 함수 시그니처에 `errorCodes` 추가**

```js
export function FailureTab({ failures, setFailures, onDispatch, onArrive, onResult, onRefuse, onAssign, onReassign, focusSubTab, onFocusHandled, toast, attendances = [], todayLeaves = [], onReported }) {
```

를

```js
export function FailureTab({ failures, setFailures, onDispatch, onArrive, onResult, onRefuse, onAssign, onReassign, focusSubTab, onFocusHandled, toast, attendances = [], todayLeaves = [], errorCodes = [], onReported }) {
```

로 바꾼다.

- [ ] **Step 3: `FailureUnassignedList`/`FailureProcessRegister` 호출부에 `errorCodes` 전달**

```jsx
      {subTab === "미배정" && (
        <FailureUnassignedList failures={failures} onDispatch={onDispatch} onArrive={onArrive} onResult={onResult} onRefuse={onRefuse} onAssign={onAssign} attendances={attendances} todayLeaves={todayLeaves} />
      )}
      {subTab === "처리등록" && (
        <FailureProcessRegister failures={failures} onDispatch={onDispatch} onArrive={onArrive} onResult={onResult} onRefuse={onRefuse} onAssign={onAssign} attendances={attendances} todayLeaves={todayLeaves} />
      )}
```

를

```jsx
      {subTab === "미배정" && (
        <FailureUnassignedList failures={failures} onDispatch={onDispatch} onArrive={onArrive} onResult={onResult} onRefuse={onRefuse} onAssign={onAssign} attendances={attendances} todayLeaves={todayLeaves} errorCodes={errorCodes} />
      )}
      {subTab === "처리등록" && (
        <FailureProcessRegister failures={failures} onDispatch={onDispatch} onArrive={onArrive} onResult={onResult} onRefuse={onRefuse} onAssign={onAssign} attendances={attendances} todayLeaves={todayLeaves} errorCodes={errorCodes} />
      )}
```

로 바꾼다.

- [ ] **Step 4: `FailureUnassignedList`/`FailureProcessRegister` 시그니처에 `errorCodes` 추가**

```js
function FailureUnassignedList({ failures, onDispatch, onArrive, onResult, onRefuse, onAssign, attendances, todayLeaves }) {
```

를

```js
function FailureUnassignedList({ failures, onDispatch, onArrive, onResult, onRefuse, onAssign, attendances, todayLeaves, errorCodes }) {
```

로,

```js
function FailureProcessRegister({ failures, onDispatch, onArrive, onResult, onRefuse, onAssign, attendances, todayLeaves }) {
```

를

```js
function FailureProcessRegister({ failures, onDispatch, onArrive, onResult, onRefuse, onAssign, attendances, todayLeaves, errorCodes }) {
```

로 바꾼다.

- [ ] **Step 5: 두 컴포넌트의 `<ArrivalResultModal>` 호출부에 `failures`·`errorCodes` 전달**

`FailureUnassignedList`와 `FailureProcessRegister` 안에 각각 다음과 동일한 블록이 있다(둘 다 동일 텍스트이므로 `replace_all`로 한 번에 바꾼다):

```jsx
      {resultTarget && (
        <ArrivalResultModal
          failure={resultTarget}
          onClose={() => setResultTarget(null)}
          onConfirm={(result) => {
            onResult(resultTarget, result);
            setResultTarget(null);
          }}
        />
      )}
```

를 (`replace_all: true`)

```jsx
      {resultTarget && (
        <ArrivalResultModal
          failure={resultTarget}
          failures={failures}
          errorCodes={errorCodes}
          onClose={() => setResultTarget(null)}
          onConfirm={(result) => {
            onResult(resultTarget, result);
            setResultTarget(null);
          }}
        />
      )}
```

로 바꾼다.

- [ ] **Step 6: `ArrivalResultModal` 본문에 자동완성·매칭 정보 추가**

`export function ArrivalResultModal({ failure, onConfirm, onClose }) {`로 시작하는 함수 전체(713~778번째 줄)를 다음으로 교체:

```jsx
export function ArrivalResultModal({ failure, failures = [], errorCodes = [], onConfirm, onClose }) {
  const [result, setResult] = useState("처리완료");
  const [symptom, setSymptom] = useState("");
  const [errorCode, setErrorCode] = useState("");
  const [cause, setCause] = useState("");
  const [processContent, setProcessContent] = useState("");
  const [note, setNote] = useState("");
  const [photos, setPhotos] = useState([]);
  const units = useContext(UnitsContext);
  const model = units.find((u) => u.id === failure.unitId)?.model;
  const codeOptions = model ? errorCodes.filter((e) => e.model === model) : [];
  const matched = model ? findErrorCode(errorCodes, model, errorCode) : null;
  const matchedHistory = matched ? errorCodeHistory(failures, units, model, errorCode) : [];

  return (
    <Sheet title="고장처리결과 입력" onClose={onClose}>
      <p className="text-sm font-semibold text-slate-700 mb-4">{failure.siteName} · {formatUnitLabel(failure.elevatorNo)}</p>
      <div className="space-y-3.5">
        <div>
          <label className="text-xs font-bold text-slate-600 mb-1 block">처리결과</label>
          <select className={inputCls} value={result} onChange={(e) => setResult(e.target.value)}>
            {FAILURE_RESULT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.emoji} {o.value}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs font-bold text-slate-600 mb-1 block">증상 <span className="text-red-500">*</span></label>
          <input className={inputCls} value={symptom} onChange={(e) => setSymptom(e.target.value)} placeholder="예: 도어가 완전히 닫히지 않음" />
        </div>
        <div>
          <label className="text-xs font-bold text-slate-600 mb-1 block">에러코드 <span className="text-red-500">*</span></label>
          <input className={inputCls} list="error-code-options" value={errorCode} onChange={(e) => setErrorCode(e.target.value)} placeholder="예: E-32" />
          {codeOptions.length > 0 && (
            <datalist id="error-code-options">
              {codeOptions.map((e) => <option key={e.id} value={e.code} />)}
            </datalist>
          )}
          {matched && (
            <div className="bg-blue-50 rounded-xl p-3 mt-2">
              <p className="text-sm font-bold text-blue-800">{matched.meaning || "의미 미등록"}</p>
              {matched.commonCause && <p className="text-xs text-blue-600 mt-1">흔한 원인: {matched.commonCause}</p>}
              {matched.standardAction && <p className="text-xs text-blue-600 mt-0.5">표준 조치: {matched.standardAction}</p>}
              <p className="text-xs font-bold text-blue-700 mt-2">과거 처리사례 {matchedHistory.length}건</p>
              {matchedHistory.length === 0 ? (
                <p className="text-xs text-blue-500 mt-1">아직 처리된 사례가 없습니다.</p>
              ) : (
                <ul className="space-y-1 mt-1.5">
                  {matchedHistory.slice(0, 3).map((h) => (
                    <li key={h.id} className="text-xs text-blue-700">
                      {h.siteName} — {[h.faultCause, h.processContent].filter(Boolean).join(" → ") || "내용 없음"}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
        <div>
          <label className="text-xs font-bold text-slate-600 mb-1 block">발생원인 <span className="text-red-500">*</span></label>
          <input className={inputCls} value={cause} onChange={(e) => setCause(e.target.value)} placeholder="예: 도어 센서 오작동" />
        </div>
        <div>
          <label className="text-xs font-bold text-slate-600 mb-1 block">처리내용 <span className="text-red-500">*</span></label>
          <input className={inputCls} value={processContent} onChange={(e) => setProcessContent(e.target.value)} placeholder="예: 센서 교체 및 재조정" />
        </div>
        <div>
          <label className="text-xs font-bold text-slate-600 mb-1 block">비고</label>
          <input className={inputCls} value={note} onChange={(e) => setNote(e.target.value)} placeholder="추가 전달사항 (선택)" />
        </div>
        <MultiPhotoUpload
          photos={photos}
          uploadFolder={`failures/${failure.id}`}
          onUploaded={(url) => setPhotos((p) => [...p, { url }])}
          onRemove={(idx) => setPhotos((p) => p.filter((_, i) => i !== idx))}
          label="처리 사진"
          required={false}
        />
        {(() => {
          const valid = symptom.trim() && errorCode.trim() && cause.trim() && processContent.trim();
          return (
            <button
              type="button"
              disabled={!valid}
              onClick={() => onConfirm({ result, symptom, errorCode, cause, processContent, note, photoCount: photos.length, photoUrls: photos.map((p) => p.url) })}
              className={`w-full text-white text-sm font-bold py-3 rounded-xl ${valid ? FAILURE_RESULT_BTN_CLS[result] : "bg-slate-300"}`}
            >
              {result} 등록
            </button>
          );
        })()}
      </div>
    </Sheet>
  );
}
```

- [ ] **Step 7: 브라우저로 확인**

`npm run dev` 실행 후 `localhost:3000/?as=engineer&name=김기사`로 접속(또는 이미 실행 중인 dev 서버 재사용).

1. "고장접수" 탭 → "미배정" 또는 "처리등록"에서 진행중인 고장을 하나 연다(없으면 "접수등록"에서 하나 만든다).
2. "결과입력" 버튼으로 `ArrivalResultModal`을 연다.
3. 에러코드 입력란에 아무 값이나 입력해본다 — 마이그레이션이 아직 실행 전이라 `errorCodes`가 빈 배열이므로, 자동완성 목록도 매칭 정보 박스도 뜨지 않아야 한다(에러 없이 조용히 빈 상태).
4. 브라우저 콘솔에 새로운 런타임 에러가 없는지 확인한다.

Expected: 모달이 정상적으로 열리고 입력·저장이 기존과 동일하게 동작하며 콘솔에 새 에러가 없다. (마이그레이션 실행 후 실제 자동완성·이력 표시는 Task 6 완료 뒤 전체 플로우로 다시 확인한다.)

- [ ] **Step 8: Commit**

```bash
git add app/components/tabs/FailureTab.jsx
git commit -m "$(cat <<'EOF'
고장처리결과 입력에 에러코드 자동완성·이력 표시 추가

해당 호기 기종의 등록된 에러코드를 datalist로 추천하고, 일치하는
코드가 있으면 의미와 과거 처리사례를 바로 보여준다.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
git push
```

---

### Task 5: 기사 앱 — 에러코드집 서브탭

**Files:**
- Modify: `app/components/tabs/FailureTab.jsx`

**Interfaces:**
- Consumes: `errorCodeHistory` (Task 2), `errorCodes` prop(Task 4에서 이미 `FailureTab`이 받음)
- Produces: `FailureTab`에 "에러코드집" 서브탭 — 기종 선택 → 코드 검색 → 상세(의미·원인·조치법·과거 처리이력), 읽기전용.

- [ ] **Step 1: `ErrorCodeBook` 컴포넌트 추가**

`export function FailureTab(` 정의(1276번째 줄) 바로 앞에 추가:

```jsx
// 에러코드집 — 기종 선택 후 코드 검색, 클릭 시 의미·원인·조치법 + 과거 처리이력. 읽기전용(수정은 관리자 콘솔).
function ErrorCodeBook({ errorCodes, failures }) {
  const units = useContext(UnitsContext);
  const models = [...new Set(errorCodes.map((e) => e.model))].sort();
  const [model, setModel] = useState(models[0] ?? "");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(null);
  const list = errorCodes.filter((e) => e.model === model && (e.code.includes(query) || (e.meaning ?? "").includes(query)));

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="px-5 pt-4 space-y-2 shrink-0">
        <select className={inputCls} value={model} onChange={(e) => setModel(e.target.value)}>
          {models.length === 0 && <option value="">등록된 기종이 없습니다</option>}
          {models.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
        <input className={inputCls} placeholder="코드·의미 검색" value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-2 pb-24">
        {list.length === 0 ? (
          <p className="text-xs text-slate-400 text-center py-10">{model ? "등록된 코드가 없습니다" : "기종을 선택하세요"}</p>
        ) : (
          list.map((e) => (
            <button key={e.id} type="button" onClick={() => setSelected(e)} className="w-full text-left rounded-lg bg-white border border-slate-200 px-3 py-2.5 active:bg-slate-50">
              <p className="font-bold text-slate-800 text-sm">{e.code}</p>
              <p className="text-xs text-slate-500 mt-0.5">{e.meaning || "의미 미등록"}</p>
            </button>
          ))
        )}
      </div>
      {selected && (
        <Sheet title={`${selected.model} · ${selected.code}`} onClose={() => setSelected(null)}>
          <div className="space-y-3">
            <div>
              <p className="text-xs font-bold text-slate-500 mb-1">의미</p>
              <p className="text-sm text-slate-800">{selected.meaning || "의미 미등록"}</p>
            </div>
            {selected.commonCause && (
              <div>
                <p className="text-xs font-bold text-slate-500 mb-1">흔한 원인</p>
                <p className="text-sm text-slate-800">{selected.commonCause}</p>
              </div>
            )}
            {selected.standardAction && (
              <div>
                <p className="text-xs font-bold text-slate-500 mb-1">표준 조치법</p>
                <p className="text-sm text-slate-800">{selected.standardAction}</p>
              </div>
            )}
            <div>
              {(() => {
                const history = errorCodeHistory(failures, units, selected.model, selected.code);
                return (
                  <>
                    <p className="text-xs font-bold text-slate-500 mb-1.5">과거 처리사례 {history.length > 0 && `(${history.length})`}</p>
                    {history.length === 0 ? (
                      <p className="text-xs text-slate-400">아직 처리된 사례가 없습니다.</p>
                    ) : (
                      <ul className="space-y-1.5">
                        {history.map((h) => (
                          <li key={h.id} className="rounded-lg bg-slate-50 border border-slate-200/70 px-3 py-2">
                            <p className="text-xs font-semibold text-slate-700">{fmtMD(h.createdAt)} · {h.siteName}</p>
                            <p className="text-xs text-slate-500 mt-0.5">{[h.faultSymptom, h.faultCause, h.processContent].filter(Boolean).join(" → ") || "내용 없음"}</p>
                          </li>
                        ))}
                      </ul>
                    )}
                  </>
                );
              })()}
            </div>
          </div>
        </Sheet>
      )}
    </div>
  );
}

```

- [ ] **Step 2: 서브탭 목록에 "에러코드집" 추가**

```js
  const subTabs = ["접수등록", "미배정", "처리등록", "처리현황"];
```

를

```js
  const subTabs = ["접수등록", "미배정", "처리등록", "처리현황", "에러코드집"];
```

로 바꾼다.

- [ ] **Step 3: 렌더 분기 추가**

```jsx
      {subTab === "처리현황" && <FailureStatusOverview failures={failures} onReassign={onReassign} />}
      <SmsToast message={toast} />
```

를

```jsx
      {subTab === "처리현황" && <FailureStatusOverview failures={failures} onReassign={onReassign} />}
      {subTab === "에러코드집" && <ErrorCodeBook errorCodes={errorCodes} failures={failures} />}
      <SmsToast message={toast} />
```

로 바꾼다.

- [ ] **Step 4: 브라우저로 확인**

`npm run dev` → `localhost:3000/?as=engineer&name=김기사` → "고장접수" 탭에서 맨 오른쪽 "에러코드집" 서브탭을 누른다.

Expected: "등록된 기종이 없습니다"(마이그레이션 전이라 `errorCodes`가 비어있음)가 뜨고, 콘솔에 새 에러가 없다. 화면 전환·레이아웃이 다른 서브탭과 일관된 스타일인지 눈으로 확인한다.

- [ ] **Step 5: Commit**

```bash
git add app/components/tabs/FailureTab.jsx
git commit -m "$(cat <<'EOF'
기사 앱에 에러코드집 조회 서브탭 추가

고장접수 탭에 기종별 에러코드 목록/검색/상세(의미·원인·조치법·
과거 처리이력) 화면을 읽기전용으로 추가한다.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
git push
```

---

### Task 6: 관리자 콘솔 — `ErrorCodesAdmin` + `AdminApp` 연결

**Files:**
- Create: `app/components/admin/ErrorCodesAdmin.jsx`
- Modify: `app/components/admin/AdminApp.jsx`

**Interfaces:**
- Consumes: `mapErrorCode`(Task 2), `errorCodeHistory`(Task 2), `AdminTable`/`Modal`/`inputCls`(`adminShared.jsx`, 기존)
- Produces: 관리자 콘솔에 "에러코드집" 메뉴 — 코드 등록, 의미/원인/조치법 수정, 처리이력 조회.

- [ ] **Step 1: `ErrorCodesAdmin.jsx` 작성**

`app/components/admin/ErrorCodesAdmin.jsx`:

```jsx
"use client";

// 에러코드집 관리 — 기종별 에러코드 의미·원인·조치법을 등록하고, 과거 처리이력을 함께 본다.
import { useState } from "react";
import { Plus } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { mapErrorCode } from "@/lib/mappers";
import { errorCodeHistory } from "@/lib/utils";
import { AdminTable, Modal, inputCls } from "@/app/components/admin/adminShared";

const fmtDate = (iso) => {
  const d = new Date(iso);
  return `${String(d.getFullYear()).slice(2)}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
};

function RegisterErrorCodeModal({ models, onClose, onCreate }) {
  const [form, setForm] = useState({ model: models[0] ?? "", code: "", meaning: "", commonCause: "", standardAction: "" });
  const [saving, setSaving] = useState(false);
  const valid = form.model.trim() && form.code.trim();

  async function submit() {
    if (!valid) return;
    setSaving(true);
    await onCreate(form);
    setSaving(false);
    onClose();
  }

  return (
    <Modal title="에러코드 등록" onClose={onClose}>
      <div className="space-y-3">
        <div>
          <p className="text-xs font-bold text-slate-500 mb-1">기종 *</p>
          {models.length > 0 ? (
            <select className={inputCls} value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })}>
              {models.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          ) : (
            <input className={inputCls} placeholder="예: OTIS Gen2" value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} />
          )}
        </div>
        <div>
          <p className="text-xs font-bold text-slate-500 mb-1">코드 *</p>
          <input className={inputCls} placeholder="예: E-32" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />
        </div>
        <div>
          <p className="text-xs font-bold text-slate-500 mb-1">의미</p>
          <input className={inputCls} value={form.meaning} onChange={(e) => setForm({ ...form, meaning: e.target.value })} />
        </div>
        <div>
          <p className="text-xs font-bold text-slate-500 mb-1">흔한 원인</p>
          <input className={inputCls} value={form.commonCause} onChange={(e) => setForm({ ...form, commonCause: e.target.value })} />
        </div>
        <div>
          <p className="text-xs font-bold text-slate-500 mb-1">표준 조치법</p>
          <input className={inputCls} value={form.standardAction} onChange={(e) => setForm({ ...form, standardAction: e.target.value })} />
        </div>
        <div className="flex justify-end pt-2">
          <button disabled={!valid || saving} onClick={submit} className="text-sm font-bold text-white bg-blue-700 disabled:bg-slate-300 rounded-xl px-5 py-2.5">
            {saving ? "등록 중..." : "등록하기"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function ErrorCodeDetailModal({ entry, failures, units, onClose, onSave }) {
  const [meaning, setMeaning] = useState(entry.meaning ?? "");
  const [commonCause, setCommonCause] = useState(entry.commonCause ?? "");
  const [standardAction, setStandardAction] = useState(entry.standardAction ?? "");
  const [saving, setSaving] = useState(false);
  const history = errorCodeHistory(failures, units, entry.model, entry.code);

  async function save() {
    setSaving(true);
    await onSave(entry, { meaning, commonCause, standardAction });
    setSaving(false);
  }

  return (
    <Modal title={`${entry.model} · ${entry.code}`} onClose={onClose}>
      <div className="space-y-3 mb-5">
        <div>
          <p className="text-xs font-bold text-slate-500 mb-1">의미</p>
          <input className={inputCls} value={meaning} onChange={(e) => setMeaning(e.target.value)} placeholder="미등록" />
        </div>
        <div>
          <p className="text-xs font-bold text-slate-500 mb-1">흔한 원인</p>
          <input className={inputCls} value={commonCause} onChange={(e) => setCommonCause(e.target.value)} />
        </div>
        <div>
          <p className="text-xs font-bold text-slate-500 mb-1">표준 조치법</p>
          <input className={inputCls} value={standardAction} onChange={(e) => setStandardAction(e.target.value)} />
        </div>
        <div className="flex justify-end">
          <button disabled={saving} onClick={save} className="text-sm font-bold text-white bg-blue-700 disabled:bg-slate-300 rounded-xl px-5 py-2">
            {saving ? "저장 중..." : "저장"}
          </button>
        </div>
      </div>
      <div>
        <p className="text-xs font-bold text-slate-500 mb-2">과거 처리이력 {history.length > 0 && `(${history.length})`}</p>
        {history.length === 0 ? (
          <p className="text-xs text-slate-400">아직 처리된 사례가 없습니다.</p>
        ) : (
          <ul className="space-y-1.5">
            {history.map((h) => (
              <li key={h.id} className="rounded-lg bg-slate-50 border border-slate-200 px-3 py-2">
                <p className="text-xs font-semibold text-slate-700">{fmtDate(h.createdAt)} · {h.siteName}</p>
                <p className="text-xs text-slate-500 mt-0.5">{[h.faultSymptom, h.faultCause, h.processContent].filter(Boolean).join(" → ") || "내용 없음"}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Modal>
  );
}

export default function ErrorCodesAdmin({ data, setData }) {
  const { errorCodes = [], units, failures } = data;
  const models = [...new Set(units.map((u) => u.model).filter(Boolean))].sort();
  const [modelFilter, setModelFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [registering, setRegistering] = useState(false);
  const [detail, setDetail] = useState(null);

  const rows = errorCodes.filter((e) => {
    if (modelFilter !== "all" && e.model !== modelFilter) return false;
    const q = search.trim();
    if (!q) return true;
    return [e.model, e.code, e.meaning].filter(Boolean).join(" ").includes(q);
  });
  const historyCount = (e) => errorCodeHistory(failures, units, e.model, e.code).length;

  async function createErrorCode(form) {
    const row = {
      model: form.model.trim(),
      code: form.code.trim(),
      meaning: form.meaning.trim() || null,
      common_cause: form.commonCause.trim() || null,
      standard_action: form.standardAction.trim() || null,
    };
    const { data: inserted, error } = await supabase.from("error_codes").upsert(row, { onConflict: "model,code" }).select().maybeSingle();
    if (error) { alert("등록 실패: " + error.message); return; }
    const mapped = mapErrorCode(inserted);
    setData((prev) => ({
      ...prev,
      errorCodes: [...prev.errorCodes.filter((e) => !(e.model === mapped.model && e.code === mapped.code)), mapped],
    }));
  }

  async function saveDetail(entry, patch) {
    const { data: updated, error } = await supabase
      .from("error_codes")
      .update({ meaning: patch.meaning.trim() || null, common_cause: patch.commonCause.trim() || null, standard_action: patch.standardAction.trim() || null })
      .eq("id", entry.id)
      .select()
      .maybeSingle();
    if (error) { alert("저장 실패: " + error.message); return; }
    const mapped = mapErrorCode(updated);
    setData((prev) => ({ ...prev, errorCodes: prev.errorCodes.map((e) => (e.id === mapped.id ? mapped : e)) }));
    setDetail(mapped);
  }

  return (
    <div className="max-w-[100rem] mx-auto">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-extrabold">에러코드집</h1>
        <button onClick={() => setRegistering(true)} className="flex items-center gap-1.5 text-sm font-bold text-white bg-blue-700 rounded-xl px-4 py-2.5 whitespace-nowrap">
          <Plus size={15} /> 코드 등록
        </button>
      </div>

      <div className="flex flex-wrap gap-2 mb-3">
        <select className={`${inputCls} w-auto`} value={modelFilter} onChange={(e) => setModelFilter(e.target.value)}>
          <option value="all">전체 기종</option>
          {models.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
        <input className={`${inputCls} flex-1 min-w-48`} placeholder="기종·코드·의미 검색" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      <AdminTable head={["기종", "코드", "의미", "처리이력"]}>
        {rows.map((e) => (
          <tr key={e.id} className="border-b border-slate-50 cursor-pointer hover:bg-slate-50" onClick={() => setDetail(e)}>
            <td className="pl-5 pr-3 py-2.5 font-semibold whitespace-nowrap">{e.model}</td>
            <td className="px-3 py-2.5 font-bold whitespace-nowrap">{e.code}</td>
            <td className="px-3 py-2.5 text-slate-600">{e.meaning || <span className="text-slate-400">미등록</span>}</td>
            <td className="px-3 py-2.5 text-slate-500">{historyCount(e)}건</td>
          </tr>
        ))}
      </AdminTable>
      {rows.length === 0 && <p className="text-xs text-slate-400 text-center py-10">등록된 에러코드가 없습니다</p>}

      {registering && (
        <RegisterErrorCodeModal models={models} onClose={() => setRegistering(false)} onCreate={createErrorCode} />
      )}
      {detail && (
        <ErrorCodeDetailModal entry={detail} failures={failures} units={units} onClose={() => setDetail(null)} onSave={saveDetail} />
      )}
    </div>
  );
}
```

- [ ] **Step 2: `AdminApp.jsx` — 아이콘·매퍼 import 추가**

```js
import { Building2, AlertTriangle, ShieldCheck, Package, Receipt, ListTodo, CalendarCheck, Users, LayoutDashboard, BarChart3, Menu , Bell, MessageSquare } from "lucide-react";
```

를

```js
import { Building2, AlertTriangle, ShieldCheck, Package, Receipt, ListTodo, CalendarCheck, Users, LayoutDashboard, BarChart3, Menu , Bell, MessageSquare, BookOpen } from "lucide-react";
```

로,

```js
import {
  mapSite, mapSiteManager, mapFailure, mapInspection, mapMaterialRequest,
  mapTodo, mapQuoteRequest, mapBilling, mapUnit, mapSelfCheck, mapFeedPost, mapRestockRequest,
} from "@/lib/mappers";
```

를

```js
import {
  mapSite, mapSiteManager, mapFailure, mapInspection, mapMaterialRequest,
  mapTodo, mapQuoteRequest, mapBilling, mapUnit, mapSelfCheck, mapFeedPost, mapRestockRequest, mapErrorCode,
} from "@/lib/mappers";
```

로 바꾼다.

- [ ] **Step 3: `ErrorCodesAdmin` import 추가**

```js
import RoomAdmin from "@/app/components/admin/RoomAdmin";
```

바로 뒤에 추가:

```js
import ErrorCodesAdmin from "@/app/components/admin/ErrorCodesAdmin";
```

- [ ] **Step 4: MENU 배열에 항목 추가**

```js
  { id: "failures", label: "고장관리", icon: AlertTriangle },
  { id: "inspections", label: "검사관리", icon: ShieldCheck },
```

를

```js
  { id: "failures", label: "고장관리", icon: AlertTriangle },
  { id: "errorCodes", label: "에러코드집", icon: BookOpen },
  { id: "inspections", label: "검사관리", icon: ShieldCheck },
```

로 바꾼다.

- [ ] **Step 5: 초기 `data` state에 `errorCodes: []` 추가**

```js
  const [data, setData] = useState({
    sites: [], units: [], siteManagers: [], failures: [], inspections: [],
    materialRequests: [], quoteRequests: [], restockRequests: [], todos: [], billings: [],
    selfChecks: [], profiles: [], feed: [],
  });
```

를

```js
  const [data, setData] = useState({
    sites: [], units: [], siteManagers: [], failures: [], inspections: [],
    materialRequests: [], quoteRequests: [], restockRequests: [], todos: [], billings: [],
    selfChecks: [], profiles: [], feed: [], errorCodes: [],
  });
```

로 바꾼다.

- [ ] **Step 6: `load()`의 `Promise.all`에 `error_codes` 추가**

```js
      const [sites, units, siteManagers, failures, inspections, materials, quotes, restock, todos, billings, selfChecks, profiles, feed] =
        await Promise.all([
          supabase.from("sites").select("*").order("name"),
          supabase.from("units").select("*").order("seq"),
          supabase.from("site_managers").select("*"),
          supabase.from("failures").select("*").order("created_at", { ascending: false }),
          supabase.from("inspections").select("*").order("due_date"),
          supabase.from("material_requests").select("*").order("created_at", { ascending: false }),
          supabase.from("quote_requests").select("*").order("created_at", { ascending: false }),
          supabase.from("restock_requests").select("*").order("created_at", { ascending: false }),
          supabase.from("todos").select("*").order("created_at", { ascending: false }),
          supabase.from("billings").select("*").order("created_at", { ascending: false }),
          supabase.from("self_checks").select("*"),
          supabase.from("profiles").select("*").order("name"),
          supabase.from("feed_posts").select("*").order("created_at", { ascending: true }),
        ]);
      setData({
        sites: (sites.data ?? []).map(mapSite),
        units: (units.data ?? []).map(mapUnit),
        siteManagers: (siteManagers.data ?? []).map(mapSiteManager),
        failures: (failures.data ?? []).map(mapFailure),
        inspections: (inspections.data ?? []).map(mapInspection),
        materialRequests: (materials.data ?? []).map(mapMaterialRequest),
        quoteRequests: (quotes.data ?? []).map(mapQuoteRequest),
        restockRequests: (restock.data ?? []).map(mapRestockRequest),
        todos: (todos.data ?? []).map(mapTodo),
        billings: (billings.data ?? []).map(mapBilling),
        selfChecks: (selfChecks.data ?? []).map(mapSelfCheck),
        profiles: profiles.data ?? [],
        feed: (feed.data ?? []).map(mapFeedPost),
      });
```

를

```js
      const [sites, units, siteManagers, failures, inspections, materials, quotes, restock, todos, billings, selfChecks, profiles, feed, errorCodes] =
        await Promise.all([
          supabase.from("sites").select("*").order("name"),
          supabase.from("units").select("*").order("seq"),
          supabase.from("site_managers").select("*"),
          supabase.from("failures").select("*").order("created_at", { ascending: false }),
          supabase.from("inspections").select("*").order("due_date"),
          supabase.from("material_requests").select("*").order("created_at", { ascending: false }),
          supabase.from("quote_requests").select("*").order("created_at", { ascending: false }),
          supabase.from("restock_requests").select("*").order("created_at", { ascending: false }),
          supabase.from("todos").select("*").order("created_at", { ascending: false }),
          supabase.from("billings").select("*").order("created_at", { ascending: false }),
          supabase.from("self_checks").select("*"),
          supabase.from("profiles").select("*").order("name"),
          supabase.from("feed_posts").select("*").order("created_at", { ascending: true }),
          supabase.from("error_codes").select("*"),
        ]);
      setData({
        sites: (sites.data ?? []).map(mapSite),
        units: (units.data ?? []).map(mapUnit),
        siteManagers: (siteManagers.data ?? []).map(mapSiteManager),
        failures: (failures.data ?? []).map(mapFailure),
        inspections: (inspections.data ?? []).map(mapInspection),
        materialRequests: (materials.data ?? []).map(mapMaterialRequest),
        quoteRequests: (quotes.data ?? []).map(mapQuoteRequest),
        restockRequests: (restock.data ?? []).map(mapRestockRequest),
        todos: (todos.data ?? []).map(mapTodo),
        billings: (billings.data ?? []).map(mapBilling),
        selfChecks: (selfChecks.data ?? []).map(mapSelfCheck),
        profiles: profiles.data ?? [],
        feed: (feed.data ?? []).map(mapFeedPost),
        errorCodes: (errorCodes.data ?? []).map(mapErrorCode),
      });
```

로 바꾼다.

- [ ] **Step 7: 메뉴 렌더 분기 추가**

```jsx
        ) : menu === "stats" ? (
          <StatsAdmin data={data} />
        ) : (
```

를

```jsx
        ) : menu === "stats" ? (
          <StatsAdmin data={data} />
        ) : menu === "errorCodes" ? (
          <ErrorCodesAdmin data={data} setData={setData} />
        ) : (
```

로 바꾼다.

- [ ] **Step 8: 마이그레이션 실행 (팀 작업 — Claude는 실행하지 않음)**

여기서부터의 검증은 Supabase에 `error_codes` 테이블이 있어야 의미가 있다. Task 1에서 작성한 `supabase/migrations/051_error_codes_DRAFT.sql`을 Supabase 대시보드 SQL Editor에 붙여넣어 실행해야 한다(팀 상의 후 사람이 직접). 이 플랜을 실행하는 세션이 그 권한이 없다면, 사용자에게 실행을 요청하고 완료 확인을 받은 뒤 다음 단계로 진행한다.

- [ ] **Step 9: 브라우저로 전체 플로우 확인**

`npm run dev` → `localhost:3000/?as=admin`.

1. 사이드바에서 "에러코드집" 메뉴로 이동.
2. "코드 등록" → 실제 존재하는 기종 하나(예: 현장 데이터에 있는 `OTIS Gen2`)와 코드(예: `E-32`), 의미(예: `도어 닫힘 이상`)를 입력해 등록.
3. 방금 등록한 행이 목록에 뜨는지, 클릭 시 상세 모달에서 의미가 그대로 보이는지 확인.
4. `localhost:3000/?as=engineer&name=김기사`로 기사 앱을 열어, 그 기종의 호기를 가진 고장 건의 "결과입력"에서 코드를 입력 → 자동완성 목록에 방금 등록한 코드가 뜨고, 선택 시 의미가 보이는지 확인.
5. 처리결과를 실제로 저장 → "고장접수 → 에러코드집"에서 같은 기종·코드를 조회 → 방금 저장한 처리내용이 "과거 처리사례"에 나타나는지 확인.
6. 관리자 콘솔 "에러코드집"에서 방금 등록한 행의 "처리이력" 건수가 1 이상으로 올라갔는지 확인.

Expected: 5~6단계에서 방금 저장한 처리 건이 코드집 이력에 정확히 나타난다(설계서의 핵심 요구사항 — 코드 매칭 + 이력 조회가 실제로 동작함을 증명).

- [ ] **Step 10: Commit**

```bash
git add app/components/admin/ErrorCodesAdmin.jsx app/components/admin/AdminApp.jsx
git commit -m "$(cat <<'EOF'
관리자 콘솔에 에러코드집 관리 화면 추가

기종별 에러코드 등록, 의미·원인·조치법 수정, 처리이력 조회를
관리자 콘솔에서 할 수 있게 한다.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
git push
```

---

## Self-Review

**Spec coverage:**
- `error_codes` 테이블 + 자동등록 → Task 1, 3.
- 관리자 콘솔 CRUD + 이력 조회 → Task 6.
- `ArrivalResultModal` 자동완성 + 인라인 이력 → Task 4.
- 기사 앱 에러코드집 서브탭(신규 탭 아님) → Task 5.
- "테스트 러너 없음 → 브라우저 수동확인" 방침 → 모든 태스크의 검증 단계, Global Constraints에 명시.
- 모든 spec 항목에 대응하는 태스크가 있음 — 누락 없음.

**Placeholder scan:** "TBD"/"나중에"/"적절한 에러처리 추가" 류 문구 없음. 모든 코드 스텝에 완전한 코드가 포함되어 있음.

**Type consistency:** `errorCodes` 배열 항목 shape(`{id, model, code, meaning, commonCause, standardAction, createdAt}`)이 `mapErrorCode`(Task 2) → `ArrivalResultModal`/`ErrorCodeBook`(Task 4·5) → `ErrorCodesAdmin`(Task 6) 전체에서 동일하게 사용됨. `findErrorCode`/`errorCodeHistory` 시그니처가 정의(Task 2)와 모든 호출부(Task 4·5·6)에서 일치.
