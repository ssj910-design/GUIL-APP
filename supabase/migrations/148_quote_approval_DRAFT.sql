-- 148: 견적 고객 직접 승인(서명+발주서) — 전화승인 없이 고객이 승인페이지에서 금액 확인
-- 후 서명하면 바로 승인 처리되고 발주서가 자동 발급된다.
-- approved_date(기존, 날짜만)와 별개로 approved_at(정확한 시각)을 추가한다 — 청구서 승인이
-- approved_at을 쓰는 것과 같은 이유(전화승인 등 다른 승인 경로와 섞여도 시각으로 구분 가능).

alter table public.quote_requests add column if not exists approved_amount numeric;
alter table public.quote_requests add column if not exists approved_at timestamptz;
alter table public.quote_requests add column if not exists approval_signature_url text;
alter table public.quote_requests add column if not exists purchase_order_pdf_url text;

-- 확인:
-- select column_name from information_schema.columns
-- where table_schema = 'public' and table_name = 'quote_requests'
--   and column_name in ('approved_amount','approved_at','approval_signature_url','purchase_order_pdf_url');
