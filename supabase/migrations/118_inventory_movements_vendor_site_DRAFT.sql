-- 118: inventory_stock_movements에 구매처·현장 자유텍스트 추가 (2026-08-14)
-- 입고/출고 화면을 모달 대신 제품정보 칸에 인라인으로 띄우면서 "구매처"(거래처 대신)와
-- "입고현장/출고현장"을 건별로 남길 수 있게 한다. 현장은 우리 관리 현장(호기까지)
-- 자동완성 대상이면서도 그 외 임의 텍스트도 받아야 해서, sites/units를 참조하는 FK가
-- 아니라 그냥 text로 저장한다(자동완성은 화면에서만 site.name · unit.unitNo 형태로 보여줌).

alter table public.inventory_stock_movements add column if not exists vendor_text text;
alter table public.inventory_stock_movements add column if not exists site_text text;

-- 검증
select column_name, data_type from information_schema.columns
where table_schema = 'public' and table_name = 'inventory_stock_movements'
order by ordinal_position;
