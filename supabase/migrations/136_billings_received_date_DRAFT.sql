-- 부품교체·공사내역 청구일 옆에 입금일을 추가한다. 청구일(billing_date)과 별개로,
-- 실제 입금 확인된 날짜를 관리자가 직접 입력한다.
alter table public.billings add column if not exists received_date date;
