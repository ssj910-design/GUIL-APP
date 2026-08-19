-- 비용청구(billings) insert 시, 그 청구가 견적건이고 부품마스터 연동 품목 중 폐자재
-- 회수/여유분 반납 대상이 있으면 반납 할일을 DB가 직접 만든다.
--
-- 기존엔 기사 모바일 앱(JS)이 이 판단을 했는데, 이 앱은 PWA라 기사가 하루 종일 탭을
-- 켜둔 채로 쓰는 경우가 많다 — 배포해도 이미 열려 있던 탭은 새로고침 전까진 계속 옛
-- 코드를 실행해, 배포 후에도 안 고쳐지는 것처럼 보이는 문제가 있었다(2026-08-19).
-- 판단 로직을 트리거로 옮기면 기사 폰이 어떤 버전을 실행 중이든 항상 최신 로직이 적용된다.

alter table public.billings
  add column if not exists quote_request_id text references public.quote_requests(id);

create or replace function public.create_waste_return_todo()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  quote_items jsonb;
  rows jsonb := '[]'::jsonb;
  item jsonb;
  qty_required numeric;
  title_parts text[] := array[]::text[];
begin
  if new.quote_request_id is null then
    return new;
  end if;

  select qr.quote_items into quote_items
  from public.quote_requests qr
  where qr.id = new.quote_request_id;

  for item in select * from jsonb_array_elements(coalesce(quote_items, '[]'::jsonb))
  loop
    if (item->>'partId') is not null and (
      coalesce((item->>'returnRequired')::boolean, false)
      or coalesce((item->>'qtyTaken')::numeric, (item->>'qty')::numeric) > (item->>'qty')::numeric
    ) then
      qty_required := (case when coalesce((item->>'returnRequired')::boolean, false) then 1 else 0 end)
        + greatest(0, coalesce((item->>'qtyTaken')::numeric, (item->>'qty')::numeric) - (item->>'qty')::numeric);
      rows := rows || jsonb_build_array(jsonb_build_object(
        'productId', item->>'partId',
        'name', item->>'name',
        'qtyRequired', qty_required,
        'qtyConfirmed', 0
      ));
      title_parts := title_parts || (coalesce(item->>'name', '') || ' ' || qty_required::text || 'EA');
    end if;
  end loop;

  if jsonb_array_length(rows) = 0 then
    return new;
  end if;

  insert into public.todos (
    id, source, title, site_name, elevator_no, part, assignee, assignee_id,
    assigned_date, due_date, done, quote_request_id, waste_return_rows
  ) values (
    'todo-wastereturn-' || new.id,
    'waste_return',
    '폐자재/여유부품 반납 — ' || array_to_string(title_parts, ', '),
    new.site_name,
    new.elevator_no,
    '폐자재/여유부품 반납',
    new.engineer,
    new.engineer_id,
    (now() at time zone 'Asia/Seoul')::date,
    (now() at time zone 'Asia/Seoul')::date + 14,
    false,
    new.quote_request_id,
    rows
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists trg_create_waste_return_todo on public.billings;
create trigger trg_create_waste_return_todo
  after insert on public.billings
  for each row
  execute function public.create_waste_return_todo();
