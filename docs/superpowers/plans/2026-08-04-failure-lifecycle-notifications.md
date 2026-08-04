# 고장처리 진행단계 알림 확대 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 고장접수·처리완료·처리중 지원요청/운행정지·집중관리현장 발생을 관리자·기사에게 긴급 알림으로 보내고, 알림을 누르면 해당 고장신고 상세로 이동하게 한다.

**Architecture:** `app/components/ElevatorFieldApp.jsx`의 기존 `handleFailureReported`/`handleFailureResult` 핸들러 안에 `sendPush()` 호출을 추가/교체한다. 대상자는 이 파일에 이미 있는 `adminIds()`/`engineerIds()`와 같은 패턴의 클라이언트 계산 함수(`seniorAdminIds()`, `siteEngineerId()`)로 구하고, `sendPush(key, profileIds, {...})`에 명시적으로 넘긴다(이 코드베이스의 모든 즉시성 고장 알림이 쓰는 기존 패턴 — 서버의 등급별 자동 필터링은 타지 않는다). 알림 카탈로그(`lib/notifications.js`)에 신규 4개 키를 추가해 알림설정 화면에 노출한다.

**Tech Stack:** Next.js 16 App Router, React 19, Supabase(anon key, 클라이언트 직접 write), `/api/push/send` REST 엔드포인트(FCM+web-push). 이 저장소엔 자동화 테스트 프레임워크가 없다 — 검증은 `npm run build` + 실제 `/api/push/send`(test:true) 발송으로 한다(기존 관례).

## Global Constraints

- 딥링크는 전부 `url: "/?openFailure=${failure.id}"` (경로는 모바일에서 무시되므로 관리자/기사 구분 없이 동일 URL 사용).
- 알림 레벨은 전부 `level: "urgent"`, `trigger: "instant"`, `group: "고장"`.
- "최고관리자, 중간관리자" = `profiles.admin_tier !== "material"`인 관리자(super + manager, 자재담당 제외).
- "모든사람" = 관리자 전체(자재담당 포함) + 기사 전체.
- "해당현장 담당자" = `site.assignedEngineer`(그 현장 상시 담당기사) — `failure.assignee`(그 건에 배정된 기사)와 다른 개념이며 미배정 상태에서도 항상 포함.
- 기존 배정/재배정/거부/접수시점 중대건(`failure_escalated`)/미배정(`failure_unassigned`, 접수 시점 분기)의 동작은 바꾸지 않는다.
- `created`(고장접수 시 새로 만들어진 failure 배열)는 항상 단일 현장이다 — 신고 폼이 현장 1곳을 고른 뒤 그 현장의 호기(들)만 체크해서 한 번에 접수하는 구조라서, 여러 현장이 한 배열에 섞여 들어오는 경우가 없다(기존 코드의 `where = first.siteName ...`도 이 전제로 짜여 있다). siteId 루프 없이 `first.siteId` 하나만 보면 된다.

---

### Task 1: 알림 카탈로그에 신규 키 4개 추가

**Files:**
- Modify: `lib/notifications.js:30` (기존 `failure_reassigned` 줄 바로 뒤, `// ---- 근무 ----` 주석 앞)

**Interfaces:**
- Produces: 카탈로그 키 `failure_completed`, `failure_result_escalated`, `critical_site_new`, `critical_site_repeat` — Task 3·4가 `sendPush(key, ...)`의 `key` 인자로 그대로 쓴다.

- [ ] **Step 1: 현재 30번째 줄 주변을 확인**

`lib/notifications.js`의 30번째 줄은 다음과 같다:
```js
  { key: "failure_reassigned", label: "내 건이 재배정돼 회수됨", audience: "engineer", level: "normal", trigger: "instant", group: "고장" },
```
바로 다음 줄이 빈 줄, 그다음이 `  // ---- 근무 ----`다.

- [ ] **Step 2: 4개 항목 삽입**

`failure_reassigned` 줄과 `// ---- 근무 ----` 사이(빈 줄 앞)에 다음을 추가:

