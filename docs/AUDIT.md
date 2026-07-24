# 전체 점검 — 버그리스트 & 수정리스트 (2026-07-24)

로그인·마이페이지 착수 전 백엔드/프론트/QA/관리자콘솔 5개 병렬 감사 결과를 중복 제거·심각도 정렬한 것.
심각도: **P0** 크래시·데이터유실·안전, **P1** 명확한 기능버그, **P2** 엣지케이스·정합성·역할누수, **P3** 코드건강.
`[확인]`=코드 직접 검증됨, `[추정]`=실데이터/런타임 의존.

---

## P0 — 즉시 (크래시 / 데이터 유실 / 안전)

- [x] **P0-3 `[확인]` 호기 선택이 units 테이블을 안 보고 개수로 1..N을 합성 — 잘못된 호기로 접수됨** — (수정·검증 2026-07-24)
  `siteUnits(site)`가 `unitCount`로 `1호기..N호기`를 만들어 고장접수·자재·견적·청구가 전부 이걸 썼다(자체점검만 `siteUnitList` 사용).
  실데이터에서 **15개 현장의 호기 번호가 개수와 다름**:
  - 국방부본부: 선택지 `1~32호기`가 떴지만 실제는 `1-6,17-34,36,38-40,45-48` → 없는 7~16호기 선택 가능(허위 접수), 33·34·36·38~40·45~48호기는 접수 자체 불가
  - 뉴베리청담: 실제 `3호기` 1대인데 `1호기`로만 접수됨 / 미주메디컬빌딩: 실제 `2호기`인데 `1호기`
  → 수정: 전 화면 `siteUnitList(site, units)`로 교체 + 호기 버튼을 `24호기 / 합참본부-1` 2줄 표기.
  `siteUnits`는 fallback 전용으로 강등(주석 경고 추가).

- [x] **설치장소·호기 분리** — (수정 2026-07-24) `units.install_place`가 이미 있었으나 876대 중 **782대가 호기 라벨 잔재**(`1-{seq}`)로 채워져 화면에서 미사용 상태였다.
  → `058_clear_legacy_install_place.sql`로 잔재 782건 NULL 정리(실제 동번호 101-*/102-*/339-* 8건은 보존),
  `realInstallPlace()` 방어 헬퍼 추가, SitesAdmin 호기 표에 **설치장소 입력 컬럼** 신설.


