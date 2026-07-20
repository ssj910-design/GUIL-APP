-- 031: 연차관리 + 근무 교환 알림 (2026-07-20)

-- 1) 교환 결과를 요청자에게 팝업으로 알리기 위한 확인 플래그.
--    교환 내용은 우리방(피드)에 올리지 않고 당사자 둘에게만 팝업으로 뜬다.
alter table public.duty_swaps add column if not exists requester_seen boolean not null default false;
alter table public.duty_swaps add column if not exists target_seen boolean not null default false;

-- 2) 연차관리 — 부여 일수는 사람마다 다르므로 프로필에, 사용 내역은 별도 테이블에 쌓는다.
alter table public.profiles add column if not exists annual_leave_days numeric;

create table if not exists public.leaves (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id),
  start_date date not null,
  end_date date not null,
  kind text not null default '연차' check (kind in ('연차', '반차', '병가', '공가', '기타')),
  days numeric not null default 1,
  note text,
  created_at timestamptz not null default now()
);

create index if not exists leaves_profile_idx on public.leaves (profile_id, start_date);

select
  (select count(*) from public.leaves) as leaves,
  (select count(*) from information_schema.columns
     where table_name = 'duty_swaps' and column_name in ('requester_seen', 'target_seen')) as swap_flags;
