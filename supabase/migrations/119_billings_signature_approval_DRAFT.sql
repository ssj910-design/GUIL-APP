-- 119: 비용청구 — 지류 교체확인서를 현장 서명/전화승인으로 대체 (2026-08-14)
-- 기사가 비용청구 시 고객에게 화면으로 완료보고서를 보여주고 그 자리에서 서명받거나
-- (signature_url), 고객이 부재중이면 전화로 승인받은 담당자 정보를 남긴다
-- (approval_method='전화승인', approver_name, approver_phone). approved_at은 서명
-- 완료/전화승인 확인 버튼을 누른 순간의 서버 시각 — 기사가 직접 시각을 입력하지 않는다.
--
-- 기존 confirm_photo_url(지류 확인서를 찍은 사진) 컬럼은 그대로 둔다 — 과거 기록 조회용,
-- 새 청구부터는 안 채워진다.

alter table public.billings add column if not exists signature_url text;
alter table public.billings add column if not exists approval_method text;
alter table public.billings add column if not exists approver_name text;
alter table public.billings add column if not exists approver_phone text;
alter table public.billings add column if not exists approved_at timestamptz;

-- 검증
select column_name, data_type from information_schema.columns
where table_schema = 'public' and table_name = 'billings'
  and column_name in ('signature_url', 'approval_method', 'approver_name', 'approver_phone', 'approved_at')
order by column_name;