```js
  { key: "failure_completed", label: "고장 처리완료", audience: "admin", level: "urgent", trigger: "instant", group: "고장" },
  { key: "failure_result_escalated", label: "처리 중 지원요청·운행정지 발생", audience: "all", level: "urgent", trigger: "instant", group: "고장" },
  { key: "critical_site_new", label: "집중관리현장 새로 발생", audience: "all", level: "urgent", trigger: "instant", group: "고장" },
  { key: "critical_site_repeat", label: "집중관리현장 추가 고장", audience: "admin", level: "urgent", trigger: "instant", group: "고장" },
```

결과적으로 17~31번째 줄이 다음과 같은 순서가 된다: `failure_assigned`, `failure_unassigned`, `failure_reported`, `failure_refused`, `failure_escalated`, `failure_stale`, `dispatch_no_response`, `failure_reassigned`, **`failure_completed`, `failure_result_escalated`, `critical_site_new`, `critical_site_repeat`**, (빈 줄), `// ---- 근무 ----`.

- [ ] **Step 3: 빌드 확인**

```bash
cd /c/projects/elevator-field-app && npm run build
```
Expected: 에러 없이 빌드 성공 (이 파일은 JS 객체 배열이라 문법 오류만 없으면 통과).

- [ ] **Step 4: 알림설정 화면에서 4개 행 노출 확인**

로컬 프리뷰(`http://localhost:3000/admin`)에서 "알림 설정" 메뉴를 열고, "고장" 그룹에 "고장 처리완료", "처리 중 지원요청·운행정지 발생", "집중관리현장 새로 발생", "집중관리현장 추가 고장" 4개 행이 새로 보이는지 확인. 4개 다 기본 "긴급"(urgent) 레벨로 표시돼야 한다.

- [ ] **Step 5: 커밋**

```bash
git add lib/notifications.js
git commit -m "고장 알림 카탈로그에 처리완료·처리중 에스컬레이션·집중관리현장 4개 키 추가"
```

---

### Task 2: 대상자 계산 헬퍼 추가 + `failure_reported` 대상 변경

**Files:**
- Modify: `app/components/ElevatorFieldApp.jsx:359-360` (헬퍼 추가), `app/components/ElevatorFieldApp.jsx:871-893` (`handleFailureReported`)

**Interfaces:**
- Consumes: 컴포넌트 최상위 스코프의 `profilesAll`(배열, 각 원소에 `id`/`role`/`adminTier`/`is_active` 존재), `sites`(배열, 각 원소에 `id`/`assignedEngineer` 존재), `profileIdByName(profiles, name)`(이미 `@/lib/utils`에서 import됨).
- Produces: `seniorAdminIds()` — 최고+중간관리자 id 배열. `siteEngineerId(siteId)` — 그 현장 담당기사 profile id 또는 `null`. Task 3·4가 그대로 쓴다.

- [ ] **Step 1: 헬퍼 2개 추가**

`app/components/ElevatorFieldApp.jsx:359-360`은 현재:
```js
  const adminIds = () => profilesAll.filter((p) => p.role === "admin" && p.is_active !== false).map((p) => p.id);
  const engineerIds = () => profilesAll.filter((p) => p.role === "engineer" && p.is_active !== false).map((p) => p.id);
```

바로 뒤(빈 줄 하나 두고, `// 알림 발송 —` 주석 앞)에 추가:
```js
  // 최고+중간관리자만(자재담당 제외) — 고장 흐름 관련 알림 중 관리자 등급을 좁혀 보내는 곳에서 쓴다.
  const seniorAdminIds = () => profilesAll.filter((p) => p.role === "admin" && p.is_active !== false && p.adminTier !== "material").map((p) => p.id);
  // 그 현장의 상시 담당기사 profile id — 미배정 상태에서도 늘 알아야 하는 사람이라 failure.assignee와 별개로 구한다.
  const siteEngineerId = (siteId) => {
    const site = sites.find((s) => s.id === siteId);
    return site?.assignedEngineer ? profileIdByName(profilesAll, site.assignedEngineer) : null;
  };
```

