# 고장처리 진행단계 알림 확대 설계

**목표:** 고장접수·처리완료·지원요청/운행정지(처리 중)·집중관리현장 발생을 관리자·기사에게 긴급 알림으로 보내고, 알림을 누르면 해당 고장신고 상세로 바로 이동하게 한다.

**배경:** 현재 `failure_reported`(고장접수)는 관리자 전체(자재담당 포함)에게만 가고 현장 담당기사에게는 안 간다. "처리완료"는 알림 자체가 없다. 지원요청/운행정지는 접수 시점엔 관리자에게만(`failure_escalated`), 처리 중 발생하면 기사에게만(`failure_unassigned`) 간다. 집중관리현장(최근 30일 같은 호기 3회+ 고장, 또는 갇힘사고 1건+)은 화면 표시용 계산만 있고 알림 트리거가 없다.

## Global Constraints

- 딥링크는 기존 확립된 패턴 그대로: `url: "/?openFailure=${failure.id}"` (경로는 모바일에서 무시되므로 관리자/기사 구분 없이 동일 URL 사용).
- 알림 레벨은 전부 `urgent`(긴급 — 소리·진동·헤드업), `trigger: "instant"`.
- "최고관리자, 중간관리자"는 `profiles.admin_tier !== "material"`인 관리자(= super + manager, 자재담당 제외)를 뜻한다.
- "모든사람"은 관리자 전체(자재담당 포함) + 기사 전체를 뜻한다.
- "해당현장 담당자"는 그 현장의 상시 담당기사(`site.assignedEngineer`)를 뜻한다 — 그 고장 건에 배정된 기사(`failure.assignee`)와는 별개 개념이며, 미배정 상태에서도 항상 대상에 포함된다.
- 기존 알림(배정/재배정/거부/접수 시점 중대건 `failure_escalated`/미배정 `failure_unassigned`)의 동작은 이 설계로 변경하지 않는다. 단, 처리 중 지원요청/운행정지 시의 기존 `failure_unassigned` 발송은 새 `failure_result_escalated`로 대체된다(중복 방지).

---

## A. 알림 카탈로그 변경 (`lib/notifications.js`)

| key | 상태 | 문구(예시) | audience(표시용) | 실제 대상 | level |
|---|---|---|---|---|---|
| `failure_reported` | 기존 항목의 **대상만 변경** | "고장 접수 — {유형}" | admin | 최고+중간관리자 + 해당현장 담당기사 | urgent |
| `failure_completed` | **신규** | "고장 처리완료 — {현장} {호기}" | admin | 최고+중간관리자 + 해당현장 담당기사 | urgent |
| `failure_result_escalated` | **신규** (처리 중 지원요청/운행정지) | "{지원요청/운행정지} 발생 — 확인 필요" | all | 관리자 전체 + 기사 전체 | urgent |
| `critical_site_new` | **신규** | "집중관리현장 발생 — {현장명}" | all | 관리자 전체 + 기사 전체 (현장당 딱 1회) | urgent |
| `critical_site_repeat` | **신규** | "집중관리현장 추가고장 — {현장명}" | admin | 최고+중간관리자만 (그 현장이 집중관리 대상인 동안 매 건) | urgent |

`audience` 컬럼은 `NotifySettings.jsx` 표시/그룹핑용 값이고, 실제 발송 대상은 아래 B처럼 호출부에서 `profileIds`를 직접 계산해 넘긴다(기존 `failure_reported`/`failure_escalated` 등과 동일한 패턴 — `audienceTiers` 서버 필터링은 타지 않음).

모든 항목 `group: "고장"`.

## B. 대상자 계산

`ElevatorFieldApp.jsx`에 이미 있는 `adminIds()`/`engineerIds()` 옆에 헬퍼 2개 추가:

```js
const seniorAdminIds = () =>
  profilesAll.filter((p) => p.role === "admin" && p.is_active !== false && p.adminTier !== "material").map((p) => p.id);

const siteEngineerId = (siteId) => {
  const site = sites.find((s) => s.id === siteId);
  return site?.assignedEngineer ? profileIdByName(profilesAll, site.assignedEngineer) : null;
};
```

- `failure_reported`, `failure_completed` → `[...new Set([...seniorAdminIds(), siteEngineerId(siteId)].filter(Boolean))]`
- `failure_result_escalated`, `critical_site_new` → `[...adminIds(), ...engineerIds()]`
- `critical_site_repeat` → `seniorAdminIds()`

