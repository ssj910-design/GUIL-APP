-- 116: inventory_stock_movements — 제품별 입고/출고/조정 내역 (2026-08-14)
-- 현재 재고 수량은 이 테이블의 qty_delta 합계로 계산한다(컬럼으로 따로 저장
-- 안 함 — 단일 창고·소규모 데이터라 중복 저장할 이유가 없음, lib/inventoryStock.js).
-- type='adjust'는 qty_delta에 부호 있는 값을 그대로 받는다(예: -4).
-- type='in'/'out'은 항상 양수/음수로 정규화해서 저장(앱 코드가 보장).

create table if not exists public.inventory_stock_movements (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.inventory_products(id) on delete cascade,
  type text not null check (type in ('in','out','adjust')),
  qty_delta integer not null,
  note text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create index if not exists inventory_stock_movements_product_id_idx
  on public.inventory_stock_movements (product_id);

-- RLS: 위 inventory_products와 동일한 패턴.
alter table public.inventory_stock_movements enable row level security;
drop policy if exists "authenticated_full_access" on public.inventory_stock_movements;
create policy "authenticated_full_access" on public.inventory_stock_movements
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- 검증
select column_name, data_type from information_schema.columns
where table_schema = 'public' and table_name = 'inventory_stock_movements'
order by ordinal_position;
