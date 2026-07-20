-- 028: 당직·숙직 대상 on/off (2026-07-20)
-- 순번(duty_order)은 그대로 둔 채 잠시 근무에서 빼야 하는 경우(휴직·부서이동 등)를 위한 스위치.
-- 근무표 자동배정 대상 = duty_enabled = true AND duty_order IS NOT NULL
alter table public.profiles add column if not exists duty_enabled boolean not null default true;

select count(*) filter (where duty_enabled) as 당직대상 from public.profiles where role = 'engineer';
