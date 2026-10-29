-- 155: 검사유효기간 경과 관리 — "검사 신청함" 체크 (2026-10-29)
-- 유효기간이 한 달 넘게 지난 호기는 관리자가 건물관계자에게 전화해 검사 신청을 유도한다.
-- 신청했다고 체크하면 그 호기는 알림 대상에서 빠진다(목록에는 "신청함"으로 남는다).
-- 체크 후 30일이 지나도 검사유효기간이 그대로면 다시 알림 대상이 된다(크론에서 판단).
-- 실제로 검사를 받아 유효기간이 갱신되면 sync-inspection-cache가 이 값을 자동으로 지운다.

alter table public.units add column if not exists inspection_applied_at date;      -- 검사 신청 확인한 날
alter table public.units add column if not exists inspection_applied_by text;      -- 체크한 관리자 이름
alter table public.units add column if not exists inspection_applied_note text;    -- 통화 메모 한 줄

-- 검증
select count(*) filter (where inspection_applied_at is not null) as 신청체크됨 from public.units;
