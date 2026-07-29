-- 074: 출동 알림 크론용 시각 컬럼 (2026-07-29)
-- 예약형 고장 알림(미배정 15분·출동 미응답 5분)을 pg_cron이 매분 판정하려면
-- "언제 배정했나"와 "마지막으로 알렸나"를 기록해야 한다.
-- 앱은 assigned_at 컬럼이 있을 때만 값을 채운다(assignedAtReady) — 이 마이그 전에 배포돼도 배정이 안 깨진다.
alter table public.failures add column if not exists assigned_at timestamptz;          -- 관리자가 기사에게 배정한 시각 (미응답 5분 판정 기준)
alter table public.failures add column if not exists stale_notified_at timestamptz;    -- 미배정 15분 알림을 보낸 시각 (한 번만 보내려 dedup)
alter table public.failures add column if not exists no_response_nag_at timestamptz;   -- 출동 미응답 알림을 마지막으로 보낸 시각 (5분 간격 유지)

-- 참고: 이미 진행 중이던(assignee 있고 미처리) 기존 건은 assigned_at이 비어 있어 미응답 알림 대상이 아니다(정상).