- [x] **P0-1 `[확인]` 처리현황 재배정 시 관리자 화면 크래시** — (수정·검증 2026-07-24) — [FailureTab.jsx:1303](../app/components/tabs/FailureTab.jsx#L1303)
  `FailureStatusOverview({ failures, onReassign })`(1246)에 없는 `attendances`/`todayLeaves`를 1303행이 참조 → 관리자가 처리현황에서 배정된 미완료 건 "재배정" 클릭 시 ReferenceError.
  → 수정: FailureTab(두 prop 이미 보유)에서 FailureStatusOverview로 내려주고 시그니처에 추가.

- [x] **P0-2 `[확인]` 고장 접수 insert 무방비 → 신고 소실 가능** — (수정 2026-07-24) — [FailureTab.jsx:56](../app/components/tabs/FailureTab.jsx#L56)
  접수 insert의 `error` 미확인 + 즉시 낙관적 setFailures. write 실패 시 신고자는 접수완료로 보이나 DB엔 없음(갇힘사고 안전 직결).
  → 수정: insert 결과 error 검사, 실패 시 롤백 + 에러 토스트.

---

## P1 — 명확한 기능 버그

- [x] **P1-1 `[확인]` 다중 호기 직접입력 청구가 PK 충돌로 조용히 유실** — (수정 2026-07-24: crypto.randomUUID) — [BillingTab.jsx:126](../app/components/tabs/BillingTab.jsx#L126) + [ElevatorFieldApp.jsx:777](../app/components/ElevatorFieldApp.jsx#L777)
  `submitManual`이 호기마다 `onSubmitBilling` 동기 호출 → `id:"bill-"+Date.now()` 같은 ms 중복 PK → 2번째부터 insert 실패(에러 미체크), UI엔 N건 낙관적 표시 → 새로고침 시 유실.
  → 수정: id에 인덱스/랜덤 접미사(예: `bill-${Date.now()}-${i}` 또는 `crypto.randomUUID()`).

- [x] **P1-2 `[확인]` 할일 자동완료가 청구 insert보다 선행 + insert 에러 미체크 → 자재 로스** — (수정 2026-07-24: 청구 성공 후 완료로 순서 반전) — [BillingTab.jsx:93](../app/components/tabs/BillingTab.jsx#L93) + [ElevatorFieldApp.jsx:791](../app/components/ElevatorFieldApp.jsx#L791)
  `submitMaterial`이 todo.done=true를 먼저 확정 후 청구 insert. insert 실패 시 할일은 영구완료·청구는 없음(DESIGN 7-2 로스방지 루프 위반). 로스리포트도 done이라 못 잡음.
  → 수정: 청구 insert 성공 확인 후 todo 완료로 순서 반전(또는 실패 시 done 롤백).

- [x] **P1-3 `[확인]` 우리방 글 인라인 수정 시 키 입력마다 포커스 상실 + 게시글 전량 리마운트** — (수정 2026-07-24: PostBody 모듈 최상위 추출) — [RoomTab.jsx:318](../app/components/tabs/RoomTab.jsx#L318)
  `PostBody`가 RoomTab 렌더 함수 내부에 정의돼 매 렌더 새 컴포넌트 → 수정 textarea 커서 이탈, 상태변경마다 이미지/영상 리셋.
  → 수정: PostBody(및 PostCard)를 모듈 최상위로 추출하고 편집 state를 props로 전달. (분리 제안과 동일 작업)

- [x] **P1-4 `[확인]` 당직표 실시간 미리보기와 실제 배정의 당직/숙직 순서 뒤바뀜** — (수정 2026-07-24: simulate를 숙직→당직 순으로 통일) — [DutyGenerateWidget.jsx:75 vs 165](../app/components/DutyGenerateWidget.jsx#L75)
  `generate()`는 `["숙직","당직"]`, `simulate()`는 `["당직","숙직"]` 순으로 커서 소비 → 미리보기가 실제와 반대. 관리자가 잘못된 근무표 확정.
  → 수정: 두 함수 kind 순서 통일. 근본: 배정계산 순수함수 하나로 공유.

- [x] **P1-5 `[확인]` 견적 담당자 반복 수정 시 할일 id 충돌로 기존 할일 덮어씀** — (수정 2026-07-24: handleQuoteEdit UUID) — [MaterialsAdmin.jsx:247](../app/components/admin/MaterialsAdmin.jsx#L247) (관리자 콘솔)
  `todo-quote-${quote.id}-${existingTodos.length+i}` 위치인덱스 id → 담당자 add/remove 반복 시 살아있는 할일 suffix와 충돌 → upsert가 조용히 덮어씀(담당자·done·청구연결 유실).
  → 수정: UUID/타임스탬프 id. 초기 생성(163)도 통일.

- [x] **P1-6 `[확인]` 관리자 콘솔이 옛 컬럼 `sites.manager` 신규 참조(v2 규칙 위반)** — (수정 2026-07-24: site_managers 대표 담당자 우선) — [BillingsAdmin.jsx:14,217](../app/components/admin/BillingsAdmin.jsx#L14)
  콘솔은 `sites.manager`를 갱신하지 않고 담당자는 `site_managers`(isPrimary)로만 편집 → 청구 "담당자" 항상 stale.
  → 수정: `site_managers`의 대표 담당자로 교체.

- [x] **P1-7 `[확인]` 핵심 write 전반이 error 미검사 + 낙관적 setState (근본 패턴)** — (2026-07-24: `writeOk` 래퍼 도입[lib/supabaseClient.js] + handleArriveFailure·handleFailureResult·handleSupplyComplete 적용. handleSupplyComplete는 할일→상태 순서도 반전. **나머지 핸들러는 점진 적용 대상**) — ElevatorFieldApp 다수: handleFailureResult:720, handleSubmitBilling:791, handleSupplyComplete:905/929(비원자적), handleArriveFailure:701, handleAttendance:361, handleToggleLike:849, handleSetDutyPerson:374 등
  RLS 꺼진 실DB라 컬럼오타·FK위반이 조용히 실패하고 화면만 성공. handleSupplyComplete는 자재 update 성공·todo insert 실패 시 "지급완료인데 할일 없음".
  → 수정: 공용 write 래퍼(error면 toast+미반영/refetch)로 한 곳에서 처리하는 게 근본책. 최소한 핵심 3~4개부터.

- [ ] **P1-8 `[확인]` 인증 없는 민감 API 엔드포인트 2건** — [self-check-submit/route.js:10](../app/api/self-check-submit/route.js#L10), [push/send/route.js:12](../app/api/push/send/route.js#L12)
  self-check-submit: URL만 알면 회사 인증키로 승강기민원24에 공식 자체점검 제출/스푸핑. push/send: 누구나 전 직원에게 임의 푸시(피싱·스팸).
  → 수정: 세션/시크릿 검증. (로그인 작업과 함께 처리하면 자연스러움.)

---

## P2 — 엣지케이스 / 정합성 / 역할 누수 / 동시성

- [x] **P2-1 `[확인]` 처리현황에서 기사에게 전사 고장 노출** — (수정·검증 2026-07-24: 관리자 18 vs 기사 본인만) — [FailureTab.jsx:1264](../app/components/tabs/FailureTab.jsx#L1264) — 역할 필터 없이 `failures` 전체 표시(설계상 기사=본인 배정만). → engineer면 `mine` 스코프.
- [ ] **P2-2 `[확인]` 부담당 기사가 자기 현장을 못 봄 (site_assignments N:M 미로딩)** — 앱 전역이 단일 `assignedEngineer` 이름 기준(HomeTab:537, InspectionTab:60, CheckupTab:94, SiteTab:516). 부담당은 집중관리·검사도래·자체점검에 자기 현장 누락. → site_assignments 로드해 멤버십 스코프(또는 007 전까지 lead 기준 명시).
- [x] **P2-3 `[확인]` (내 코드) AdminTab SwipeCarousel 아이템 축소 시 idx/scroll 보정 누락** — (수정 2026-07-24) — [AdminTab.jsx:51](../app/components/tabs/AdminTab.jsx#L51) — 처리로 카드 줄면 화살표 disabled 판정·n/N 카운터가 실제 스크롤과 어긋남. → `useEffect([items.length])`로 idx 클램프.
- [ ] **P2-4 `[확인]` 콘솔 전역 is_active 필터 누락** — 제외 기사가 배정 드롭다운·대시보드 카운트에 계속 노출(SitesAdmin:307, FailuresAdmin:200/338, Dashboard:89/214, MaterialsAdmin:453/563, TodosAdmin:34/169, BillingsAdmin:22). → 배정용 목록 전부 `&& p.is_active !== false`.
- [x] **P2-5 `[확인]` 상비부품 재수령 가드 없음 + 재고 read-modify-write** — (수정 2026-07-24: receivedAt 가드. 무롤백 error검사는 P1-7 래퍼에서) — [ElevatorFieldApp.jsx:1023](../app/components/ElevatorFieldApp.jsx#L1023) — 더블탭 시 재고 2회 증가, 실패 무롤백. → `if(restock.receivedAt) return` 가드 + error 검사·원복.
- [x] **P2-6 `[확인]` 반려→재처리 시 지급사진 ref 미초기화 → 과거 사진 재노출** — (수정 2026-07-24) — [ElevatorFieldApp.jsx:1343](../app/components/ElevatorFieldApp.jsx#L1343)(handleReprocess)/875 — supplyPhotoUrlsRef·supply_photo_urls 함께 초기화.
- [x] **P2-7 `[확인]` 지원요청/운행정지로 미배정 복귀 시 알림 없음** — (수정 2026-07-24: failure_unassigned 푸시) — [ElevatorFieldApp.jsx:706](../app/components/ElevatorFieldApp.jsx#L706) — 접수 때와 달리 failure_unassigned 푸시 미발송 → 지원 필요 건을 아무도 모름.
- [x] **P2-8 `[확인]` 비용청구 selectedId stale 초기화** — (수정 2026-07-24: openTodos 동기화 effect) — [BillingTab.jsx:26](../app/components/tabs/BillingTab.jsx#L26) — `useState(openTodos[0]?.id)` 최초 1회만 → todos 늦게 오면 제출 불가. → `useEffect([openTodos])` 재설정.
- [ ] **P2-9 `[확인]` 검사관리 도래현장 카드마다 실시간 API 호출(한도 위험)** — [InspectionTab.jsx:16](../app/components/tabs/InspectionTab.jsx#L16) DueSoonCard — "전 호기 실시간 호출 금지" 정책과 충돌. → units DB 캐시/결과 캐싱.
- [ ] **P2-10 → 친구 담당 (관리자 페이지에서 처리 예정, 2026-07-24). 우리는 손대지 말 것.**
  배경: 관리자 수동완료는 버그가 아니라 **자재 반납**(교체 불필요해서 자재를 돌려받은 경우) 처리용으로 일부러 만든 것.
  다만 정상 청구완료와 구분이 안 돼 기록이 안 남는 문제가 있어 친구가 관리자 페이지 쪽에서 정리한다.
  **우리 쪽 연계 확인만 필요**: 친구 변경이 들어오면 모바일의 `isBilled`(MaterialTab)가 `todo.done=true`를 곧 "청구완료"로 보고
  기사의 "자재가 잘못 나왔어요·반려" 버튼을 막는 부분이 반납 건에도 걸리는지 점검할 것.
  <details><summary>원래 감사 내용</summary>

  **P2-10 `[확인]` 관리자 수동완료가 청구 없이 루프 완료 위장** — handleAdminToggleTodo(1275) + isBilled(MaterialTab:687) — 관리자가 자재/견적 할일 임의 done → 반려차단 + 원가 미기록 + 로스리포트 false-closed. → 청구 존재와 done 분리 판정.
  </details>
- [ ] **P2-11 `[확인]` 낙관적 배정에 assignee_id 누락 + guard 실패 시 refetch 없음** — handleAssignFailure:581/handleReassign/handleRefuse — 로컬 assigneeId stale(현재 이름 fallback으로 가려짐, Phase2에서 깨짐), 동시배정 guard 0행 때 stale "미배정" 유지. → setState에 assigneeId 포함 + guard 실패 refetch.
- [ ] **P2-12 `[추정]` elevator_no 빈/비정형 라벨이 집계 병합** — [utils.js:315,354](../lib/utils.js#L315) recentFailuresBySite/unitHistory — `""`이면 키 `siteId|`로 뭉쳐 다른 호기가 한 덩어리(집중관리 오탐). findUnitForInspection(216)은 라벨 불일치 시 1호기 오배정. → 데이터 정리 + 빈 키 집계 제외.
- [ ] **P2-13 `[확인]` 인증 없는 크론/프록시** — geocode-sites, sync-holidays에 CRON_SECRET 없음(sync-inspection-cache만 검사). geocode는 TMAP 한도 소진+sites 대량 write 가능. → CRON_SECRET 가드.
- [ ] **P2-14 `[확인]` 콘솔이 site_assignments 미로딩 → 담당기사 표기·집계가 옛 이름 컬럼 의존** — AdminApp:57, EngineersAdmin unitCountOf:362 — 동명이인·듀얼라이트 누락 시 대수 오류. → site_assignments 로드 후 FK 집계.
- [ ] **P2-15 `[확인]` 콘솔 다수 mutation 낙관적 업데이트 error 미검사** — SitesAdmin saveSiteInfo/changeLead/bulkAssign/setPrimary/toggleSiteActive 등, Dashboard assign, FailuresAdmin assign, RoomAdmin sendPost/toggleLike/setNotice/deletePost. → `if(error){alert;return;}` 통일.

---

## P3 — 코드 건강 / 경미 / 접근성 (요약)

- [x] mapFailure `createdAt` 키 중복 정의 — (수정 2026-07-24)
- [ ] AdminTab 미사용 import Badge/PrimaryButton/Field/formatPhone (내 코드) — 삭제
- [ ] BillingTab:490 "이번 달" 라벨 오류(실제 전체 합계), :125 죽은 분기 `[null]`
- [ ] RoomTab 영상 썸네일 탭 시 뷰어가 `<img>`로만 렌더 → isVideo 분기
- [ ] 접근성: clickable `<div>`(SiteTab:595, InspectionTab:20/159), aria 없는 토글 다수, 44px 미달 터치타깃(MaterialTab 삭제버튼)
- [ ] fixed 오버레이 portal 없음(TodoTab:514, RoomTab 뷰어, Duty 피커) — transform 조상 시 오작동 → createPortal
- [ ] 재배정 요청 무알림(handleRequestReassignTodo:1291) — admin push + 알림벨 카운트 미포함
- [ ] 자체점검 출석부 lazy 생성(등록/완료 시에만) — 완전 미점검 달이 누락으로 안 잡힘(DESIGN 7-3 "매월 1일 자동생성"과 불일치)
- [ ] 관리자 지급완료가 지급사진 미필수(AdminTab:166/216) — DESIGN은 선행조건 명시 → 의도 확인
- [ ] 중복 유틸: formatDateTime(CheckupTab:43·RoomTab:15), createFailure(Dashboard·FailuresAdmin) → lib로 승격
- [ ] id 생성 Date.now(billings/feed/failure) → crypto.randomUUID
- [ ] profileIdByName 이름 완전일치 취약(동명이인·개명)
- [ ] 30초 폴링이 feed/duty 통째 교체 → 낙관적 업데이트 겹칠 때 깜빡임
- [ ] ArrivalResultModal 홈/알림 경로에서 errorCodes 미전달(자동완성 비활성)
- [ ] FailureTab 죽은 prop onRefuse(1020), fmtDist 중복(819/962), 미사용 import
- [ ] HomeTab flagged 정렬 dueDate null 시 Invalid Date 비교
- [ ] TodoTab descDraft 편집 진입 시 미동기화
- [ ] index를 key로 쓰는 사진 리스트 다수(formWidgets:78, MaterialsAdmin, TodosAdmin, RoomAdmin)

---

## 분리(리팩터) 제안 — **보류** (2026-07-24 결정)

> 이 항목은 감사 프롬프트에 "너무 길면 분리 필요"를 넣어서 나온 것이지, 독립적으로 발견된 문제가 아니다.
> 재검토 결과 **지금 분리하지 않는다**:
> - 엉킨 게 아니라 길 뿐이다. ElevatorFieldApp은 상태 → `★` 주석 붙은 자립형 핸들러 40여 개 → 탭 라우팅 순으로 도메인별 정렬돼 있어 검색으로 바로 찾힌다.
> - 이번 감사 P0·P1 중 "파일이 길어서" 생긴 건 하나도 없다(전부 로직 버그).
> - App 셸이 상태·핸들러를 소유하는 건 의도된 설계(components/CLAUDE.md). 훅으로 빼면 setState·ref 배관만 늘고 기능 이득 0.
> - 둘이 동시 작업하는 저장소라 분리는 대형 머지 충돌 제조기다. CLAUDE.md 규칙 5도 구조 변경은 팀 상의 선행.
>
> **재개 신호**: 머지 충돌이 잦아지거나 "어디 있는지 못 찾겠다"가 반복될 때. 그때 아래 안을 참고.
> 그때도 우선순위는 자립적인 표시 전용 덩어리부터(알림벨 JSX, AttendanceBar) — 핸들러 훅 분리는 마지막.



| 파일 | 줄 | 분리안 |
|---|---|---|
| ElevatorFieldApp.jsx | 1780 | `NotificationBell.jsx`(알림벨 JSX+파생), `hooks/useAttendanceLocation`, `hooks/useDutyHandlers`, `hooks/useMaterialHandlers` → 셸 800줄 목표 |
| FailureTab.jsx | 1430 | `failure/FailureCards.jsx`, `failure/FailureModals.jsx`, `failure/FailureRegisterForm.jsx`, `failure/ErrorCodeBook.jsx` |
| MaterialTab.jsx | 1201 | `material/RequestHistoryScreens.jsx`(+RequestDetailSheet), PartsRowsInput/UnitPickGrid는 formWidgets로 이동 |
| AdminTab.jsx | 986 | SwipeCarousel 공용화, 자재/견적/상비/재배정 4세트 파일 분리, EditForm·HistoryScreen 쌍 중복 통합 |
| SitesAdmin.jsx | 903 | `SiteUnitDetailModal`, `SiteUnitsSection`, `SiteContactsSection` |
| HomeTab.jsx | 870 | `home/AttendanceBar`, `home/WorkCalendarMiniStrip`, `home/LiveInspectionPanel` |
| MaterialsAdmin.jsx | 722 | `MaterialsModals.jsx`(3 모달) |
| RoomTab.jsx | 578 | PostBody/PostCard 최상위 추출(P1-3 해결), PostDetail 통합 |
| EngineersAdmin.jsx | 575 | `EngineerFileModals.jsx`, useRowDragReorder 훅 |
| DutyGenerateWidget | 411 | computeRoster 순수함수 공유(P1-4 해결) |
| BillingTab | 533 | PhotoEvidenceStep 위젯 |
| CheckupTab | 739 | 공단 contents 빌더 순수함수 |

---

## 권장 수정 순서

1. **P0 2건** — 재배정 크래시, 고장접수 무방비. (즉시, 각 한두 줄~작은 스레딩)
2. **비용청구 P1 2건(P1-1·P1-2)** — 매출 직결 유실. id 충돌 + 순서/에러체크.
3. **write 에러체크 근본책(P1-7)** — 공용 write 래퍼 도입 후 핵심 핸들러부터 적용(P0-2·P2-5·P2-15 상당수 흡수).
4. **RoomTab/Duty P1(P1-3·P1-4)** — 분리 작업과 겸해서.
5. **역할 누수 P2-1·P2-2 + 인증 API P1-8** — 로그인·마이페이지 작업과 함께(권한 체계 정비 시점).
6. 분리 리팩터 — 위 버그 수정과 자연스럽게 겹치는 파일부터(RoomTab, Duty, AdminTab).
7. P3 정리 — 틈틈이.

> 참고: P1-8(인증)·P2-1/2(역할 스코프)는 다음주 **로그인·마이페이지** 작업과 직결이라 그때 함께 처리하는 게 효율적.