- [ ] **Step 2: `failure_reported` 대상 교체 + 미배정 알림 중복 제거**

`app/components/ElevatorFieldApp.jsx:871-893`의 `handleFailureReported` 전체가 현재:
```js
  function handleFailureReported(created) {
    const first = created[0];
    if (!first) return;
    const where = `${first.siteName} · ${created.map((f) => formatUnitLabel(f.elevatorNo)).filter(Boolean).join(", ") || "호기 미상"}`;
    const what = parseErrorCode(first.errorCode).faultType;
    const more = created.length > 1 ? ` 외 ${created.length - 1}건` : "";

    sendPush("failure_reported", adminIds(), {
      title: `고장 접수 — ${what}`,
      body: `${where}${more}`,
      url: `/?openFailure=${first.id}`,
    });
    if (created.some((f) => f.escalation)) {
      sendPush("failure_escalated", adminIds(), { title: "중대 고장 접수", body: `${where} — ${what}`, url: `/?openFailure=${first.id}` });
    }
    if (!first.assignee) {
      sendPush("failure_unassigned", engineerIds(), {
        title: "미배정 고장 — 먼저 잡는 사람이 담당",
        body: `${where} — ${what}`,
        url: `/?openFailure=${first.id}`,
      });
    }
  }
```

이걸 통째로 다음으로 교체(`failure_reported` 대상 변경 + 중복 제거만, `failure_escalated` 블록은 그대로):
```js
  function handleFailureReported(created) {
    const first = created[0];
    if (!first) return;
    const where = `${first.siteName} · ${created.map((f) => formatUnitLabel(f.elevatorNo)).filter(Boolean).join(", ") || "호기 미상"}`;
    const what = parseErrorCode(first.errorCode).faultType;
    const more = created.length > 1 ? ` 외 ${created.length - 1}건` : "";
    const engId = siteEngineerId(first.siteId);

    sendPush("failure_reported", [...new Set([...seniorAdminIds(), engId].filter(Boolean))], {
      title: `고장 접수 — ${what}`,
      body: `${where}${more}`,
      url: `/?openFailure=${first.id}`,
    });
    if (created.some((f) => f.escalation)) {
      sendPush("failure_escalated", adminIds(), { title: "중대 고장 접수", body: `${where} — ${what}`, url: `/?openFailure=${first.id}` });
    }
    if (!first.assignee) {
      // 해당현장 담당기사는 위 failure_reported로 이미 알림을 받았으니 여기서 또 안 보낸다.
      sendPush("failure_unassigned", engineerIds().filter((id) => id !== engId), {
        title: "미배정 고장 — 먼저 잡는 사람이 담당",
        body: `${where} — ${what}`,
        url: `/?openFailure=${first.id}`,
      });
    }
  }
```

- [ ] **Step 3: 빌드 확인**

```bash
cd /c/projects/elevator-field-app && npm run build
```
Expected: 에러 없이 빌드 성공.

- [ ] **Step 4: 실제 발송으로 대상 확인**

프로덕션 DB 기준, 담당기사가 있는 현장 하나를 골라(예: 이전 세션에서 쓴 `f98e8f73-5f71-46ca-b117-0721e946029a`=석승철이 담당인 현장) 로컬 프리뷰에서 그 현장으로 고장을 실제 접수해보고, `/api/push/send`가 호출한 `profileIds`를 서버 로그나 임시 `console.log`로 확인 — 최고/중간관리자 id들과 그 현장 담당기사 id가 섞여 있고 자재담당 관리자 id는 빠져 있어야 한다. (임시로 `sendPush` 안에 `console.log(key, profileIds)`를 넣었다가 확인 후 지운다.)

- [ ] **Step 5: 커밋**

```bash
git add app/components/ElevatorFieldApp.jsx
git commit -m "고장접수 알림 대상을 최고+중간관리자와 현장담당기사로 변경, 미배정 알림 중복 제거"
```

---

### Task 3: 집중관리현장 신규/후속 알림 (`handleFailureReported`)

