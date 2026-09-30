-- 148: 자체점검 회차(round) 지원 — 월 2회 이상 자체점검이 필요한 현장은 같은 호기·같은 달에
-- 회차별로 별도 기록을 남길 수 있게 한다. 기존엔 (unit_id, ym) 하나뿐이라, 이미 완료한
-- 현장을 다시 등록하면 이전 방문 기록(사진·비고·점검항목·공단제출결과)이 그대로 덮어써졌다.
-- 앱 쪽은 CheckupTab.jsx(기사)에서 이미 완료된 현장을 재등록할 때 새 round를 만들도록 처리.

alter table public.self_checks add column if not exists round int not null default 1;

-- 기존 고유 제약(unit_id, ym)을 찾아서 (unit_id, ym, round)로 교체.
-- 이름을 짐작해서 지우면 실제 이름이 다를 때 조용히 실패(if exists)하거나 엉뚱한 제약을 건드릴
-- 위험이 있어, pg_constraint에서 실제 정의를 보고 동적으로 찾아 지운다.
do $$
declare
  cname text;
begin
  select conname into cname
  from pg_constraint
  where conrelid = 'public.self_checks'::regclass
    and contype = 'u'
    and pg_get_constraintdef(oid) = 'UNIQUE (unit_id, ym)';
  if cname is not null then
    execute format('alter table public.self_checks drop constraint %I', cname);
  end if;
end $$;

alter table public.self_checks
  add constraint self_checks_unit_id_ym_round_key unique (unit_id, ym, round);

-- generate_self_checks — 매달 자동 생성은 항상 1차(round=1)만 만든다. 2차 이상은 앱에서
-- 이미 완료된 현장을 다시 등록할 때만 생성한다(자동 생성 대상이 아님).
create or replace function public.generate_self_checks(p_ym text)
returns int as $$
declare n int;
begin
  insert into public.self_checks (unit_id, ym, round, assignee_id)
  select u.id, p_ym, 1,
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
  on conflict (unit_id, ym, round) do nothing;
  get diagnostics n = row_count;
  return n;
end;
$$ language plpgsql security definer;

-- 검증:
-- select conname, pg_get_constraintdef(oid) from pg_constraint where conrelid = 'public.self_checks'::regclass and contype = 'u';
-- select public.generate_self_checks(to_char(now(), 'YYYY-MM'));  -- 기존과 동일하게 1차만 생성돼야 함
