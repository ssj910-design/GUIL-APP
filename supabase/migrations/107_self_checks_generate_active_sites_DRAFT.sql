-- 107. [초안] generate_self_checks — 계약중지 현장 호기는 애초에 생성 대상에서 제외
-- 배경: 매월 1일 pg_cron(090)이 generate_self_checks(ym)를 돌려 그 달 출석부를 만드는데,
-- 이 함수는 units.is_active만 보고 sites.is_active(계약중지 여부)는 보지 않는다.
-- 그래서 계약이 끝난 현장의 호기도 매달 계속 출석부 줄이 생기고, 관리자 대시보드
-- KPI("자체점검 (YYYY-MM) N/M")의 분모(M)가 실제 관리 대수보다 부풀어 보였다.
-- (화면 쪽 SelfChecksAdmin.jsx/Dashboard.jsx는 sites.is_active로 걸러 표시하도록
-- 이미 고쳤지만, 생성 자체를 막아야 매달 같은 문제가 반복되지 않는다.)
-- ⚠️ 팀 상의 후 Supabase SQL Editor에서 직접 실행할 것 — Claude가 자동 실행하지 않는다.

create or replace function public.generate_self_checks(p_ym text)
returns int as $$
declare n int;
begin
  insert into public.self_checks (unit_id, ym, assignee_id)
  select u.id, p_ym,
         (select a.tech_id from public.site_assignments a
           where a.site_id = u.site_id order by a.is_lead desc limit 1)
  from public.units u
  join public.sites s on s.id = u.site_id
  where u.is_active and s.is_active is distinct from false
  on conflict (unit_id, ym) do nothing;
  get diagnostics n = row_count;
  return n;
end;
$$ language plpgsql security definer;

-- 검증: 이번 달 기준으로, 계약중지 현장 호기가 계속 새로 생기지 않는지 확인
-- select count(*) from public.self_checks c
--   join public.units u on u.id = c.unit_id
--   join public.sites s on s.id = u.site_id
--   where c.ym = to_char(now(), 'YYYY-MM') and s.is_active = false;
-- (0건이어야 정상 — 이미 생성된 지난 과거 줄은 이 함수 재실행으로는 지워지지 않으니 청소가
--  필요하면 별도로 상의)
