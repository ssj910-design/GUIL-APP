-- 064: 견적요청 품목화 + 견적서 PDF (2026-07-24)
-- 관리자가 견적요청(부품명·수량만 있던 것)을 세부 품목(자재비/인건비 구분·규격·단가 등)으로
-- 확장해 실제 견적서 PDF를 생성하는 기능. 품목은 배열이라 jsonb로 저장하고,
-- 금액(수량*단가)은 저장하지 않는다 — 표시/PDF 생성 시마다 계산해서 저장값과
-- 어긋나는 일이 없게 한다.
alter table public.quote_requests add column if not exists quote_items jsonb;
alter table public.quote_requests add column if not exists transport_cost numeric;
alter table public.quote_requests add column if not exists safety_cost numeric;
alter table public.quote_requests add column if not exists profit numeric;
alter table public.quote_requests add column if not exists quote_number text;
alter table public.quote_requests add column if not exists recipient_name text;
alter table public.quote_requests add column if not exists quote_title text;
alter table public.quote_requests add column if not exists quote_pdf_url text;

-- 검증
select column_name from information_schema.columns
where table_schema = 'public' and table_name = 'quote_requests'
  and column_name in ('quote_items', 'transport_cost', 'safety_cost', 'profit',
                       'quote_number', 'recipient_name', 'quote_title', 'quote_pdf_url')
order by column_name;