**Files:**
- Modify: `app/components/ElevatorFieldApp.jsx` — `handleFailureReported` (Task 2에서 교체한 버전에 이어서 수정), 그리고 파일 상단 import 한 줄.

**Interfaces:**
- Consumes: `lib/utils.js`의 `recentFailuresBySite(failures, days, threshold)`, `entrapmentSitesRecent(failures, days)`(둘 다 기존 함수, 변경 없음). 컴포넌트 최상위의 `failures`(현재 상태, 이번 신규 건 미포함) 배열.
- Produces: 없음(이 태스크가 마지막 소비 지점).

- [ ] **Step 1: import에 `recentFailuresBySite`, `entrapmentSitesRecent` 추가**

`app/components/ElevatorFieldApp.jsx:8`의 import는 현재:
```js
import { addDays, profileIdByName, unitIdFor, parseErrorCode, formatUnitLabel } from "@/lib/utils";
```
다음으로 교체:
```js
import { addDays, profileIdByName, unitIdFor, parseErrorCode, formatUnitLabel, recentFailuresBySite, entrapmentSitesRecent } from "@/lib/utils";
```

- [ ] **Step 2: `handleFailureReported` 끝에 집중관리현장 판정 추가**

Task 2에서 만든 `handleFailureReported`의 마지막 `if (!first.assignee) { ... }` 블록 뒤, 함수를 닫는 `}` 앞에 추가:

```js
    // 집중관리현장 판정 — 이번 신규 건들을 빼고 계산한 상태(before)와 포함한 상태(after)를 비교해
    // 방금 기준을 넘겼는지(새로 발생), 이미 대상이었는데 또 접수됐는지(추가고장)를 가른다.
    // created는 항상 단일 현장이라(Global Constraints 참고) first.siteId 하나만 보면 된다.
    const isCritical = (list) =>
      recentFailuresBySite(list, 30, 3).has(first.siteId) || entrapmentSitesRecent(list, 30).has(first.siteId);
    const wasCritical = isCritical(failures);
    const isCriticalNow = isCritical([...failures, ...created]);
    if (!wasCritical && isCriticalNow) {
      sendPush("critical_site_new", [...adminIds(), ...engineerIds()], {
        title: "집중관리현장 발생",
        body: first.siteName,
        url: `/?openFailure=${first.id}`,
      });
    } else if (wasCritical && isCriticalNow) {
      sendPush("critical_site_repeat", seniorAdminIds(), {
        title: "집중관리현장 추가고장",
        body: first.siteName,
        url: `/?openFailure=${first.id}`,
      });
    }
```

- [ ] **Step 3: 빌드 확인**

```bash
cd /c/projects/elevator-field-app && npm run build
```
Expected: 에러 없이 빌드 성공.

- [ ] **Step 4: before/after 판정 로직 자체를 실제 데이터로 검증**

이 로직은 분기(`wasCritical`/`isCriticalNow` 조합 4가지)가 있는 비자명한 로직이라, 배포 전에 실제 DB 데이터로 한 번 확인한다. 프로젝트 루트에 임시 스크립트를 만들어 돌리고 지운다:

