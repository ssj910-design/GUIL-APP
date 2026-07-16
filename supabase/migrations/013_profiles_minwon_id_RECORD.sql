-- ============================================================
-- 013. [기록] profiles.minwon_id — 승강기민원24 점검자 ID
-- 자체점검 자동 보고(RegistInspectionService)의 SELCHK_USID 필수값.
-- 공단에 등록된 점검자 ID를 기사 프로필에 매핑해둔다 (인사관리에서 입력).
-- ============================================================
alter table public.profiles add column if not exists minwon_id text;
