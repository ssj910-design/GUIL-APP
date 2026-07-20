-- 029: 근무 구분에 '정상근무' 추가 (2026-07-20)
-- 주4일 근무제 근무표에는 숙직·당직 외에 '정상근무' 행이 있고, 금요일에만 사람이 배치된다.
-- 순번 순환과 무관하게 관리자가 직접 지정하는 자리라 자동배정 대상이 아니다
-- (실제 표에서 순번이 없는 직원도 정상근무에 배치됨).
alter table public.duty_schedules drop constraint if exists duty_schedules_kind_check;
alter table public.duty_schedules add constraint duty_schedules_kind_check
  check (kind in ('당직', '숙직', '정상근무'));

select conname from pg_constraint where conrelid = 'public.duty_schedules'::regclass and contype = 'c';
