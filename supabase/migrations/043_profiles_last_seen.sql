-- 043: 마지막 접속 시각 (2026-07-21)
-- 로그인이 꺼져 있어(SKIP_LOGIN) '로그인'은 없지만, 기사가 앱(홈)을 연 시각을 기록해
-- 관리자가 출근부에서 '오늘 이 사람 앱을 봤나'를 확인할 수 있게 한다.
alter table public.profiles add column if not exists last_seen_at timestamptz;
