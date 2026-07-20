-- 023: 알림(종) 드롭다운의 "지우기" 상태 저장 (2026-07-20)
-- 고장/할일/자재지급 알림은 안읽음 개념이 없이 "지금 처리 필요한 건" 기준으로 매번 계산되므로,
-- 사용자가 개별로 지운(dismiss) 항목을 기억해뒀다가 다시 계산할 때 제외한다.
-- 앱은 컬럼이 없어도 안전하게 동작 — mapper가 undefined로 매핑하고
-- ElevatorFieldApp이 이를 감지해 지우기 클릭 시 안내만 하고 쓰기는 건너뛴다.
alter table public.profiles add column if not exists dismissed_notif_ids text[] not null default '{}';
