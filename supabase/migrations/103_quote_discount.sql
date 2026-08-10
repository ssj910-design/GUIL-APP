-- 견적서 할인금액 — 지금까지는 화면 계산기로만 쓰이고 저장·PDF에 반영 안 됐다.
-- 실제로 저장·PDF·재발송 총액에 반영하려면 값을 남겨둘 컬럼이 필요하다.
alter table public.quote_requests add column if not exists discount_amount numeric;
