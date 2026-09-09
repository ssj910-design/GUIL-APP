-- 부품교체·공사 내역 분할납부 — 여러 날짜에 나눠 입금되는 경우를 (날짜, 금액) 목록으로
-- 기록한다. 기존 received_date(단일 날짜, 마이그레이션 136)는 그대로 두고, 분할납부인
-- 건만 이 컬럼을 쓴다.
alter table public.billings add column if not exists received_payments jsonb;
