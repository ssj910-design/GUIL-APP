-- ============================================================
-- 002. units(호기) 테이블 신설 + sites 데이터로 백필
-- 호기 = 승강기 1대. 이후 모든 기록은 unit_id에 매달린다.
-- 실행: Supabase SQL Editor (001 이후)
-- ============================================================

create table if not exists public.units (
  id          uuid primary key default gen_random_uuid(),
  site_id     text not null references public.sites(id) on delete cascade,
  seq         int  not null,             -- 현장 내 순번(1부터). "1-N"/"N호기" 라벨 변환·정렬 기준
  unit_no     text not null,             -- 호기명 '1호기' (라벨은 여기서만 관리)
  unit_type   text not null default '엘리베이터',  -- 엘리베이터·에스컬레이터·휠체어리프트·카리프트
  model       text,
  install_date date,
  gov_no      text,                      -- 국가승강기정보센터 승강기고유번호
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  unique (site_id, seq),
  unique (site_id, unit_no)
);

-- 승강기고유번호는 전국 유일 (빈 값 제외)
create unique index if not exists units_gov_no_key
  on public.units (gov_no) where gov_no is not null and gov_no <> '';

-- 백필: sites.unit_count 만큼 '1호기','2호기'... 생성
--  - gov_no        = gov_elevator_nos 배열의 n번째 (없으면 null)
--  - model         = sites.elevator_model (현장 공통값을 각 호기로 복사 — 이후 호기별 수정)
insert into public.units (site_id, seq, unit_no, model, gov_no)
select s.id,
       i,
       i || '호기',
       nullif(s.elevator_model, ''),
       nullif(s.gov_elevator_nos[i], '')
from public.sites s
cross join lateral generate_series(1, greatest(coalesce(s.unit_count, 1), 1)) as i
where not exists (select 1 from public.units u where u.site_id = s.id);

-- sites 보강 컬럼 (v2)
alter table public.sites add column if not exists manager_id uuid references public.profiles(id);
alter table public.sites add column if not exists is_active boolean not null default true;

-- 검증: 현장별 호기 수가 unit_count와 일치해야 함
select s.name, coalesce(s.unit_count,1) as expected, count(u.id) as created,
       array_agg(u.unit_no order by u.seq) as units,
       array_agg(coalesce(u.gov_no,'-') order by u.seq) as gov_nos
from public.sites s left join public.units u on u.site_id = s.id
group by s.id, s.name, s.unit_count
order by s.name;
