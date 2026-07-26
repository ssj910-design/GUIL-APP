-- ============================================================
-- 063. [초안] failures.escalated_arrival_time
-- 지원요청·운행정지 처리결과가 들어오면 arrival_time을 비워 다음 기사가 배정→출동→도착을
-- 처음부터 다시 밟게 하는데, 그러면 "실제로 언제 도착했었는지"가 데이터에서 사라진다.
-- 비우기 직전 값을 스냅샷으로 남겨 고장신고 상세 화면에서 보여주기 위한 컬럼
-- (062의 escalated_by/escalated_by_id/escalated_at과 같은 패턴).
-- ⚠️ 팀 상의 후 Supabase SQL Editor에서 직접 실행할 것 — Claude가 자동 실행하지 않는다.
-- ============================================================
alter table public.failures add column if not exists escalated_arrival_time text;

-- 검증
select escalated_arrival_time from public.failures where escalation is not null limit 5;
