-- 부품교체·공사 내역 관리자웹 전용 "무상 처리" 표시 — 무상 건은 합계 금액에서 제외한다.
alter table public.billings
  add column if not exists is_free boolean not null default false;