**중복 알림 제거**: `handleFailureReported`에서 미배정(`!first.assignee`)이라 `failure_unassigned`를 기사 전체에게 보낼 때, 이미 `failure_reported`로 알림을 받은 해당현장 담당기사는 대상에서 뺀다:
```js
sendPush("failure_unassigned", engineerIds().filter((id) => id !== siteEngineerId(first.siteId)), { ... });
```

## C. 트리거별 구현 위치

1. **`failure_reported`** — `handleFailureReported` 내 기존 `sendPush("failure_reported", adminIds(), ...)` 호출을 `sendPush("failure_reported", [...new Set([...seniorAdminIds(), siteEngineerId(first.siteId)].filter(Boolean))], ...)`로 교체.
2. **`failure_completed`** — `handleFailureResult`에서 `isClosed`(처리완료 또는 오신고)일 때 새로 추가.
3. **`failure_result_escalated`** — `handleFailureResult`의 `isEscalation` 분기에서 기존 `sendPush("failure_unassigned", engineerIds(), {...})`를 `sendPush("failure_result_escalated", [...adminIds(), ...engineerIds()], {...})`로 교체.
4. **`critical_site_new` / `critical_site_repeat`** — `handleFailureReported`에서, 저장된 새 고장들의 siteId별로 D의 판정을 돌려 둘 중 하나(또는 무해당)를 보낸다.

## D. 집중관리현장 신규/후속 판정

기존 `lib/utils.js`의 `recentFailuresBySite(failures, days=30, threshold=3)`와 `entrapmentSitesRecent(failures, days=30)`를 그대로 재사용한다(로직 변경 없음, 판정 기준 그대로: 같은 호기 30일 내 3회+ 또는 갇힘사고 1건+).

`handleFailureReported`에서 새로 저장된 고장이 속한 siteId마다:

```js
const isSiteCritical = (siteId, failuresList) =>
  recentFailuresBySite(failuresList, 30, 3).has(siteId) || entrapmentSitesRecent(failuresList, 30).has(siteId);

// created(이번에 새로 저장된 고장들)에 포함된 siteId마다 한 번씩만 판정 — 같은 현장 여러 호기가
// 동시 접수돼도 critical_site_new/repeat가 siteId당 중복 발송되지 않게 한다.
const siteIdsInBatch = [...new Set(created.map((f) => f.siteId))];
for (const siteId of siteIdsInBatch) {
  const site = sites.find((s) => s.id === siteId);
  const firstOfSite = created.find((f) => f.siteId === siteId);
  const before = isSiteCritical(siteId, failures); // 핸들러 진입 시점의 기존 failures 배열(이번 신규 건 미포함)
  const after = isSiteCritical(siteId, [...failures, ...created]); // 이번 신규 건 포함
  if (!before && after) {
    sendPush("critical_site_new", [...adminIds(), ...engineerIds()], { title: "집중관리현장 발생", body: site?.name ?? firstOfSite.siteName, url: `/?openFailure=${firstOfSite.id}` });
  } else if (before && after) {
    sendPush("critical_site_repeat", seniorAdminIds(), { title: "집중관리현장 추가고장", body: site?.name ?? firstOfSite.siteName, url: `/?openFailure=${firstOfSite.id}` });
  }
}
```

## E. 딥링크

전부 기존 확립 패턴: `url: "/?openFailure=${failure.id}"`. 이미 `onPushNotificationOpened`(경로 무시, 쿼리만 사용)로 검증된 방식이라 관리자/기사 구분 없이 동일 URL로 양쪽 다 정상 동작한다.

---

## 영향받는 파일

- `lib/notifications.js` — 카탈로그 항목 추가/변경 (알림설정 화면에 새 행 노출)
- `app/components/ElevatorFieldApp.jsx` — `seniorAdminIds()`/`siteEngineerId()` 헬퍼 추가, `handleFailureReported`/`handleFailureResult` 수정

관리자웹(PC) 쪽 대응 알림 발송 코드(`FailuresAdmin.jsx`, `Dashboard.jsx` 등에 동일 트리거가 있다면)는 구현 단계에서 실제로 존재하는지 확인 후 동일하게 맞춘다 — 이 세션 초반에 확인했듯 고장접수/처리결과 입력은 모바일 기사 앱에서만 이뤄지는 흐름이라(PC 관리자는 배정·재배정만 함) 해당 없을 가능성이 높다.
