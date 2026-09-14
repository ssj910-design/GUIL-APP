-- 143: 자체점검 — 계약 시작 전 신규 현장은 계약일자가 속한 달부터 (2026-09-14)
-- 현장 등록 때 계약일자를 10.01로 적어도 등록 즉시 이번 달(9월) 출석부 줄이 생겨 자체점검
-- 대상으로 떴다. 재계약은 "새 계약일자"를 기존 계약종료일 다음날(미래)로 적으므로, 계약일자만
-- 보면 계속 운영 중인 현장이 빠진다 — 이전 달 자체점검 기록이 없는 현장(=처음 계약)만 뺀다.
-- 앱 쪽 lib/selfCheckStart.js와 같은 기준.

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
  where u.is_active and u.requires_self_check and s.is_active is distinct from false
    and not (
      s.contract_date is not null and to_char(s.contract_date, 'YYYY-MM') > p_ym
      and not exists (
        select 1 from public.self_checks sc join public.units u2 on u2.id = sc.unit_id
        where u2.site_id = s.id and sc.ym < p_ym
      )
    )
  on conflict (unit_id, ym) do nothing;
  get diagnostics n = row_count;
  return n;
end;
$$ language plpgsql security definer;

-- 이미 생긴 줄 정리 — 위 기준에 걸리는 현장의, 아무것도 안 한 '예정' 줄만 지운다
-- (완료·공단제출·점검항목 기록이 있는 줄은 건드리지 않는다). 지운 줄을 결과로 보여준다.
delete from public.self_checks sc
using public.units u, public.sites s
where sc.unit_id = u.id and u.site_id = s.id
  and sc.status = '예정' and sc.done_date is null and sc.gov_submitted_at is null
  and not exists (select 1 from public.self_check_items i where i.self_check_id = sc.id)
  and s.contract_date is not null and to_char(s.contract_date, 'YYYY-MM') > sc.ym
  and not exists (
    select 1 from public.self_checks sc2 join public.units u3 on u3.id = sc2.unit_id
    where u3.site_id = s.id and sc2.ym < sc.ym
  )
returning s.name, u.unit_no, sc.ym, s.contract_date;
