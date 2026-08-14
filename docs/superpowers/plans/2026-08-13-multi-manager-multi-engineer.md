# 현장 담당자·담당 기사 복수 지정 — 논의 정리 (2026-08-13)

> 결정된 설계를 정리한 것이지 구현 계획이 아니다. 코드는 하나도 안 건드렸다.

## 배경

한 현장에 담당자를 2명으로 두는 걸 검토. "담당자"가 두 가지 다른 개념이라 나눠서
정리한다.

- **현장 담당자(고객사 쪽 연락처)** — 건물주·관리소장 등, `site_managers` 테이블
- **담당 기사(우리 회사 기사)** — 그 현장을 맡는 엔지니어, `sites.assigned_engineer`

## A. 현장 담당자(고객사) 2명 — 이미 거의 다 돼있음

`site_managers` 테이블은 애초에 site당 N명을 전제로 설계돼 있다:
- `site_id`에 유일 제약 없음 (N:1 허용)
- `is_primary`(대표 담당자) 플래그가 이미 있음
- `docs/DESIGN-v2.md`에도 "현장 연락처 N명"으로 명시돼 있던 설계

**이미 다중 담당자를 다루고 있는 화면:**
- `SitesAdmin.jsx` — 담당자 추가/수정/삭제 + "★ 대표 담당자로 지정" 버튼까지 완비
- `SiteTab.jsx`(기사앱) — 대표 담당자를 먼저 보여주고 나머지는 "담당자 더보기 (N명)"로 접힘
- `QuoteRecipientFields.jsx`(견적 수신자 선택) — 담당자 목록 드롭다운에 "(대표)" 표시까지 있음

**손볼 곳은 딱 하나:**
- `MaterialsAdmin.jsx`의 자재신청 카드 — 대표 담당자 연락처만 한 줄로 보여줌. 2명이
  흔해지면 SiteTab의 "더보기" 패턴을 재사용해서 "대표 + 외 1명"처럼 보이게 하면 됨.

**정책 문제(결정 필요 없음):** 알림톡·문자는 애초에 담당자를 자동으로 고르는 로직이
없고 보낼 때마다 사람이 수신처를 선택하는 구조라, 2명이어도 그중 골라 보내면 되고
자동화가 따로 필요하지 않음.

## B. 담당 기사(우리 회사) 2명 — 실제로 손볼 게 있음

`site_assignments` 테이블(기사↔현장, N:M, `unique(site_id, tech_id)`)이
migration 003부터 이미 있어서 **스키마 자체는 이미 여러 명을 허용**한다. 문제는
실제로 앱이 읽는 값이 이 테이블이 아니라 `sites.assigned_engineer`(단일 문자열
컬럼)이고, 배정할 때마다(`SitesAdmin.jsx`) `site_assignments`를 지우고 1건만
다시 넣는 방식이라 — 테이블은 N:M인데 쓰는 방식이 항상 1명으로 눌러버리고 있다.

**고쳐야 할 곳 (전부 `assignedEngineer` 단일값 비교를 쓰는 곳):**
1. `SitesAdmin.jsx` — 배정 UI를 단일선택 → 다중선택으로, "삭제 후 1건 재삽입"을
   그만두고 N건 유지하도록
2. `lib/mappers.js` — `sites.assignedEngineer`를 문자열 하나 대신 배열로 매핑
3. "내 현장만" 필터 4곳 — 전부 `s.assignedEngineer === CURRENT_ENGINEER`(동등비교)를
   `.includes(CURRENT_ENGINEER)`(멤버십 체크)로 바꿔야 함:
   - `HomeTab.jsx` (611번째 줄)
   - `SiteTab.jsx` (619번째 줄)
   - `CheckupTab.jsx`(자체점검, 126·132번째 줄)
   - `InspectionTab.jsx`(검사관리, 95번째 줄)
4. 고장 알림 등 담당기사에게 보내는 알림(`ElevatorFieldApp.jsx`의 `siteEngineerId()`,
   925-948·1147-1153·2050-2056번째 줄) — 지금은 1명한테만 가는데 2명 다 받게 팬아웃 필요
5. `SelfChecksAdmin.jsx`(관리자 콘솔 "자체점검 현황") — 아래 B-1 참고. 위 4곳과 달리
   "내 현장 필터"가 아니라 "기사별 집계+총계" 화면이라 별도로 챙겨야 함.

