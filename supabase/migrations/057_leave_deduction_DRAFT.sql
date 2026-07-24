-- 057: 연차차감제 (2026-07-24)
-- 전월26일~당월25일 정산주기 동안 연차를 하나도 안 쓴 직원은 31일 급여에서
-- 연차 1일치를 보상비로 대신 지급하고 그만큼 연차를 차감한다. 이 제도를 쓰는
-- 직원과 안 쓰는 직원이 갈려서, 직원별로 켜고 끌 수 있는 플래그가 필요하다.
alter table public.profiles add column if not exists leave_deduction_enabled boolean not null default false;

-- 검증
select column_name from information_schema.columns
where table_schema = 'public' and table_name = 'profiles'
  and column_name = 'leave_deduction_enabled';