```bash
cd /c/projects/elevator-field-app && cat > ./check_critical.mjs << 'EOF'
import { createClient } from "@supabase/supabase-js";
import { recentFailuresBySite, entrapmentSitesRecent } from "./lib/utils.js";

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
const { data: rows } = await sb.from("failures").select("id,site_id,elevator_no,created_at,error_code");
const failures = rows.map((r) => ({ id: r.id, siteId: r.site_id, elevatorNo: r.elevator_no, createdAt: r.created_at, errorCode: r.error_code }));

// 이미 집중관리 대상인 현장 하나를 찾아 "추가고장" 케이스를, 대상이 아닌 현장 하나를 찾아
// "새로 발생" 케이스를 시뮬레이션해서 두 분기가 기대대로 갈리는지 확인.
const isCritical = (list, siteId) => recentFailuresBySite(list, 30, 3).has(siteId) || entrapmentSitesRecent(list, 30).has(siteId);
const criticalSiteIds = [...new Set(failures.map((f) => f.siteId))].filter((id) => isCritical(failures, id));
const normalSiteIds = [...new Set(failures.map((f) => f.siteId))].filter((id) => !isCritical(failures, id));
console.log("이미 집중관리 대상 현장 수:", criticalSiteIds.length, criticalSiteIds[0]);
console.log("집중관리 대상 아닌 현장 수:", normalSiteIds.length);

if (criticalSiteIds[0]) {
  const siteId = criticalSiteIds[0];
  const newOne = { id: "sim", siteId, elevatorNo: "1호기", createdAt: new Date().toISOString(), errorCode: "고장 (시뮬)" };
  const was = isCritical(failures, siteId);
  const now = isCritical([...failures, newOne], siteId);
  console.log("추가고장 시뮬 — wasCritical:", was, "isCriticalNow:", now, "기대: true/true → critical_site_repeat");
}
EOF
node --env-file=.env.local check_critical.mjs
rm check_critical.mjs
```
Expected: "이미 집중관리 대상 현장 수"가 0보다 크고, 대상 현장이 있으면 시뮬 출력이 `wasCritical: true isCriticalNow: true`로 나온다(추가고장 분기가 기대대로 동작). `wasCritical`이 `isCriticalNow`보다 false일 수 없다는 점(집중관리 대상은 고장이 늘어나는 방향으로만 판정됨)도 확인.

- [ ] **Step 5: 실제 발송으로 신규/후속 분기 확인**

`recentFailuresBySite`가 최근 30일 같은 호기 3회 이상을 기준으로 삼으므로, 아직 집중관리 대상이 아닌 호기 하나를 로컬 프리뷰에서 연속 3번 접수해보고 3번째에서만 `critical_site_new`가 전원에게 가는지, 4번째부턴 `critical_site_repeat`이 최고+중간관리자에게만 가는지 확인한다(Task 2 Step 4처럼 임시 `console.log`로 `sendPush` 호출 인자를 확인). 테스트로 넣은 고장 레코드는 확인 후 `failures` 테이블에서 직접 지운다.

- [ ] **Step 6: 커밋**

```bash
git add app/components/ElevatorFieldApp.jsx
git commit -m "집중관리현장 신규/추가고장 알림 추가"
```

---

### Task 4: `handleFailureResult`에 처리완료·처리중 에스컬레이션 알림 추가

**Files:**
- Modify: `app/components/ElevatorFieldApp.jsx:1047-1078` (`handleFailureResult` 후반부)

**Interfaces:**
- Consumes: Task 2의 `seniorAdminIds()`, `siteEngineerId(siteId)`, `adminIds()`, `engineerIds()`(기존).
- Produces: 없음.

- [ ] **Step 1: 현재 코드 확인**

`app/components/ElevatorFieldApp.jsx:1047-1078`은 (Task 1~3 적용 후에도 이 부분은 안 바뀌어 있음):
```js
    setFailures((prev) =>
      prev.map((x) =>
        x.id === failure.id
          ? {
              ...x,
              status: isClosed ? "완료" : isEscalation ? "미처리" : x.status,
              ...(isClosed ? { completeTime } : {}),
              ...(isEscalation ? { assignee: null, assigneeId: null, dispatchedAt: null, etaMinutes: null, arrivalTime: null, escalatedBy, escalatedById, escalatedAt, escalatedArrivalTime } : {}),
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
    // 지원요청·운행정지로 미배정 풀에 되돌린 건은 접수 때와 마찬가지로 기사 전원에게 알린다.
    // 이게 없으면 지원이 필요한 건이 미배정으로 돌아가도 아무도 모른다. (P2-7)
    if (isEscalation) {
      const unit = formatUnitLabel(failure.elevatorNo);
      sendPush("failure_unassigned", engineerIds(), {
        title: `${result} — 지원 필요 (미배정 복귀)`,
        body: `${failure.siteName}${unit ? ` ${unit}` : ""}`,
        url: `/?openFailure=${failure.id}`,
      });
    }
  }
```

- [ ] **Step 2: `setFailures(...)` 뒤부터 함수 끝까지 교체**

