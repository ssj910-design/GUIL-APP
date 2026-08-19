-- 126의 create_waste_return_todo()를 방어적으로 다시 정의한다.
--
-- 실운영에서 첫 실행 시 원인 미상의 오류로 트리거가 실패했는데, AFTER 트리거의 예외는
-- 원본 billings insert 전체를 롤백시킨다 — 반납 할일 생성(부가 기능)의 결함이 비용청구
-- 저장(핵심 기능)을 막아버린 것. 본문 전체를 BEGIN/EXCEPTION으로 감싸, 이 함수 안에서
-- 어떤 오류가 나든 청구 저장은 항상 성공하고 반납 할일만 못 만든 채 넘어가게 한다
-- (그 경우 Postgres 로그에 WARNING으로 남는다 — Supabase 대시보드 Logs에서 확인 가능).

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

  begin
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

    if jsonb_array_length(rows) > 0 then
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
    end if;
  exception when others then
    -- 반납 할일 생성은 부가 기능이다 — 여기서 어떤 오류가 나든 본 청구는 절대 막지 않는다.
    raise warning 'create_waste_return_todo failed for billing %: %', new.id, sqlerrm;
  end;

  return new;
end;
$$;
