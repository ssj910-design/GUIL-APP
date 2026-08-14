-- 117: inventory_products.photo_url(단일) → photo_urls(여러 장) (2026-08-14)
-- 제품 사진을 여러 장 등록할 수 있게 배열 컬럼으로 바꾼다. 순서상 첫 번째(index 0)가
-- 항상 "메인 사진" — 별도 플래그 없이 배열 순서로만 표현한다(단순함 우선).
-- 기존에 이미 올라간 photo_url 값은 잃지 않도록 photo_urls의 첫 번째 항목으로 옮긴 뒤
-- 옛 컬럼을 지운다.

alter table public.inventory_products add column if not exists photo_urls text[] not null default '{}';

update public.inventory_products
set photo_urls = array[photo_url]
where photo_url is not null and photo_urls = '{}';

alter table public.inventory_products drop column if exists photo_url;

-- 검증
select column_name, data_type from information_schema.columns
where table_schema = 'public' and table_name = 'inventory_products'
order by ordinal_position;
