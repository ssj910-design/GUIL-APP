-- 026: 월별 당직·숙직 근무표 + 기사간 교환 (2026-07-20)
-- 하루에 당직 1명, 숙직 1명. (duty_date, kind) 유니크 = 근무 1칸.
-- 교환은 두 칸의 담당자(profile_id)를 맞바꾸는 것 — 같은 달이든 다음 달이든 동일 로직이라
-- '3일 A ↔ 27일 B' 맞교환도, '다음 달 칸과 교환'(이월)도 한 구조로 처리된다.
-- 기사별 고정 순번 (실제 근무표의 '이승준(1) 최병현(2) …' 괄호 숫자).
-- 자동 배정은 이 순번을 하루 2칸(숙직→당직)씩 끊어서 순환한다.
alter table public.profiles add column if not exists duty_order int;

create table if not exists public.duty_schedules (
  id uuid primary key default gen_random_uuid(),
  duty_date date not null,
  kind text not null check (kind in ('당직', '숙직')),
  profile_id uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  unique (duty_date, kind)
);

create index if not exists duty_schedules_date_idx on public.duty_schedules (duty_date);

-- 교환 요청 — 상대 기사가 수락하면 즉시 확정(관리자 승인 없음). 관리자는 근무표에서 되돌릴 수 있다.
create table if not exists public.duty_swaps (
  id uuid primary key default gen_random_uuid(),
  from_schedule_id uuid not null references public.duty_schedules(id) on delete cascade,
  to_schedule_id uuid not null references public.duty_schedules(id) on delete cascade,
  requester_id uuid not null references public.profiles(id),
  target_id uuid not null references public.profiles(id),
  status text not null default '대기' check (status in ('대기', '수락', '거절', '취소')),
  responded_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists duty_swaps_target_idx on public.duty_swaps (target_id, status);

-- 검증
select
  (select count(*) from public.duty_schedules) as schedules,
  (select count(*) from public.duty_swaps) as swaps;
