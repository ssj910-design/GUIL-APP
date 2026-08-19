-- 폐자재/여유부품 반납 흐름에 필요한 컬럼 3개.
-- 1) 재고 이동 기록을 반납 할일(todos)과 정식으로 연결 — note 자유텍스트 대신 FK로,
--    로스리포트 등 집계 쿼리를 안정적으로 조인할 수 있게 한다. 일반 수동 입출고는 계속 null.
alter table public.inventory_stock_movements
  add column if not exists todo_id text references public.todos(id);

create index if not exists inventory_stock_movements_todo_id_idx
  on public.inventory_stock_movements (todo_id);

-- 2) 반납 대상 부품 여러 줄을 한 할일에 담는다: [{ productId, name, qtyRequired, qtyConfirmed }]
alter table public.todos
  add column if not exists waste_return_rows jsonb;

-- 3) 기사가 사진 올려 done=true 되는 시점과 실제 재고 반영(관리자 확인) 시점을 분리하기 위함.
alter table public.todos
  add column if not exists stock_confirmed_at timestamptz;
