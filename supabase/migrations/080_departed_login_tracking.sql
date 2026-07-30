-- 080: 퇴사자 로그인 시도 기록 + 사직서 첨부 (2026-07-30)
-- 1) profiles.deactivated_login_attempt_at — 퇴사(is_active=false)/제외(deleted_at 있음) 계정의
--    로그인 아이디로 로그인을 시도하면 시각을 남긴다. 인사관리 > 퇴사자 목록에 표시.
-- 2) profiles.resignation_urls — 사직서 사본 첨부 (근로계약서 contract_urls와 동일한 방식).

alter table public.profiles add column if not exists deactivated_login_attempt_at timestamptz;
alter table public.profiles add column if not exists resignation_urls text[];

-- verify_login 재정의 — 076의 로직은 그대로 두고, 아이디/비번이 안 맞아 돌려줄 게 없는 경우 중
-- "퇴사·제외된 계정의 로그인 아이디"로 시도한 것이면 시각만 기록하고 그대로 실패 처리한다.
create or replace function verify_login(p_login_id text, p_password text)
returns table (id uuid, name text, role text, must_change boolean)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_id uuid;
  v_cnt int;
  v_locked_until timestamptz;
  v_must_change boolean;
  v_updated_at timestamptz;
  v_ok boolean;
  v_new_attempts int;
begin
  select count(*) into v_cnt
  from profiles p
  where p.login_id = p_login_id
    and coalesce(p.is_active, true) = true
    and p.deleted_at is null;
  if v_cnt <> 1 then
    update profiles set deactivated_login_attempt_at = now()
    where login_id = p_login_id
      and (coalesce(is_active, true) = false or deleted_at is not null);
    return; -- 아이디 없음 또는 중복 또는 퇴사·제외 계정
  end if;

  select p.id into v_id
  from profiles p
  where p.login_id = p_login_id
    and coalesce(p.is_active, true) = true
    and p.deleted_at is null;

  select s.locked_until, s.must_change, s.updated_at
  into v_locked_until, v_must_change, v_updated_at
  from user_secrets s where s.profile_id = v_id;

  if v_locked_until is not null and v_locked_until > now() then
    return; -- 잠금 중 — 5회 실패 후 15분 대기
  end if;

  select (password_hash = crypt(p_password, password_hash)) into v_ok
  from user_secrets where profile_id = v_id;

  if not coalesce(v_ok, false) then
    select failed_attempts + 1 into v_new_attempts from user_secrets where profile_id = v_id;
    if v_new_attempts >= 5 then
      update user_secrets set failed_attempts = 0, locked_until = now() + interval '15 minutes' where profile_id = v_id;
    else
      update user_secrets set failed_attempts = v_new_attempts where profile_id = v_id;
    end if;
    return; -- 비번 불일치
  end if;

  update user_secrets set failed_attempts = 0, locked_until = null where profile_id = v_id;

  return query
  select p.id, p.name, p.role,
    (coalesce(v_must_change, false) or (now() - v_updated_at > interval '6 months')) as must_change
  from profiles p
  where p.id = v_id;
end;
$$;

-- 검증
select column_name from information_schema.columns
where table_schema = 'public' and table_name = 'profiles'
  and column_name in ('deactivated_login_attempt_at', 'resignation_urls');
