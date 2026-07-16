-- ============================================================
-- 004. self_checks(자체점검 — 월별 출석부) 신설
-- 법정 월 1회 의무. 일정을 사람이 등록하지 않고 시스템이 만든다.
-- 실행: Supabase SQL Editor (002 이후)
-- ============================================================

create table if not exists public.self_checks (
  id           uuid primary key default gen_random_uuid(),
  unit_id      uuid not null references public.units(id) on delete cascade,
  ym           text not null,            -- 점검 년월 '2026-07'
  assignee_id  uuid references public.profiles(id),
  planned_date date,
  done_date    date,
  status       text not null default '예정',   -- 예정 | 완료 | 누락
  photos       text[],
  notes        text,
  created_at   timestamptz not null default now(),
  unique (unit_id, ym)                   -- 호기당 월 1건
);

-- 매월 출석부 생성 함수: 활성 호기 전체에 해당 월 줄을 만든다 (중복 무시).
-- 담당자는 현장 주담당(site_assignments.is_lead)을 기본값으로.
create or replace function public.generate_self_checks(p_ym text)
returns int as $$
declare n int;
begin
  insert into public.self_checks (unit_id, ym, assignee_id)
  select u.id, p_ym,
         (select a.tech_id from public.site_assignments a
           where a.site_id = u.site_id order by a.is_lead desc limit 1)
  from public.units u
  where u.is_active
  on conflict (unit_id, ym) do nothing;
  get diagnostics n = row_count;
  return n;
end;
$$ language plpgsql security definer;

-- 사용법 (매월 1일 실행 — 방법은 MIGRATION.md 참고):
--   select public.generate_self_checks(to_char(now(), 'YYYY-MM'));
-- pg_cron 확장을 켜면 자동화 가능 (대시보드 → Database → Extensions → pg_cron):
--   select cron.schedule('self-checks-monthly', '0 0 1 * *',
--     $$select public.generate_self_checks(to_char(now(), 'YYYY-MM'))$$);

-- 검증: 이번 달 출석부 생성해보기 (활성 호기 수만큼 생성되어야 함)
-- select public.generate_self_checks(to_char(now(), 'YYYY-MM'));
-- select count(*) from public.self_checks;
