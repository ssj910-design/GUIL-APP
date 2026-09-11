-- 출동/도착 후 처리결과 미입력 5시간 재촉 알림용 컬럼.
-- dispatched_at·arrival_time은 "HH:MM" 문자열이라 날짜 정보가 없어(자정 넘어가면 경과시간
-- 계산이 깨짐) 정확한 timestamptz가 필요하다 — 기존 assigned_at과 같은 패턴으로 출동
-- 시점에 채우고, 재배정·출동거부·지원요청 등으로 미배정 복귀 시 비운다.
-- result_nag_at은 배정 기사·관리자에게 동시 발송하는 재촉의 dedup 컬럼(1시간 간격).
alter table public.failures add column if not exists in_progress_at timestamptz;
alter table public.failures add column if not exists result_nag_at timestamptz;
