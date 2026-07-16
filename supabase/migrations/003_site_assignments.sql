-- ============================================================
-- 003. site_assignments(현장-기사 배정 N:M) 신설 + 백필
--      site_managers에 v2 컬럼 추가 (개명은 007에서 — 병행 기간에는
--      기존 배포 앱이 site_managers를 계속 읽으므로 이름을 바꾸지 않는다)
-- 실행: Supabase SQL Editor (001, 002 이후)
-- ============================================================

create table if not exists public.site_assignments (
  id         uuid primary key default gen_random_uuid(),
  site_id    text not null references public.sites(id) on delete cascade,
  tech_id    uuid not null references public.profiles(id) on delete cascade,
  is_lead    boolean not null default false,
  created_at timestamptz not null default now(),
  unique (site_id, tech_id)
);

-- 백필: sites.assigned_engineer(이름 1명) → 주담당 1줄
insert into public.site_assignments (site_id, tech_id, is_lead)
select s.id, p.id, true
from public.sites s
join public.profiles p on p.name = s.assigned_engineer
where nullif(s.assigned_engineer, '') is not null
  and not exists (select 1 from public.site_assignments a
                  where a.site_id = s.id and a.tech_id = p.id);

-- site_managers(→ 나중에 site_contacts로 개명) v2 컬럼
alter table public.site_managers add column if not exists role text;         -- 건물주·관리소장·경비실 등
alter table public.site_managers add column if not exists is_primary boolean not null default false;
alter table public.site_managers add column if not exists profile_id uuid references public.profiles(id);  -- Phase 3 고객 계정 연결

-- 검증: 배정 안 된 현장 확인 (assigned_engineer가 비어있는 현장만 나와야 함)
select s.name, s.assigned_engineer
from public.sites s
where not exists (select 1 from public.site_assignments a where a.site_id = s.id);
