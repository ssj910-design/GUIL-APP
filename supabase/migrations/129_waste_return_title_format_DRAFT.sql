-- create_waste_return_todo() 제목·내용 형식 변경.
--
-- 전: title = "폐자재/여유부품 반납 — 배터리 (12V 24AH) 2EA" (품목이 제목에 다 들어감)
-- 후: title = "{현장명} 폐자재 반납" / "{현장명} 여유부품 반납" / "{현장명} 폐자재, 여유부품 반납"
--     (품목 중 반납필수(폐자재)가 있는지, 여유수량(여유부품)이 있는지에 따라 문구 결정)
--     description = 반납해야 할 실제 품목명·수량

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
  surplus numeric;
  is_waste boolean;
  has_waste boolean := false;
  has_spare boolean := false;
  desc_lines text[] := array[]::text[];
  title_suffix text;
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
        is_waste := coalesce((item->>'returnRequired')::boolean, false);
        surplus := greatest(0, coalesce((item->>'qtyTaken')::numeric, (item->>'qty')::numeric) - (item->>'qty')::numeric);
        qty_required := (case when is_waste then 1 else 0 end) + surplus;
        if is_waste then has_waste := true; end if;
        if surplus > 0 then has_spare := true; end if;
        rows := rows || jsonb_build_array(jsonb_build_object(
          'productId', item->>'partId',
          'name', item->>'name',
          'qtyRequired', qty_required,
          'qtyConfirmed', 0
        ));
        desc_lines := desc_lines || (coalesce(item->>'name', '') || ' ' || qty_required::text || 'EA');
      end if;
    end loop;

    if jsonb_array_length(rows) = 0 then
      return new;
    end if;

    title_suffix := case
      when has_waste and has_spare then '폐자재, 여유부품 반납'
      when has_waste then '폐자재 반납'
      else '여유부품 반납'
    end;

    insert into public.todos (
      id, source, title, description, site_name, elevator_no, part, assignee, assignee_id,
      assigned_date, due_date, done, quote_request_id, waste_return_rows
    ) values (
      'todo-wastereturn-' || new.id,
      'waste_return',
      new.site_name || ' ' || title_suffix,
      array_to_string(desc_lines, E'\n'),
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
  exception when others then
    raise warning 'create_waste_return_todo failed for billing %: %', new.id, sqlerrm;
  end;

  return new;
end;
$$;
