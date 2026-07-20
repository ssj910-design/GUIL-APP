-- 036: 연차 신청·승인 (2026-07-20)
-- 지금까지 연차는 관리자가 콘솔에서 직접 등록했다. 기사가 마이페이지에서 신청하고
-- 관리자가 승인하는 흐름을 넣는다. 잔여 일수는 '승인'된 것만 차감한다
-- (신청 중인 건을 미리 빼면 반려됐을 때 숫자가 틀어진다).
alter table public.leaves add column if not exists status text not null default '승인'
  check (status in ('신청', '승인', '반려', '취소'));
alter table public.leaves add column if not exists requested_by uuid references public.profiles(id);
alter table public.leaves add column if not exists decided_at timestamptz;
alter table public.leaves add column if not exists reject_reason text;

-- 기존 행은 관리자가 직접 넣은 것이므로 '승인' 상태 유지 (default로 이미 처리됨)
create index if not exists leaves_status_idx on public.leaves (status, start_date);

select status, count(*) from public.leaves group by status;
