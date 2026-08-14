-- 115: inventory_products — 재고관리 제품 마스터 (2026-08-14)
-- 외부 재고관리프로그램을 앱에 통합하는 첫 단계. 자재번호(material_no)는
-- 첨부 화면의 SKU+바코드를 하나로 합친 것 — 관리자가 자동생성 버튼으로 만든다.
-- 단일 창고 운영이라 location은 보관위치(선반/칸) 자유텍스트일 뿐, 창고 구분이
-- 아니다 — 다중 창고가 필요해지면 별도 테이블로 확장.

create table if not exists public.inventory_products (
  id uuid primary key default gen_random_uuid(),
  material_no text not null unique,
  name text not null,
  photo_url text,
  spec text,
  memo text,
  location text,
  vendor text,
  price_date date,
  purchase_price numeric,
  sale_price numeric,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- RLS: 106_rls_remaining.sql·111·114와 동일한 패턴 — 로그인(authenticated)만 하면 전부 허용.
alter table public.inventory_products enable row level security;
drop policy if exists "authenticated_full_access" on public.inventory_products;
create policy "authenticated_full_access" on public.inventory_products
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- 검증
select column_name, data_type from information_schema.columns
where table_schema = 'public' and table_name = 'inventory_products'
order by ordinal_position;
