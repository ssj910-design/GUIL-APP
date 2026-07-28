-- 072: 견적 발송 이력 로그 (2026-07-28)
-- 발송을 여러 번 할 수 있어(예: 이메일 재발송) 마지막 한 번만 남던 email_sent_at/
-- kakao_sent_at으로는 발송 이력을 다 못 담는다. 채널·시각·실제 발송 대상(수신 이메일/전화)을
-- 매 발송마다 하나씩 쌓는 배열 컬럼을 추가한다. 기존 email_sent_at/kakao_sent_at/
-- recipient_email/recipient_phone 컬럼은 그대로 유지(다른 곳에서 계속 사용).
alter table public.quote_requests add column if not exists send_log jsonb not null default '[]'::jsonb;

-- 검증
select column_name from information_schema.columns
where table_schema = 'public' and table_name = 'quote_requests'
  and column_name = 'send_log';