`// 지원요청·운행정지로...` 주석부터 함수를 닫는 `}`까지를 다음으로 교체:
```js
    const unit = formatUnitLabel(failure.elevatorNo);
    if (isClosed) {
      // 처리완료·오신고 — 최고+중간관리자와 그 현장 담당기사에게. 담당기사가 직접 처리한
      // 본인 건이어도 "확인용"으로 그대로 보낸다(누가 처리했든 알아야 하는 관리 성격의 알림).
      sendPush("failure_completed", [...new Set([...seniorAdminIds(), siteEngineerId(failure.siteId)].filter(Boolean))], {
        title: `고장 처리완료 — ${result}`,
        body: `${failure.siteName}${unit ? ` ${unit}` : ""}`,
        url: `/?openFailure=${failure.id}`,
      });
    }
    if (isEscalation) {
      // 처리 중 지원요청·운행정지로 바뀌면 관리자+기사 전원에게 — 미배정 풀로 되돌아간 급한
      // 건이라 선착순으로 잡을 기사뿐 아니라 관리자도 즉시 알아야 한다. (기존엔 기사에게만 갔다.)
      sendPush("failure_result_escalated", [...adminIds(), ...engineerIds()], {
        title: `${result} — 지원 필요 (미배정 복귀)`,
        body: `${failure.siteName}${unit ? ` ${unit}` : ""}`,
        url: `/?openFailure=${failure.id}`,
      });
    }
  }
```

- [ ] **Step 3: 빌드 확인**

```bash
cd /c/projects/elevator-field-app && npm run build
```
Expected: 에러 없이 빌드 성공.

- [ ] **Step 4: 실제 발송으로 두 케이스 확인**

로컬 프리뷰에서 진행 중인 고장 하나를 "처리완료"로 결과입력해보고 `failure_completed`가 최고+중간관리자와 그 현장 담당기사에게만 가는지(자재담당 관리자 id 빠짐) 확인. 다른 진행 중 고장을 "지원요청" 또는 "운행정지"로 결과입력해보고 `failure_result_escalated`가 관리자 전체(자재담당 포함)+기사 전체에게 가는지 확인(Task 2 Step 4와 같은 방식 — 임시 `console.log`로 `sendPush` 인자 확인 후 제거).

- [ ] **Step 5: 딥링크 확인**

두 케이스 모두 실제 기기(또는 로컬 프리뷰)에서 알림을 눌러 해당 고장 상세 시트가 뜨는지 확인 — `/?openFailure=` 딥링크는 이미 검증된 패턴이라 형식만 맞으면 동작한다.

- [ ] **Step 6: 커밋**

```bash
git add app/components/ElevatorFieldApp.jsx
git commit -m "고장 처리완료·처리중 지원요청운행정지 알림 추가"
```

---

## Self-Review

**스펙 커버리지:**
- 고장접수 → 최고+중간관리자+현장담당기사, 긴급, 딥링크: Task 2 ✅
- 처리완료 → 최고+중간관리자+현장담당기사, 긴급, 딥링크: Task 4 ✅
- 지원요청·운행정지(처리 중) → 관리자 전체+기사 전체, 긴급, 딥링크: Task 4 ✅ (설계 확정대로 접수 시점 `failure_escalated`는 그대로 유지 — Task 2에서 손 안 댐)
- 집중관리현장 신규 → 전원 1회: Task 3 ✅
- 집중관리현장 후속 → 최고+중간관리자만, 매 건: Task 3 ✅
- 미배정 알림 중복 제거(사용자 추가 요청): Task 2 ✅
- 알림설정 화면 노출: Task 1 ✅

**타입/시그니처 일관성:** `seniorAdminIds()`/`siteEngineerId(siteId)`는 Task 2에서 정의되고 Task 3·4에서 그 이름 그대로 쓰인다. `sendPush(key, profileIds, {title, body, url})` 시그니처는 기존 그대로 재사용, 변경 없음.

**플레이스홀더 스캔:** 없음 — 모든 스텝에 실제 코드/명령어 포함.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-08-04-failure-lifecycle-notifications.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**