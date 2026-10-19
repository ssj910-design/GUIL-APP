-- 151: 청구 취소 + 중복 청구 DB 차단 + "비용청구 후 완료" 할일 (2026-10-19)
--
-- 1) todos.billing_required — 관리자가 직접 배정한 할일을 자재지급건처럼 "비용청구를 해야 완료"로 만드는 설정.
-- 2) billings.todo_id — 청구가 어느 할일(묶음)의 청구인지. 요청 없는 할일 청구는 이걸로만 연결된다.
--    관리자 배정 묶음(todo-manual-<배치>-<순번>)은 "<배치>"까지만 저장해 한 묶음에 청구가 1건만 생기게 한다.
-- 3) 같은 자재신청/견적요청/할일에 청구는 1건만 — 부분 유니크 인덱스로 DB가 막는다(오래 열린 탭·동시
--    제출 포함). 만들기 전 중복이 없는지 확인한 값: 자재 0건, 견적 0건(2026-10-19).
-- 4) billing_cancel_log — 취소된 청구의 원본 스냅샷(사진·서명 포함)·사유·취소자.
-- 5) cancel_billing(청구id, 사유) — 기사가 잘못 낸 청구를 취소: 원본을 로그에 보관 → 청구 삭제 → 연결 할일
--    다시 열기 → 견적건 폐자재 반납 할일 삭제를 한 트랜잭션으로 처리. 기사 본인은 관리자가 처리하기 전
--    (청구서 발송·입금·폐자재 반납 확인 전)까지만, 관리자는 언제든 취소할 수 있다.
--    청구를 지우는 방식이라 청구를 읽는 기존 화면·합계·미수금 알림은 손댈 필요가 없다.

alter table public.todos add column if not exists billing_required boolean not null default false;
alter table public.billings add column if not exists todo_id text;

create unique index if not exists billings_one_per_material on public.billings (material_request_id) where material_request_id is not null;
create unique index if not exists billings_one_per_quote    on public.billings (quote_request_id)    where quote_request_id is not null;
create unique index if not exists billings_one_per_todo     on public.billings (todo_id)             where todo_id is not null;

create table if not exists public.billing_cancel_log (
  id                bigint generated always as identity primary key,
  billing_id        text not null,
  site_name         text,
  snapshot          jsonb not null,          -- 취소 시점의 billings 행 전체
  reason            text not null,
  cancelled_by      uuid references public.profiles(id) on delete set null,
  cancelled_by_name text,
  cancelled_by_role text,
  reopened_todo_ids text[],
  created_at        timestamptz not null default now()
);
create index if not exists billing_cancel_log_billing_idx on public.billing_cancel_log (billing_id);

alter table public.billing_cancel_log enable row level security;
drop policy if exists billing_cancel_log_read on public.billing_cancel_log;
create policy billing_cancel_log_read on public.billing_cancel_log
  for select using (auth.role() = 'authenticated');
-- 쓰기 정책 없음 = 클라이언트는 못 쓰고, 아래 함수(security definer)만 쓴다.

create or replace function public.cancel_billing(p_billing_id text, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid       uuid := auth.uid();
  v_prof      public.profiles%rowtype;
  b           public.billings%rowtype;
  v_is_admin  boolean;
  v_paid      boolean;
  v_waste_id  text;
  v_waste     public.todos%rowtype;
  v_ids       text[] := '{}';
  v_part      text[];
begin
  if coalesce(trim(p_reason), '') = '' then
    raise exception '취소 사유를 선택해주세요';
  end if;

  select * into v_prof from public.profiles where id = v_uid or auth_user_id = v_uid limit 1;
  if v_prof.id is null then
    raise exception '로그인이 필요합니다';
  end if;
  v_is_admin := v_prof.role = 'admin';

  select * into b from public.billings where id = p_billing_id for update;
  if not found then
    raise exception '이미 취소되었거나 없는 청구입니다. 화면을 새로고침해주세요.';
  end if;

  if not v_is_admin then
    if not (b.engineer_id = v_prof.id or (b.engineer_id is null and b.engineer = v_prof.name)) then
      raise exception '본인이 제출한 청구만 취소할 수 있습니다';
    end if;
    v_paid := b.received_date is not null
      or (case when jsonb_typeof(b.received_payments) = 'array' then jsonb_array_length(b.received_payments) else 0 end) > 0;
    if b.invoice_sent_at is not null then
      raise exception '청구서가 이미 발송된 건이에요. 관리자에게 문의해주세요.';
    end if;
    if v_paid then
      raise exception '입금이 기록된 건이에요. 관리자에게 문의해주세요.';
    end if;
  end if;

  -- 견적건 폐자재 반납 할일(청구 insert 트리거가 만든 todo-wastereturn-<청구id>) — 관리자가 확인(재고 입고)했으면 막는다.
  v_waste_id := 'todo-wastereturn-' || b.id;
  select * into v_waste from public.todos where id = v_waste_id;
  if found then
    if v_waste.stock_confirmed_at is not null
       or exists (select 1 from public.inventory_stock_movements m where m.todo_id = v_waste_id) then
      raise exception '폐자재 반납이 이미 확인된 청구는 취소할 수 없어요. 관리자에게 문의해주세요.';
    end if;
  end if;

  -- 연결 할일 다시 열기 (청구하기 목록에 다시 뜬다). 반납 할일은 제외.
  if b.material_request_id is not null then
    with u as (update public.todos set done = false
               where material_request_id = b.material_request_id and source <> 'waste_return' and done returning id)
    select coalesce(array_agg(id), '{}') into v_part from u;
    v_ids := v_ids || v_part;
  end if;
  if b.quote_request_id is not null then
    with u as (update public.todos set done = false
               where quote_request_id = b.quote_request_id and source <> 'waste_return' and done returning id)
    select coalesce(array_agg(id), '{}') into v_part from u;
    v_ids := v_ids || v_part;
  end if;
  if b.todo_id is not null then
    with u as (update public.todos set done = false
               where source <> 'waste_return' and done and (
                 id = b.todo_id
                 or regexp_replace(id, '-\d+$', '') = b.todo_id
                 or (self_check_item_id is not null
                     and self_check_item_id = (select t2.self_check_item_id from public.todos t2 where t2.id = b.todo_id))
               ) returning id)
    select coalesce(array_agg(id), '{}') into v_part from u;
    v_ids := v_ids || v_part;
  end if;

  if v_waste.id is not null then
    delete from public.todos where id = v_waste_id;
  end if;

  insert into public.billing_cancel_log
    (billing_id, site_name, snapshot, reason, cancelled_by, cancelled_by_name, cancelled_by_role, reopened_todo_ids)
  values
    (b.id, b.site_name, to_jsonb(b), trim(p_reason), v_prof.id, v_prof.name, v_prof.role, v_ids);

  delete from public.billings where id = b.id;

  return jsonb_build_object(
    'ok', true,
    'reopenedTodoIds', to_jsonb(v_ids),
    'wasteTodoDeleted', v_waste.id is not null,
    'siteName', b.site_name,
    'part', b.part,
    'engineer', b.engineer
  );
end;
$$;

revoke all on function public.cancel_billing(text, text) from public;
grant execute on function public.cancel_billing(text, text) to authenticated;

-- 검증
select column_name from information_schema.columns
where table_schema = 'public' and (
  (table_name = 'todos' and column_name = 'billing_required') or (table_name = 'billings' and column_name = 'todo_id'));
select indexname from pg_indexes where schemaname = 'public' and indexname in ('billings_one_per_material', 'billings_one_per_quote', 'billings_one_per_todo');
select proname from pg_proc where proname = 'cancel_billing';
