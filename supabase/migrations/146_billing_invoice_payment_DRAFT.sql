-- 146: 무자료 청구서 발송 — 결제기한·자동독촉·발송이력 컬럼 추가.
-- 최초 발송은 수동(관리자가 결제기한 입력 후 발송), 자동화 체크 시 크론이 결제기한 경과 후
-- 7일 간격으로 최대 60일까지 알림톡·메일을 반복 재발송한다 (app/api/cron/check-billing-payment).

alter table public.billings add column if not exists payment_due_date date;
alter table public.billings add column if not exists reminder_enabled boolean not null default false;
alter table public.billings add column if not exists last_reminder_sent_at timestamptz;
alter table public.billings add column if not exists invoice_sent_at timestamptz;
alter table public.billings add column if not exists invoice_pdf_url text;
alter table public.billings add column if not exists recipient_email text;
alter table public.billings add column if not exists recipient_phone text;
alter table public.billings add column if not exists send_log jsonb not null default '[]'::jsonb;

-- 확인:
-- select column_name from information_schema.columns
-- where table_schema = 'public' and table_name = 'billings'
--   and column_name in ('payment_due_date','reminder_enabled','last_reminder_sent_at',
--     'invoice_sent_at','invoice_pdf_url','recipient_email','recipient_phone','send_log');
