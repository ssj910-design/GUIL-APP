-- 025: 기사 출퇴근 체크 (2026-07-20)
-- 매일 09시 출근 체크 버튼, 17:30 퇴근/당직 선택. 하루 1행(profile_id + work_date 유니크).
-- status: null=출근만 함, '퇴근', '당직'
create table if not exists public.attendances (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id),
  work_date date not null,
  checked_in_at timestamptz,
  checked_out_at timestamptz,
  status text,
  created_at timestamptz not null default now(),
  unique (profile_id, work_date)
);

create index if not exists attendances_work_date_idx on public.attendances (work_date);

-- 검증
select count(*) as attendance_rows from public.attendances;
