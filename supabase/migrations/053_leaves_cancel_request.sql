-- 승인된 연차 취소 요청: 기사가 사유를 적어 취소를 요청하면 관리자가 승인(취소 확정)/반려한다.
-- 모두 nullable/기본값이라 기존 데이터 영향 없음.
alter table public.leaves add column if not exists cancel_requested boolean not null default false;
alter table public.leaves add column if not exists cancel_reason text;   -- 취소 요청 사유
