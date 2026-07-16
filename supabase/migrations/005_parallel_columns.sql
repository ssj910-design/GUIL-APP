-- ============================================================
-- 005. 기록 테이블에 v2 FK 컬럼 추가 (병행 기간용)
-- 기존 컬럼(site_name, elevator_no, 이름 텍스트)은 그대로 두고
-- 새 컬럼만 추가한다 → 배포돼 있는 기존 앱이 계속 동작한다.
-- 기존 컬럼 제거는 007에서 (앱 전환·검증 후).
--
-- ※ 컬럼 이름 변경(arrival_time→arrived_at 등)은 하지 않는다 —
--    화면 코드의 매퍼(lib/mappers.js)가 이름 차이를 흡수한다. (v2.1 보완)
-- 실행: Supabase SQL Editor (001~004 이후)
-- ============================================================

-- 고장접수
alter table public.failures add column if not exists unit_id     uuid references public.units(id);
alter table public.failures add column if not exists assignee_id uuid references public.profiles(id);
alter table public.failures add column if not exists created_by  uuid references public.profiles(id);

-- 검사이력 (수기입력)
alter table public.inspections add column if not exists unit_id uuid references public.units(id);

-- 자재신청
alter table public.material_requests add column if not exists unit_id      uuid references public.units(id);
alter table public.material_requests add column if not exists requester_id uuid references public.profiles(id);

-- 견적요청
alter table public.quote_requests add column if not exists unit_id      uuid references public.units(id);
alter table public.quote_requests add column if not exists requester_id uuid references public.profiles(id);

-- 할일 (unit_id는 v2.1 보완: 관리자가 직접 부여한 manual 할일도 현장 연결 가능하게, null 허용)
alter table public.todos add column if not exists unit_id     uuid references public.units(id);
alter table public.todos add column if not exists assignee_id uuid references public.profiles(id);

-- 비용청구 (site_id조차 없던 테이블 — unit_id로 수리 + 자재 지급건 연결)
alter table public.billings add column if not exists unit_id             uuid references public.units(id);
alter table public.billings add column if not exists engineer_id         uuid references public.profiles(id);
alter table public.billings add column if not exists material_request_id text references public.material_requests(id);

-- 상비부품 보충 (현장 개념 없음 — 기사 연결만)
alter table public.restock_requests add column if not exists engineer_id uuid references public.profiles(id);

-- 우리방
alter table public.feed_posts add column if not exists author_id uuid references public.profiles(id);

-- 조회 성능용 인덱스 (기록 → 호기별 이력 조회가 v2의 핵심 동선)
create index if not exists failures_unit_idx          on public.failures (unit_id);
create index if not exists inspections_unit_idx       on public.inspections (unit_id);
create index if not exists material_requests_unit_idx on public.material_requests (unit_id);
create index if not exists quote_requests_unit_idx    on public.quote_requests (unit_id);
create index if not exists todos_unit_idx             on public.todos (unit_id);
create index if not exists billings_unit_idx          on public.billings (unit_id);

-- 검증: 컬럼이 모두 생겼는지
select table_name, column_name from information_schema.columns
where table_schema = 'public'
  and column_name in ('unit_id','assignee_id','requester_id','engineer_id','author_id','created_by','material_request_id')
order by table_name, column_name;
