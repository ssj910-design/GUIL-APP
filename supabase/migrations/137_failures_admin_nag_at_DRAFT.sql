-- 출동 미응답 재촉 알림 — 담당 기사는 3분 간격 그대로, 관리자는 15분 간격으로 따로
-- 돌리기 위해 관리자용 마지막 발송 시각을 별도 컬럼으로 둔다(기존 no_response_nag_at은
-- 기사용 그대로 사용).
alter table public.failures add column if not exists admin_no_response_nag_at timestamptz;
