-- 150: todo_history — 할 일 작업내역(변경 이력) (2026-10-13)
--
-- 목적: 앱·관리자웹 할일 상세의 "작업 내역" 칸. 누가 언제 담당자·기한·내용 등을 바꿨는지,
-- 누가 완료/재오픈했는지를 시간순으로 보여준다.
--
-- 앱 코드가 아니라 DB 트리거(todos의 INSERT/UPDATE/DELETE)로 남긴다 — 이유: 할일을 바꾸는 곳이
-- 앱 핸들러·관리자웹·서버 라우트(비용청구 자동완료 등) 여러 군데라, 화면마다 로그 코드를 넣으면
-- 하나만 빠져도 이력이 새고(담당자 변경 때 assignee_id 누락 같은 어긋남의 재발 위험),
-- 트리거는 어떤 경로로 바뀌어도 빠짐없이 남긴다.
--
-- 행위자: auth.uid() → profiles.auth_user_id로 이름을 찾는다. 서버(service role)·크론이 바꾼
-- 건 auth.uid()가 없어 "시스템"으로 남는다.
-- 이력은 쓰기 정책을 일부러 열지 않았다 — 트리거(security definer)만 쓸 수 있어 앱이 위조·삭제 못 함.
-- 그룹(같은 견적/자재 요청을 공유하는 여러 담당자 행)은 화면에서 todo_id들을 묶어 조회한다.
-- 한 번의 그룹 일괄 수정은 행 수만큼 같은 문구가 남으므로 화면이 (action, summary, created_at)이
-- 같은 건 한 줄로 합쳐 보여준다.

create table if not exists public.todo_history (
  id         bigint generated always as identity primary key,
  todo_id    text not null,
  action     text not null,   -- created | assignee_changed | due_changed | edited | completed | reopened
                              -- | reassign_requested | reassign_cleared | photo_changed
  actor_id   uuid references public.profiles(id) on delete set null,
  actor_name text,            -- 행위자 이름(프로필 삭제돼도 남도록 복사해 둠). null = 시스템
  summary    text not null,   -- 화면에 그대로 보여주는 한 줄 (이름은 화면에서 굵게 처리하지 않음)
  detail     jsonb,           -- {from, to} 등 원본 값
  created_at timestamptz not null default now()
);

create index if not exists todo_history_todo_idx on public.todo_history (todo_id, created_at desc);

alter table public.todo_history enable row level security;
drop policy if exists todo_history_read on public.todo_history;
create policy todo_history_read on public.todo_history
  for select using (auth.role() = 'authenticated');
-- insert/update/delete 정책 없음 = 클라이언트는 쓸 수 없고, 아래 트리거 함수만 쓴다.

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
  -- 할 일이 삭제되면 이력도 함께 지운다(화면에서 볼 수 없는 고아 행 방지).
  if tg_op = 'DELETE' then
    delete from public.todo_history where todo_id = old.id;
    return old;
  end if;

  -- 이력 기록이 실패해도 할 일 저장 자체는 막지 않는다(운영 테이블 트리거라 안전장치).
  begin
  select p.id, p.name into v_actor_id, v_actor
  from public.profiles p
  where p.auth_user_id = auth.uid()
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

  -- UPDATE: 바뀐 것만, 종류별로 한 줄씩.
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

  if new.done is distinct from old.done then
    insert into public.todo_history (todo_id, action, actor_id, actor_name, summary)
    values (new.id, case when new.done then 'completed' else 'reopened' end, v_actor_id, v_actor,
      format('%s님이 %s했습니다.', v_who, case when new.done then '완료 처리' else '완료를 취소(재오픈)' end));
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

drop trigger if exists todos_history_trg on public.todos;
create trigger todos_history_trg
  after insert or update or delete on public.todos
  for each row execute function public.log_todo_change();

-- 기존 할 일에도 "생성" 한 줄은 보이게 채워 둔다(변경 이력은 이 시점부터 쌓임).
insert into public.todo_history (todo_id, action, actor_name, summary, created_at)
select t.id, 'created', t.requested_by_name,
       format('%s님이 %s님을 담당자로 할 일을 생성했습니다.',
              coalesce(t.requested_by_name, '시스템'), coalesce(t.assignee, '미지정')),
       t.created_at
from public.todos t
where not exists (
  select 1 from public.todo_history h where h.todo_id = t.id and h.action = 'created'
);

-- 검증
select count(*) as history_rows from public.todo_history;
select tgname from pg_trigger where tgrelid = 'public.todos'::regclass and not tgisinternal;
select policyname, cmd from pg_policies where schemaname = 'public' and tablename = 'todo_history';
