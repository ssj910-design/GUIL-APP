-- 152: 관리자 직접 자재지급 (2026-10-20)
-- 기사의 자재신청 없이 관리자가 지급을 만든다(관리자웹 자재신청관리 "직접 지급").
-- 여러 호기를 신청 1건으로 묶기 위해 elevator_nos(견적 요청 131과 같은 방식), 직접 지급 건 구분용 created_by_admin.
alter table public.material_requests add column if not exists elevator_nos text[];
alter table public.material_requests add column if not exists created_by_admin boolean not null default false;

-- 확인:
-- select column_name from information_schema.columns
-- where table_schema = 'public' and table_name = 'material_requests' and column_name in ('elevator_nos','created_by_admin');
