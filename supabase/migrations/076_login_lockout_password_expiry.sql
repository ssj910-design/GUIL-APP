-- 보안 강화 (2026-07-29) — 로그인 브루트포스 방어 + 비밀번호 6개월 주기 강제 변경.
-- 1) 5회 연속 실패 시 15분 잠금 (숫자 6자리 비번이라 시도 무제한이면 위험).
-- 2) 비번 변경(또는 최초 설정)이 6개월 지나면 must_change=true로 강제 — 기존 강제변경 화면 그대로 재사용.

alter table user_secrets add column if not exists failed_attempts int not null default 0;
alter table user_secrets add column if not exists locked_until timestamptz;

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
    return; -- 아이디 없음 또는 중복
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

-- 관리자가 비번을 1234로 초기화할 때 잠금 상태도 같이 풀어준다 (잠긴 계정 구제 목적과 겹침).
create or replace function admin_reset_password(p_admin_login_id text, p_admin_password text, p_target_id uuid)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_ok boolean;
begin
  select (s.password_hash = crypt(p_admin_password, s.password_hash))
  into v_ok
  from profiles p
  join user_secrets s on s.profile_id = p.id
  where p.login_id = p_admin_login_id
    and p.role = 'admin' and p.admin_tier = 'super'
    and coalesce(p.is_active, true) = true and p.deleted_at is null;

  if not coalesce(v_ok, false) then
    return '최고관리자 인증에 실패했습니다 (아이디/비밀번호 확인)';
  end if;

  insert into user_secrets (profile_id, password_hash, must_change, failed_attempts, locked_until)
  values (p_target_id, crypt('1234', gen_salt('bf')), true, 0, null)
  on conflict (profile_id) do update
    set password_hash = crypt('1234', gen_salt('bf')), must_change = true, updated_at = now(),
        failed_attempts = 0, locked_until = null;
  return '';
end;
$$;
