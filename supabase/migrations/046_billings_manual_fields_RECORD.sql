-- 청구내역(부품교체·공사 내역) 관리자 수기입력 필드 — 청구일 / 청구방식
-- 관리자웹 BillingsAdmin.jsx 목록에서 바로 입력하는 필드로, 자동 계산값이 아니다.
-- 실행됨: 2026-07-22
alter table public.billings
  add column if not exists billing_date date,
  add column if not exists billing_method text;
