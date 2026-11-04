-- 157: todos.complete_reason — 비용청구 연계 할일을 관리자가 직접 완료할 때의 사유 (2026-11-04)
--
-- 배경: 자재·견적 할일의 정상 완료 경로는 비용청구다. 관리자는 예외로 손으로 완료할 수 있는데,
-- 그러면 청구 없이 닫힌 건이 생기고 나중에 왜 그랬는지 알 수 없다(파크뷰타워 건으로 확인).
-- 완료할 때 받은 사유를 이 컬럼에 같이 저장하고, 작업 내역(todo_history) 트리거가 그 사유를
-- 완료 기록 문구에 넣는다. 청구로 자동 완료되는 건은 사유가 없어 기존과 같은 문구가 남는다.

alter table public.todos add column if not exists complete_reason text;

-- 트리거 함수의 완료/재오픈 기록 부분만 사유를 반영하도록 다시 만든다(150의 나머지는 그대로).
create or replace function public.log_todo_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id   uuid;
  v_actor      text;
  v_who        text;
  v_fields     text[] := '{}';
  v_old_photos int;
  v_new_photos int;
begin
  if tg_op = 'DELETE' then
    delete from public.todo_history where todo_id = old.id;
    return old;
  end if;

  begin
  select p.id, p.name into v_actor_id, v_actor
  from public.profiles p
  where p.id = auth.uid() or p.auth_user_id = auth.uid()
  limit 1;
  v_who := coalesce(v_actor, '시스템');

  if tg_op = 'INSERT' then
    insert into public.todo_history (todo_id, action, actor_id, actor_name, summary)
    values (
      new.id, 'created', v_actor_id, coalesce(v_actor, new.requested_by_name),
      format('%s님이 %s님을 담당자로 할 일을 생성했습니다.',
             coalesce(v_actor, new.requested_by_name, '시스템'), coalesce(new.assignee, '미지정'))
    );
    return new;
  end if;

  if new.assignee_id is distinct from old.assignee_id or new.assignee is distinct from old.assignee then
    insert into public.todo_history (todo_id, action, actor_id, actor_name, summary, detail)
    values (new.id, 'assignee_changed', v_actor_id, v_actor,
      format('%s님이 담당자를 %s에서 %s(으)로 변경했습니다.',
             v_who, coalesce(old.assignee, '미지정'), coalesce(new.assignee, '미지정')),
      jsonb_build_object('from', old.assignee, 'to', new.assignee));
  end if;

  if new.due_date is distinct from old.due_date then
    insert into public.todo_history (todo_id, action, actor_id, actor_name, summary, detail)
    values (new.id, 'due_changed', v_actor_id, v_actor,
      format('%s님이 기한을 %s에서 %s(으)로 변경했습니다.',
             v_who, coalesce(old.due_date::text, '없음'), coalesce(new.due_date::text, '없음')),
      jsonb_build_object('from', old.due_date, 'to', new.due_date));
  end if;

  if new.title is distinct from old.title then v_fields := array_append(v_fields, '제목'::text); end if;
  if new.description is distinct from old.description then v_fields := array_append(v_fields, '내용'::text); end if;
  if new.site_name is distinct from old.site_name
     or new.elevator_no is distinct from old.elevator_no
     or new.unit_id is distinct from old.unit_id then v_fields := array_append(v_fields, '현장·호기'::text); end if;
  if new.requested_by_id is distinct from old.requested_by_id then v_fields := array_append(v_fields, '요청자'::text); end if;
  if new.assigned_date is distinct from old.assigned_date then v_fields := array_append(v_fields, '배정일'::text); end if;
  if array_length(v_fields, 1) > 0 then
    insert into public.todo_history (todo_id, action, actor_id, actor_name, summary, detail)
    values (new.id, 'edited', v_actor_id, v_actor,
      format('%s님이 %s을(를) 수정했습니다.', v_who, array_to_string(v_fields, ', ')),
      jsonb_build_object('fields', v_fields));
  end if;

  -- ★ 완료/재오픈 — 관리자가 청구 없이 직접 완료한 경우 사유(complete_reason)를 같이 남긴다.
  if new.done is distinct from old.done then
    insert into public.todo_history (todo_id, action, actor_id, actor_name, summary, detail)
    values (new.id, case when new.done then 'completed' else 'reopened' end, v_actor_id, v_actor,
      format('%s님이 %s했습니다.%s', v_who,
             case when new.done then '완료 처리' else '완료를 취소(재오픈)' end,
             case when new.done and new.complete_reason is not null
                  then ' (청구 없이 완료 — 사유: ' || new.complete_reason || ')' else '' end),
      case when new.done and new.complete_reason is not null
           then jsonb_build_object('reason', new.complete_reason) else null end);
  end if;

  if new.reassign_requested is distinct from old.reassign_requested
     and new.assignee is not distinct from old.assignee then
    if new.reassign_requested then
      insert into public.todo_history (todo_id, action, actor_id, actor_name, summary, detail)
      values (new.id, 'reassign_requested', v_actor_id, v_actor,
        format('%s님이 담당자 재배정을 요청했습니다.%s', v_who,
               case when new.reassign_reason is not null then ' (사유: ' || new.reassign_reason || ')' else '' end),
        jsonb_build_object('reason', new.reassign_reason, 'to', new.reassign_to));
    else
      insert into public.todo_history (todo_id, action, actor_id, actor_name, summary)
      values (new.id, 'reassign_cleared', v_actor_id, v_actor,
        format('%s님이 재배정 요청을 해제했습니다.', v_who));
    end if;
  end if;

  v_old_photos := coalesce(array_length(old.photo_urls, 1), 0);
  v_new_photos := coalesce(array_length(new.photo_urls, 1), 0);
  if v_old_photos <> v_new_photos then
    insert into public.todo_history (todo_id, action, actor_id, actor_name, summary, detail)
    values (new.id, 'photo_changed', v_actor_id, v_actor,
      format('%s님이 첨부파일을 %s했습니다. (%s장 → %s장)', v_who,
             case when v_new_photos > v_old_photos then '추가' else '삭제' end, v_old_photos, v_new_photos),
      jsonb_build_object('from', v_old_photos, 'to', v_new_photos));
  end if;

  exception when others then
    raise warning 'todo_history 기록 실패(todo %): %', new.id, sqlerrm;
  end;

  return new;
end;
$$;

-- 검증
select count(*) filter (where complete_reason is not null) as 사유있는완료 from public.todos;
