-- 069: 견적서 발송(이메일/카카오알림톡) 수신처·발송시각 (2026-07-27)
-- 발행(발행일시는 기존 quote_issued_date)과 발송은 별개 동작이라 컬럼도 분리한다.
-- recipient_phone은 발송 대상(현장 담당자)용으로, 기존 contact_phone(기사가 접수 시 입력한
-- 신고자 연락처)과는 다른 값 — 혼용 금지.
alter table public.quote_requests add column if not exists recipient_email text;
alter table public.quote_requests add column if not exists recipient_phone text;
alter table public.quote_requests add column if not exists email_sent_at timestamptz;
alter table public.quote_requests add column if not exists kakao_sent_at timestamptz;

-- 검증
select column_name from information_schema.columns
where table_schema = 'public' and table_name = 'quote_requests'
  and column_name in ('recipient_email', 'recipient_phone', 'email_sent_at', 'kakao_sent_at')
order by column_name;
