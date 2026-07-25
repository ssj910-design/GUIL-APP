-- ============================================================
-- 061. [초안] failure_supporters — 고장건 지원기사 기록
-- 지원요청(escalation='지원요청')이 걸린 고장건은 배정기사가 없어도(또는 배정기사와
-- 별개로) 지원 간 기사가 처리결과를 입력할 수 있어야 한다. 배정자(assignee) 1명뿐인
-- failures 테이블 구조를 바꾸지 않고, "이 건에 지원하러 간 사람" 목록을 별도로 둔다.
-- ⚠️ 팀 상의 후 Supabase SQL Editor에서 직접 실행할 것 — Claude가 자동 실행하지 않는다.
-- ============================================================
create table if not exists public.failure_supporters (
  id          uuid primary key default gen_random_uuid(),
  failure_id  text not null references public.failures(id) on delete cascade,
  engineer_id uuid not null references public.profiles(id),
  joined_at   timestamptz not null default now(),
  unique (failure_id, engineer_id)  -- 같은 기사가 같은 건에 중복 등록되지 않게
);

-- 검증
select conname from pg_constraint where conrelid = 'public.failure_supporters'::regclass;
