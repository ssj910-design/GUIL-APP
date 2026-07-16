# 컴포넌트 구조 규칙

- **ElevatorFieldApp.jsx = App 셸**: 최상위 state + Supabase CRUD 핸들러(handleXxx) + 탭 라우팅.
  새 데이터 조작은 여기에 핸들러를 만들어 탭에 props로 내린다 (탭에서 직접 supabase 호출하지 않는 게 관례,
  단 읽기 전용 위젯은 예외 있음).
- **tabs/** = 하단 탭 1개당 1파일. 그 탭의 하위 화면·모달·카드도 같은 파일에 있다.
- **ui.jsx** = 순수 표시용 공용 부품 (Sheet, PrimaryButton, HistoryCard, FilterBar, TimelineRow/Input,
  Badge, DDay, ScreenHeader, DrillHeader, Field, SmsToast, 스타일 상수 inputCls/tlInputCls).
- **formWidgets.jsx** = 데이터 연동 폼 위젯 (SiteSearchSelect, MultiPhotoUpload, SinglePhotoUpload, SupplyPhotoButton).
- **교차 참조 3곳** (더 늘리지 말 것): HomeTab→FailureTab(고장 카드·모달 공유),
  AdminTab→TodoTab(TodoManageScreen), AdminTab→BillingTab(BillingHistoryScreen).

역할 분기: AuthContext의 role이 'admin'이면 전체 데이터, 'engineer'면 본인 배정 현장만.
이 필터링은 클라이언트에서만 이뤄진다 (RLS 없음 — 보안 아님, 화면 분리일 뿐).

스타일은 Tailwind 인라인. 새 UI는 ui.jsx의 기존 부품을 먼저 재사용할 것.
