-- 로그인 인증 1단계 (2026-07-24) — 민원24 아이디 + 비밀번호.
-- Supabase Auth 대신 pgcrypto로 DB 안에서 검증한다. 이유:
--   1) 로그인 아이디가 이메일이 아니라 민원24 아이디(profiles.minwon_id)
--   2) 초기 비번 "1234"(4자)는 Supabase Auth 최소 6자 규칙에 걸려 못 씀
-- 해시는 user_secrets 테이블에만 두고 RLS로 직접 접근을 막는다(해시가 클라이언트에 절대 안 보임).
-- 검증·변경은 SECURITY DEFINER 함수로만 하며, 함수는 결과로 해시를 내보내지 않는다.
-- 이 마이그레이션은 additive다 — 앱은 아직 SKIP_LOGIN=true라 이 테이블/함수를 쓰지 않는다.

create extension if not exists pgcrypto;

create table if not exists user_secrets (
  profile_id uuid primary key references profiles(id) on delete cascade,
  password_hash text not null,
  must_change boolean not null default true,
  updated_at timestamptz not null default now()
);

-- 정책을 만들지 않는다 → anon/authenticated는 이 테이블에 직접 접근 불가.
-- 아래 SECURITY DEFINER 함수(소유자 postgres)만 RLS를 우회해 접근한다.
alter table user_secrets enable row level security;

-- 로그인 검증: 아이디(민원24 ID)로 활성 프로필을 찾아 비번 대조.
-- 아이디가 중복이면(행 2개 이상) 모호하므로 인증 실패시킨다.
create or replace function verify_login(p_login_id text, p_password text)
returns table (id uuid, name text, role text, must_change boolean)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_id uuid;
  v_cnt int;
begin
  select count(*) into v_cnt
  from profiles p
  where p.minwon_id = p_login_id
    and coalesce(p.is_active, true) = true
    and p.deleted_at is null;
  if v_cnt <> 1 then
    return; -- 아이디 없음 또는 중복 → 실패
  end if;

  select p.id into v_id
  from profiles p
  where p.minwon_id = p_login_id
    and coalesce(p.is_active, true) = true
    and p.deleted_at is null;

  return query
  select p.id, p.name, p.role, s.must_change
  from profiles p
  join user_secrets s on s.profile_id = p.id
  where p.id = v_id
    and s.password_hash = crypt(p_password, s.password_hash);
end;
$$;

-- 비밀번호 변경: 현재 비번 확인 후 새 비번으로 교체하고 must_change 해제.
-- profile_id를 클라이언트가 넘기지만 "현재 비번"을 알아야만 바꿀 수 있어 남의 비번은 못 바꾼다.
create or replace function change_password(p_profile_id uuid, p_current text, p_new text)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  ok boolean;
begin
  select (s.password_hash = crypt(p_current, s.password_hash)) into ok
  from user_secrets s where s.profile_id = p_profile_id;
  if not coalesce(ok, false) then
    return false;
  end if;
  if length(coalesce(p_new, '')) < 4 then
    return false; -- 최소 4자
  end if;
  update user_secrets
  set password_hash = crypt(p_new, gen_salt('bf')), must_change = false, updated_at = now()
  where profile_id = p_profile_id;
  return true;
end;
$$;

-- anon(익명 키)/authenticated가 이 두 함수만 실행할 수 있게 한다. 테이블 직접 접근은 여전히 막혀 있음.
revoke all on function verify_login(text, text) from public;
revoke all on function change_password(uuid, text, text) from public;
grant execute on function verify_login(text, text) to anon, authenticated;
grant execute on function change_password(uuid, text, text) to anon, authenticated;

-- 초기 비밀번호 1234 심기 — 활성 기사·관리자 전원.
-- (minwon_id가 없거나 중복인 사람도 해시는 생기지만, 로그인은 verify_login에서 막힌다.)
insert into user_secrets (profile_id, password_hash, must_change)
select p.id, crypt('1234', gen_salt('bf')), true
from profiles p
where p.role in ('engineer', 'admin')
  and coalesce(p.is_active, true) = true
  and p.deleted_at is null
on conflict (profile_id) do nothing;
