# 현장 담당자·담당 기사 복수지정 Design

## 목표

한 현장에 담당자를 2명(이상)으로 둘 수 있게 한다. "담당자"는 두 가지 다른 개념이라
나눠서 다룬다:

- **현장 담당자(고객사 쪽 연락처)** — `site_managers` 테이블. 이미 N:1로 설계·사용
  중이라 스코프가 작다.
- **담당 기사(우리 회사 기사)** — `sites.assigned_engineer`(단일 문자열)로 앱 전체가
  읽고 있는데, 실제 스키마(`site_assignments`, N:M)는 이미 있지만 안 쓰이고 있다.
  이 문서의 핵심은 이 부분이다.

배경 논의는 [2026-08-13-multi-manager-multi-engineer.md](../plans/2026-08-13-multi-manager-multi-engineer.md) 참고.

## A. 현장 담당자(고객사) — 손볼 곳 1곳

`MaterialsAdmin.jsx`의 자재신청 카드가 대표 담당자 연락처만 한 줄로 보여준다.
`SiteTab.jsx`의 "담당자 더보기 (N명)" 패턴을 재사용해 "대표 + 외 1명"처럼 보이게
고친다. 그 외 화면(`SitesAdmin.jsx`, `SiteTab.jsx`, `QuoteRecipientFields.jsx`)은
이미 다중 담당자를 다루고 있어 손댈 게 없다.

## B. 담당 기사(우리 회사)

### B-0. 데이터 계층 — `assignedEngineer`는 유지, `assignedEngineers`를 파생 추가

**로딩**: `ElevatorFieldApp.jsx`의 최초 `Promise.all`(약 730번째 줄)에
`supabase.from("site_assignments").select("*")`를 추가한다. `site_assignments`는
현재 760건으로 `sites.assigned_engineer`가 채워진 759건과 정확히 일치한다(듀얼라이트가
이미 백필돼 있음) — **별도 백필 마이그레이션 불필요**.

**병합**: sites를 매핑한 뒤, `site_assignments`를 `site_id`로 그룹핑해 `tech_id`를
`profiles.name`으로 조인, `is_lead`가 `true`인 것을 0번째로 정렬한 이름 배열을 만들어
merge한다.

```js
const byId = new Map(profilesAll.map(p => [p.id, p.name]));
const bySite = new Map();
for (const a of siteAssignmentsRes.data ?? []) {
  const name = byId.get(a.tech_id);
  if (!name) continue;
  if (!bySite.has(a.site_id)) bySite.set(a.site_id, []);
  bySite.get(a.site_id).push({ name, isLead: a.is_lead });
}
for (const arr of bySite.values()) arr.sort((a, b) => (b.isLead - a.isLead));

const mappedSites = (sitesRes.data ?? []).map(mapSite).map(s => {
  const names = (bySite.get(s.id) ?? []).map(x => x.name);
  return { ...s, assignedEngineers: names, assignedEngineer: names[0] ?? null };
});
```

**중요한 설계 결정 — `assignedEngineer`(단수)를 `sites.assigned_engineer` 컬럼에서
직접 읽지 않고, 위처럼 `assignedEngineers[0]`에서 파생시킨다.** 컬럼에서 직접 읽으면
`assignedEngineer`와 `assignedEngineers`가 서로 다른 테이블에서 독립적으로 채워져,
듀얼라이트 중 한쪽이 나중에 깨지면(2인 개발 환경에서 흔한 실수) 에러 없이 조용히
값이 어긋난다. 파생시키면 `site_assignments`가 앱 안에서 유일한 진실 공급원이 되어
구조적으로 어긋날 수 없다. `sites.assigned_engineer` 컬럼 자체는 계속 듀얼라이트
한다(엑셀 export, 관리자 외 도구 등 앱 밖에서 이 컬럼을 직접 읽는 코드를 위한
하위호환용).

`lib/mappers.js`의 `mapSite()` 자체는 변경 없음(순수 per-row 매퍼라 다른 테이블을
조인할 수 없음) — 병합은 위처럼 로딩 직후 한 번만 한다.

### B-1. 40개 호출부 — 7개 카테고리 규칙

`assignedEngineer` 사용처 전수조사 결과 15개 파일, 40곳 이상. 파일별로 따로 판단하지
않고 화면 성격별로 7개 규칙을 정하고 파일을 규칙에 배정한다.

