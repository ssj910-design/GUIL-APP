-- 113: units.requires_self_check — 법정 승강기가 아닌 부대설비(호이스트/주차기/턴테이블 등)를
-- 자체점검 자동생성 대상에서 뺀다 (2026-08-13)
-- 승강기 계약할 때 같이 계약되는 경우가 있는데, 승강기안전관리법상 자체점검 대상이 아니다.
-- 종류(호이스트/주차기/턴테이블)는 이미 자유텍스트인 units.kind에 그대로 입력하면 되고,
-- 이 플래그는 "자체점검 자동생성 대상이냐" 하나만 담당한다 — 그래서 boolean, 별도 enum 아님
-- (unit_type을 얼마 전에 지운 이유가 바로 표시용 enum 중복이었다 — 같은 실수 반복 안 함).

alter table public.units add column if not exists requires_self_check boolean not null default true;

-- generate_self_checks — 107(계약중지 현장 제외)에 이어 이 플래그도 같이 본다.
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
  on conflict (unit_id, ym) do nothing;
  get diagnostics n = row_count;
  return n;
end;
$$ language plpgsql security definer;

-- 검증
select column_name, data_type, column_default from information_schema.columns
where table_schema = 'public' and table_name = 'units' and column_name = 'requires_self_check';