**다행히 새로 설계할 패턴은 아님:** 견적/자재 지급완료 시 `assignees` 배열로 여러
담당자에게 할일·알림을 각각 만드는 로직(`handleCompleteQuoteSupply`)이 이미 있어서,
같은 패턴을 현장 배정에도 그대로 적용하면 된다. `site_assignments.is_lead` 플래그도
이미 있으니 "주담당/보조" 구분(예: 누가 대표로 알림 받는지)이 필요하면 이걸 재사용
하면 됨 — `site_managers.is_primary`와 같은 역할.

## B-1. 집계 화면(자체점검현황) — 총대수 이중계산 주의 (2026-08-14 추가)

위 4곳(`HomeTab`·`SiteTab`·`CheckupTab`·`InspectionTab`)은 전부 "로그인한 기사 본인
기준으로 내 현장만 거르는" 필터라 `===`를 `.includes()`로 바꾸기만 하면 끝난다. 그런데
`SelfChecksAdmin.jsx`(관리자 콘솔)는 성격이 다르다 — **기사 전원을 한 화면에 집계**하는
표라서, 같은 방식으로 손대면 총대수가 부풀어 오르는 버그가 생긴다.

**지금 구조** ([SelfChecksAdmin.jsx:245-278](../../../app/components/admin/SelfChecksAdmin.jsx#L245)):

```js
const rows = selfChecks.filter(c => c.ym === ym).map(c => {
  const currentAssignee = s?.assignedEngineer ? data.profiles.find(p => p.name === s.assignedEngineer) : null;
  return { ...c, assigneeId: currentAssignee?.id ?? null, ... };
});
const done = rows.filter(c => c.status === "완료");   // 총대수: "ym 진행률 — 완료 X / rows.length"

const groups = new Map();
for (const r of rows) {
  const key = r.assigneeId ?? "__unassigned";          // 기사 1명당 그룹 1개 → "담당대수"(g.total)
  groups.get(key).push(r);
}
```

`rows`는 **호기(unit) × 월 = 1줄**이라 지금은 총대수가 항상 정확하다. 문제는
`assignedEngineer`가 배열이 됐을 때 흔히 하는 실수 — "기사 수만큼 줄을 복제해서
groups에 넣자"는 식으로 **`rows` 생성 단계 자체에서 팬아웃**하면, 2명 배정된 현장의
호기가 두 줄이 되면서 `rows.length`(=상단 총대수·진행률)까지 같이 부풀어버린다.

**설계 원칙 — 총계 소스와 집계 소스를 분리한다:**

- `rows`(총대수·진행률의 근거)는 지금처럼 **호기 1개 = 1줄**을 절대 건드리지 않는다.
  `assigneeId`는 이제 배열(`assigneeIds`)이 되지만, row 자체는 복제하지 않는다.
- `groups`(기사별 "담당대수" 집계)를 만드는 단계에서만 `assigneeIds`를 순회해서
  **같은 row 참조를 여러 그룹에 push**한다. 이러면 2명 배정 현장은 두 기사의
  "담당대수" 열엔 각각 반영되지만, `rows.length` 자체는 늘지 않으니 상단 총대수는
  그대로 유지된다.
- 즉 고칠 곳은 딱 `groups` 구성 루프(261-266번째 줄) — `assigneeId` 단일값 순회를
  `assigneeIds` 배열 순회로 바꾸되, **`rows` 배열 자체에는 손대지 않는다.**

이 원칙(총계는 원본 레코드에서 직접 계산, 그룹별 집계에서만 배열을 펼친다)은 이번에
새로 생길 수 있는 다른 "기사별 집계+합계" 화면에도 그대로 적용해야 한다.

## 요약 비교

| | 현장 담당자(고객사) | 담당 기사(우리 회사) |
|---|---|---|
| 스키마 | 이미 N:1 설계, 사용 중 | N:M 테이블 있는데 미사용(늘 1건으로 눌림) |
| 손볼 화면 수 | 1곳(`MaterialsAdmin` 표시만) | 최소 7곳(배정 UI·매퍼·필터 4곳·집계 화면·알림) |
| 필요한 새 패턴 | 없음 | 없음(견적 다중배정 팬아웃 재사용 가능) |
| 난이도 | 낮음 | 중간 — 필터링·집계·알림까지 건드려야 함 |