| 규칙 | 내용 | 대상 |
|---|---|---|
| **M. 소속 판정** | `s.assignedEngineer === X` → `s.assignedEngineers.includes(X)` / `!s.assignedEngineer` → `!s.assignedEngineers?.length` | `CheckupTab.jsx`(126,132), `HomeTab.jsx`(611), `InspectionTab.jsx`(95), `SiteTab.jsx`(619), `EngineersAdmin.jsx`(347, 담당대수 카운트 — 합산 총계로 쓰이는 곳 없음 확인됨), `VerifyImport.jsx`(740), `SitesAdmin.jsx`(553,975, 미배정 필터), `ElevatorFieldApp.jsx`(2052, `siteAssigneeById` — 알림 팬아웃이 아니라 본인 알림벨 필터. `.includes(myName)`으로) |
| **D. 목록/표 표시** | 좁은 자리(배지·표 셀)는 "대표 + 외 N명", 넓은 자리(상세 카드)는 `assignedEngineers.join(", ")` | `ContractDashboard.jsx`(146), `Dashboard.jsx`(52,392,439), `FailureTab.jsx`(155,472), `InspectionsAdmin.jsx`(95,198), `SiteTab.jsx`(515, 상세), `SitesAdmin.jsx`(1042-1043 배지, 1136 상세) |
| **N. 알림 팬아웃** | `siteEngineerId()`(단수) → `siteEngineerIds()`(배열). `sendPush([...set, engId])` → `[...set, ...engIds]`, 제외비교는 `!engIds.includes(id)` | `ElevatorFieldApp.jsx`(388 정의, 925-948 `handleFailureReported`, 1147-1153) |
| **L. 대표 전용 로직** | 개념 자체가 "대표 1명"인 곳은 그대로 둔다 | `SitesAdmin.jsx`(786, `changeLead` — "주담당 변경") |
| **F. 폼 프리필/검색** | 프리필은 대표로(기존 UX 유지), 검색 haystack만 넓힌다 | `FailuresAdmin.jsx`(257 유지, 368 `assignedEngineers.join(" ")`로 확장) |
| **G. 지도 마커색** | 마커 색상은 대표 기준 유지(다색 마커는 과설계), 툴팁 텍스트만 전체 표시 | `SiteMapModal.jsx`(69,169 마커색 유지 / 179 툴팁 `join(", ")`로) |
| **I. 엑셀 일괄등록** | 이번 스코프 밖 — 1명만 파싱, 2번째 기사는 등록 후 `SitesAdmin`에서 추가 | `ImportSites.jsx`(104,178,184, 변경 없음) |

`assignedEngineer`가 B-0의 파생 방식대로면 M/N/L 이외의 규칙은 대부분 **코드 변경이
필요 없다**(대표 이름을 그대로 보여주므로) — 실제로 코드를 고쳐야 하는 건 M(소속 판정,
8곳)과 N(알림 팬아웃, 3곳), 그리고 D 중 "2명 다 보여주고 싶은" 자리(배지·상세 등,
표시 품질 개선이라 필수는 아님 — 우선 M/N부터 하고 D는 여유 되는 만큼).

### B-2. `SitesAdmin.jsx` 배정 UI — 단일 select → 다중 select

- 폼 상태: `form.assignedEngineer`(문자열) → `form.assignedEngineers`(배열) +
  `form.leadEngineer`(그중 대표 1명, 라디오로 지정 — 체크박스 여러 개 중 정확히 하나만
  대표가 되도록 UI에서 강제한다. `is_lead`가 사이트당 정확히 1개여야 B-0의 정렬이
  깨지지 않는다).
- 저장 시: `site_assignments`를 `delete().eq("site_id", id)` 후 배열 수만큼
  재삽입(`is_lead`는 `leadEngineer`와 일치하는 것만 true) — 지금 "삭제 후 1건" 패턴을
  "삭제 후 N건"으로 그대로 확장. 새 패턴 필요 없음.
- `sites.assigned_engineer`(레거시)는 계속 `leadEngineer` 이름으로 듀얼라이트.
- 일괄배정(637-651번째 줄, 체크한 현장들에 일괄 배정)은 이번엔 **1명 배정만 유지**
  (그대로) — 대량 작업에서 다중 배정 UX까지 만드는 건 이번 스코프 밖, 필요하면 이후
  확장.

