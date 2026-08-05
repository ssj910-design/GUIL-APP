-- 101: 호기(units)별 보수료 — 현장 단위 보수료를 호기별로 나눠 관리하도록 전환 (2026-08-05)
-- 앞으로는 호기별 보수료가 원본이고, sites.maintenance_cost는 그 합계로 자동 동기화된다
-- (앱 코드의 syncLegacy가 담당). 전환 직후 합계가 기존 현장 보수료와 같게 시작하도록,
-- 여기서 기존 현장 보수료를 활성 호기 수로 균등분배해 백필한다.

alter table public.units add column if not exists maintenance_cost numeric;

with active_counts as (
  select site_id, count(*) as cnt
  from public.units
  where is_active is distinct from false
  group by site_id
)
update public.units u
set maintenance_cost = round(s.maintenance_cost / ac.cnt)
from public.sites s
join active_counts ac on ac.site_id = s.id
where u.site_id = s.id
  and u.is_active is distinct from false
  and s.maintenance_cost is not null
  and u.maintenance_cost is null;

-- 검증
select column_name from information_schema.columns
where table_schema = 'public' and table_name = 'units'
  and column_name = 'maintenance_cost';
