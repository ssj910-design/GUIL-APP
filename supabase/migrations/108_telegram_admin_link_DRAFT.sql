-- 108: 관리자 프로필 ↔ 텔레그램 계정 연결 (2026-08-04, 실행 시점 재정렬)
-- 자체점검 CNFIRM처럼 자유 입력 컬럼 하나 — 화이트리스트 겸 텔레그램 견적봇 발신자 인가에 쓴다.
alter table public.profiles add column if not exists telegram_user_id bigint unique;

-- 검증
select column_name from information_schema.columns
where table_schema = 'public' and table_name = 'profiles'
  and column_name = 'telegram_user_id';