### B-3. `SelfChecksAdmin.jsx` 집계 — 총대수 이중계산 방지

앞서 정리한 대로: 자체점검현황은 "내 현장 필터"가 아니라 "기사별 집계+총계" 화면이라
M 규칙을 그대로 적용하면 총대수가 부풀어 오른다.

```js
const rows = selfChecks.filter(c => c.ym === ym).map(c => {
  const currentAssignees = s?.assignedEngineers ?? [];   // 배열로 변경
  const assigneeIds = currentAssignees.map((n) => profileIdByName(data.profiles, n)).filter(Boolean); // lib/utils.js 기존 헬퍼
  return { ...c, assigneeIds, ... };
});
const done = rows.filter(c => c.status === "완료");   // 총대수 — rows는 여전히 unit×월 1줄, 복제 안 함

const groups = new Map();
for (const r of rows) {
  const keys = r.assigneeIds.length ? r.assigneeIds : ["__unassigned"];
  for (const key of keys) {                              // 같은 row를 여러 그룹에 push — rows 자체는 안 늘어남
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(r);
  }
}
```

`rows`(총대수·진행률의 근거)는 절대 복제하지 않는다 — 고칠 곳은 `groups` 구성
루프뿐이다.

### B-4. `SelfChecksAdmin.jsx` "할일로 발행" — 둘 다 앞으로, 하나 청구 시 둘 다 자동완료

견적 지급완료 시 이미 있는 패턴([`handleCompleteQuoteSupply`](../../../app/components/ElevatorFieldApp.jsx#L1713),
[`BillingTab.jsx:90-102`](../../../app/components/tabs/BillingTab.jsx#L90))을 그대로
재사용한다 — 새 메커니즘 불필요.

1. `SelfChecksAdmin.jsx`의 `publish(row)`(167-192번째 줄) — 지금은
   `id: todo-selfcheck-${row.id}` 단일 고정 id로 1건만 생성. → `row`의
   `assignedEngineers`(해당 현장의 기사 배열) 수만큼 `id: todo-selfcheck-${row.id}-${idx}`로
   각각 생성(견적 패턴과 동일한 인덱스 접미사). 모든 형제 할일이
   `self_check_item_id: row.id`(이미 있는 컬럼, 마이그레이션 089)를 공유 — 이게 "같은
   지적사항"이라는 연결고리가 된다.
2. `BillingTab.jsx:93`의 형제 할일 탐색 조건(`idsToComplete`)에 한 줄 추가:
   ```js
   (selected.quoteRequestId && t.quoteRequestId === selected.quoteRequestId) ||
   (selected.materialRequestId && t.materialRequestId === selected.materialRequestId) ||
   (selected.selfCheckItemId && t.selfCheckItemId === selected.selfCheckItemId)   // 추가
   ```
   기사 A가 비용청구하면 A·B의 두 할일이 한 번에 `done: true`로 완료 처리된다.
3. 알림도 견적 패턴처럼(1772-1780번째 줄) 기사별로 각자의 todo id로 딥링크 푸시를
   따로 보낸다.
4. `openFlagCount`(290번째 줄, "미발행" 카운트)와 발행 여부 판정(152번째 줄,
   `todos.find(t => t.selfCheckItemId === it.id)`)은 "이 지적사항에 대해 todo가 하나라도
   있는가"라 형제 할일이 여러 건이어도 그대로 동작 — 변경 불필요.

## 마이그레이션

없음 — `site_assignments`가 이미 `sites.assigned_engineer`와 1:1로 백필돼 있어(760=759)
스키마·데이터 변경 없이 읽기 전환만 하면 된다.

## 범위 밖

- 현장 담당자(고객사)·담당 기사(우리 회사) 모두 3명 이상으로 확장하는 UI 세부 튜닝 —
  이번엔 "2명"을 기준으로 설계하되 배열이라 3명째부터도 구조적으로는 막혀있지 않음.
- `ImportSites.jsx` 엑셀 일괄등록에서 다중 담당자 파싱 — I 규칙 참고, 이후 필요 시 별도.
- `SitesAdmin.jsx` 일괄배정(체크박스 다건 처리)의 다중 기사 지원 — B-2 참고, 이후 필요 시 별도.
- 알림톡·문자 발송 시 담당자 자동 선택 — 원래도 사람이 수신처를 골라 보내는 구조라
  자동화 불필요(원 논의 문서 결론 유지).
