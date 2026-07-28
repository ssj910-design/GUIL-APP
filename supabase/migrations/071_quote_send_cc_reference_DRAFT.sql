-- 071: 견적 발송 참조인(CC) 컬럼 (2026-07-28)
-- 발송 시 발신측 CC 이메일, 수신측 참조인 이메일/전화번호를 함께 기록한다.
-- 기존 recipient_email/recipient_phone과 동일한 패턴 — 발송 시마다 입력값을 기록.
alter table public.quote_requests add column if not exists sender_cc_email text;
alter table public.quote_requests add column if not exists reference_email text;
alter table public.quote_requests add column if not exists reference_phone text;

-- 검증
select column_name from information_schema.columns
where table_schema = 'public' and table_name = 'quote_requests'
  and column_name in ('sender_cc_email', 'reference_email', 'reference_phone')
order by column_name;
