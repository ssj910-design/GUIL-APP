-- 견적서 부가세포함 발행 — 관공서는 부가세별도가 아니라 부가세포함 금액으로 견적을
-- 받아야 해서, 견적작성 화면에서 체크하면 PDF·알림톡 총액이 VAT포함으로 바뀌게 한다.
alter table public.quote_requests add column if not exists vat_included boolean;
